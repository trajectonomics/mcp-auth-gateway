import { connect, createServer } from "node:net"
import type { BootstrapLoginDeps } from "../login/bootstrap-login"

/** A request captured by a test fetch boundary. */
export interface CapturedRequest {
	readonly url: string
	readonly init: RequestInit | undefined
}

/** Test fixture: a typed fetch whose `preconnect` no-op keeps the boundary's shape. */
export function fetchStub(
	handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): typeof fetch {
	return Object.assign(handler, { preconnect: () => undefined })
}

/** Test fixture inputs for a fake authorization server. */
export interface FakeAuthorizationServerOptions {
	readonly metadataUrls: readonly string[]
	readonly metadata: Record<string, unknown>
	readonly registrationEndpoint: string
	readonly tokenEndpoint: string
	readonly requests: CapturedRequest[]
	readonly clientId?: string
	readonly registrationResponse?: () => Response
	readonly tokenResponse?: () => Response
}

/** Test fixture: an authorization server answering metadata, registration and token exchange. */
export function fakeAuthorizationServer(options: FakeAuthorizationServerOptions): typeof fetch {
	return fetchStub(async (input, init) => {
		const url = String(input)
		options.requests.push({ url, init })
		if (options.metadataUrls.includes(url)) return Response.json(options.metadata)
		if (url === options.registrationEndpoint) {
			return (
				options.registrationResponse?.() ??
				Response.json({ client_id: "client-abc" }, { status: 201 })
			)
		}
		if (url === options.tokenEndpoint) {
			return (
				options.tokenResponse?.() ??
				Response.json({
					access_token: "access-token",
					refresh_token: "refresh-token",
					expires_in: 3600,
				})
			)
		}
		throw new Error(`unexpected fetch: ${url}`)
	})
}

/** Test fixture: sends a callback request to a loopback callback server. */
export function sendCallback(port: number, params: Record<string, string>): Promise<Response> {
	const url = new URL(`http://127.0.0.1:${port}/callback`)
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
	return fetch(url)
}

/** Test fixture: whether a loopback port still accepts connections. */
export function connectable(host: string, port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connect({ host, port })
		socket.once("connect", () => {
			socket.destroy()
			resolve(true)
		})
		socket.once("error", () => resolve(false))
	})
}

/** Test fixture: a free loopback port for the callback server. */
export async function reservePort(): Promise<number> {
	const server = createServer()
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	const address = server.address()
	const port = typeof address === "object" && address ? address.port : 0
	await new Promise<void>((resolve) => server.close(() => resolve()))
	return port
}

/** Test fixture: Bootstrap Login dependencies for one Upstream. */
export function loginDeps(options: {
	readonly port: number
	readonly outPath: string
	readonly fetchImpl: typeof fetch
	readonly openBrowser: (url: string) => Promise<void>
	readonly issuer: string
	readonly resource: string
}): BootstrapLoginDeps {
	return {
		fetchImpl: options.fetchImpl,
		openBrowser: options.openBrowser,
		nowMs: () => 1_700_000_000_000,
		randomBytes: (length) => new Uint8Array(length).fill(1),
		outPath: options.outPath,
		port: options.port,
		issuer: options.issuer,
		resource: options.resource,
	}
}
