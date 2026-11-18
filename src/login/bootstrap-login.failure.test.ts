import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
	type CapturedRequest,
	connectable,
	fakeAuthorizationServer,
	fetchStub,
	loginDeps,
	reservePort,
	sendCallback,
} from "../testing/login-fixtures"
import { runBootstrapLogin } from "./bootstrap-login"
import { BootstrapLoginError } from "./errors"
import { authorizationServerMetadataUrls } from "./metadata-urls"

const ISSUER = "https://auth.example.com/auth/v1"
const RESOURCE = "https://api.mobbin.com/mcp"
const METADATA = {
	issuer: ISSUER,
	authorization_endpoint: `${ISSUER}/oauth/authorize`,
	token_endpoint: `${ISSUER}/oauth/token`,
	registration_endpoint: `${ISSUER}/oauth/clients/register`,
}
const METADATA_URLS = authorizationServerMetadataUrls(ISSUER)

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

function server(requests: CapturedRequest[], tokenResponse?: () => Response): typeof fetch {
	return fakeAuthorizationServer({
		metadataUrls: METADATA_URLS,
		metadata: METADATA,
		registrationEndpoint: METADATA.registration_endpoint,
		tokenEndpoint: METADATA.token_endpoint,
		requests,
		...(tokenResponse === undefined ? {} : { tokenResponse }),
	})
}

describe("Bootstrap Login failures", () => {
	it("rejects a state mismatch and only exchanges the real authorization code", async () => {
		const port = await reservePort()
		const outPath = join(directory, "tokens.json")
		const requests: CapturedRequest[] = []
		let mismatchStatus = 0
		let tokenRequestsBeforeValid = -1
		let opener: Promise<void> | undefined
		const openBrowser = (url: string): Promise<void> => {
			opener = (async () => {
				const state = new URL(url).searchParams.get("state") ?? ""
				mismatchStatus = (await sendCallback(port, { code: "attacker", state: "wrong" })).status
				tokenRequestsBeforeValid = requests.filter((r) => r.url === METADATA.token_endpoint).length
				expect((await sendCallback(port, { code: "auth-code", state })).status).toBe(200)
			})()
			return opener
		}

		await runBootstrapLogin(
			loginDeps({
				port,
				outPath,
				fetchImpl: server(requests),
				openBrowser,
				issuer: ISSUER,
				resource: RESOURCE,
			}),
		)
		await opener

		expect(mismatchStatus).toBe(400)
		expect(tokenRequestsBeforeValid).toBe(0)
		const exchange = requests.find((request) => request.url === METADATA.token_endpoint)
		expect(new URLSearchParams(String(exchange?.init?.body)).get("code")).toBe("auth-code")
	})

	it("writes no Token File when the code exchange fails", async () => {
		const port = await reservePort()
		const outPath = join(directory, "tokens.json")
		const requests: CapturedRequest[] = []
		const fetchImpl = server(requests, () =>
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

		const error = await loginError(
			runBootstrapLogin(
				loginDeps({ port, outPath, fetchImpl, openBrowser, issuer: ISSUER, resource: RESOURCE }),
			),
		)
		await opener

		expect(error.code).toBe("token_exchange_failed")
		await expect(readFile(outPath)).rejects.toMatchObject({ code: "ENOENT" })
		expect(await connectable("127.0.0.1", port)).toBe(false)
	})

	it("writes no Token File when authorization is denied", async () => {
		const port = await reservePort()
		const outPath = join(directory, "tokens.json")
		const requests: CapturedRequest[] = []
		let callbackStatus = 0
		let opener: Promise<void> | undefined
		const openBrowser = (url: string): Promise<void> => {
			opener = (async () => {
				const state = new URL(url).searchParams.get("state") ?? ""
				callbackStatus = (await sendCallback(port, { error: "access_denied", state })).status
			})()
			return opener
		}

		const error = await loginError(
			runBootstrapLogin(
				loginDeps({
					port,
					outPath,
					fetchImpl: server(requests),
					openBrowser,
					issuer: ISSUER,
					resource: RESOURCE,
				}),
			),
		)
		await opener

		expect(callbackStatus).toBe(400)
		expect(error.code).toBe("authorization_denied")
		expect(requests.filter((request) => request.url === METADATA.token_endpoint)).toHaveLength(0)
		await expect(readFile(outPath)).rejects.toMatchObject({ code: "ENOENT" })
	})

	it("writes no Token File and opens no browser when Client Registration fails", async () => {
		const port = await reservePort()
		const outPath = join(directory, "tokens.json")
		const requests: CapturedRequest[] = []
		const fetchImpl = fakeAuthorizationServer({
			metadataUrls: METADATA_URLS,
			metadata: METADATA,
			registrationEndpoint: METADATA.registration_endpoint,
			tokenEndpoint: METADATA.token_endpoint,
			requests,
			registrationResponse: () => new Response("unavailable", { status: 503 }),
		})
		let browserOpened = false
		const openBrowser = async (): Promise<void> => {
			browserOpened = true
		}

		const error = await loginError(
			runBootstrapLogin(
				loginDeps({ port, outPath, fetchImpl, openBrowser, issuer: ISSUER, resource: RESOURCE }),
			),
		)

		expect(error.code).toBe("client_registration_failed")
		expect(browserOpened).toBe(false)
		await expect(readFile(outPath)).rejects.toMatchObject({ code: "ENOENT" })
	})

	it("writes no Token File and opens no browser when the metadata is unavailable", async () => {
		const port = await reservePort()
		const outPath = join(directory, "tokens.json")
		const fetchImpl = fetchStub(async () => new Response("unavailable", { status: 500 }))
		let browserOpened = false
		const openBrowser = async (): Promise<void> => {
			browserOpened = true
		}

		const error = await loginError(
			runBootstrapLogin(
				loginDeps({ port, outPath, fetchImpl, openBrowser, issuer: ISSUER, resource: RESOURCE }),
			),
		)

		expect(error.code).toBe("metadata_unavailable")
		expect(browserOpened).toBe(false)
		await expect(readFile(outPath)).rejects.toMatchObject({ code: "ENOENT" })
	})
})
