import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { connect, createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runBootstrapLogin } from "./bootstrap-login"
import { BootstrapLoginError } from "./errors"

const ISSUER = "https://auth.example.com/auth/v1"
const RESOURCE = "https://api.mobbin.com/mcp"
const NOW = 1_700_000_000_000

function fetchStub(
	handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): typeof fetch {
	return Object.assign(handler, { preconnect: () => undefined })
}

interface CapturedRequest {
	readonly url: string
	readonly init: RequestInit | undefined
}

function fakeFetch(requests: CapturedRequest[], tokenResponse: () => Response): typeof fetch {
	return fetchStub(async (input, init) => {
		const url = String(input)
		requests.push({ url, init })
		if (url === `${ISSUER}/oauth/clients/register`) {
			return Response.json({ client_id: "client-abc" }, { status: 201 })
		}
		if (url === `${ISSUER}/token`) return tokenResponse()
		throw new Error(`unexpected fetch: ${url}`)
	})
}

function sendCallback(port: number, params: Record<string, string>): Promise<Response> {
	const url = new URL(`http://127.0.0.1:${port}/callback`)
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
	return fetch(url)
}

function connectable(host: string, port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connect({ host, port })
		socket.once("connect", () => {
			socket.destroy()
			resolve(true)
		})
		socket.once("error", () => resolve(false))
	})
}

async function reservePort(): Promise<number> {
	const server = createServer()
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	const address = server.address()
	const port = typeof address === "object" && address ? address.port : 0
	await new Promise<void>((resolve) => server.close(() => resolve()))
	return port
}

async function loginError(promise: Promise<unknown>): Promise<BootstrapLoginError> {
	try {
		await promise
	} catch (error) {
		if (error instanceof BootstrapLoginError) return error
		throw error
	}
	throw new Error("expected Bootstrap Login to fail")
}

let directory: string

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "bootstrap-login-failure-"))
})

afterEach(async () => {
	await rm(directory, { recursive: true, force: true })
})

function deps(
	port: number,
	outPath: string,
	fetchImpl: typeof fetch,
	openBrowser: (url: string) => Promise<void>,
): Parameters<typeof runBootstrapLogin>[0] {
	return {
		fetchImpl,
		openBrowser,
		nowMs: () => NOW,
		randomBytes: (length) => new Uint8Array(length).fill(1),
		outPath,
		port,
		issuer: ISSUER,
		resource: RESOURCE,
	}
}

describe("Bootstrap Login failures", () => {
	it("rejects a state mismatch and only exchanges the real authorization code", async () => {
		const port = await reservePort()
		const outPath = join(directory, "tokens.json")
		const requests: CapturedRequest[] = []
		const fetchImpl = fakeFetch(requests, () =>
			Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 60 }),
		)
		let mismatchStatus = 0
		let tokenRequestsBeforeValid = -1
		let opener: Promise<void> | undefined
		const openBrowser = (url: string): Promise<void> => {
			opener = (async () => {
				const state = new URL(url).searchParams.get("state") ?? ""
				mismatchStatus = (await sendCallback(port, { code: "attacker", state: "wrong" })).status
				tokenRequestsBeforeValid = requests.filter((r) => r.url.endsWith("/token")).length
				const status = (await sendCallback(port, { code: "auth-code", state })).status
				expect(status).toBe(200)
			})()
			return opener
		}

		await runBootstrapLogin(deps(port, outPath, fetchImpl, openBrowser))
		await opener

		expect(mismatchStatus).toBe(400)
		expect(tokenRequestsBeforeValid).toBe(0)
		const exchange = requests.find((request) => request.url.endsWith("/token"))
		expect(new URLSearchParams(String(exchange?.init?.body)).get("code")).toBe("auth-code")
	})

	it("writes no Token File when the code exchange fails", async () => {
		const port = await reservePort()
		const outPath = join(directory, "tokens.json")
		const requests: CapturedRequest[] = []
		const fetchImpl = fakeFetch(requests, () =>
			Response.json({ error: "invalid_grant" }, { status: 400 }),
		)
		let opener: Promise<void> | undefined
		const openBrowser = (url: string): Promise<void> => {
			opener = (async () => {
				const state = new URL(url).searchParams.get("state") ?? ""
				await sendCallback(port, { code: "auth-code", state })
			})()
			return opener
		}

		const error = await loginError(runBootstrapLogin(deps(port, outPath, fetchImpl, openBrowser)))
		await opener

		expect(error.code).toBe("token_exchange_failed")
		await expect(readFile(outPath)).rejects.toMatchObject({ code: "ENOENT" })
		expect(await connectable("127.0.0.1", port)).toBe(false)
	})

	it("writes no Token File when authorization is denied", async () => {
		const port = await reservePort()
		const outPath = join(directory, "tokens.json")
		const requests: CapturedRequest[] = []
		const fetchImpl = fakeFetch(requests, () =>
			Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 60 }),
		)
		let callbackStatus = 0
		let opener: Promise<void> | undefined
		const openBrowser = (url: string): Promise<void> => {
			opener = (async () => {
				const state = new URL(url).searchParams.get("state") ?? ""
				callbackStatus = (await sendCallback(port, { error: "access_denied", state })).status
			})()
			return opener
		}

		const error = await loginError(runBootstrapLogin(deps(port, outPath, fetchImpl, openBrowser)))
		await opener

		expect(callbackStatus).toBe(400)
		expect(error.code).toBe("authorization_denied")
		expect(requests.filter((request) => request.url.endsWith("/token"))).toHaveLength(0)
		await expect(readFile(outPath)).rejects.toMatchObject({ code: "ENOENT" })
	})

	it("writes no Token File and opens no browser when Client Registration fails", async () => {
		const port = await reservePort()
		const outPath = join(directory, "tokens.json")
		let browserOpened = false
		const fetchImpl = fetchStub(async () => new Response("unavailable", { status: 503 }))
		const openBrowser = async (): Promise<void> => {
			browserOpened = true
		}

		const error = await loginError(runBootstrapLogin(deps(port, outPath, fetchImpl, openBrowser)))

		expect(error.code).toBe("client_registration_failed")
		expect(browserOpened).toBe(false)
		await expect(readFile(outPath)).rejects.toMatchObject({ code: "ENOENT" })
	})
})
