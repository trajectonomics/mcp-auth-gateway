import { describe, expect, it } from "bun:test"
import { createGatewayHandler } from "./gateway-handler"
import type { GatewayFetch } from "./gateway-handler-types"
import type { TokenManager } from "./token-manager"

const SECRET = "0123456789abcdef0123456789abcdef"
const UPSTREAM_URL = "https://upstream.example.com/mcp"

const tokenManager: TokenManager = Object.freeze({
	async getAccessToken(): Promise<string> {
		return "access-token"
	},
	async getTokenState(): Promise<"valid"> {
		return "valid"
	},
})

interface UpstreamCall {
	readonly url: string
	readonly init: RequestInit
}

function proxyWith(
	respond: (call: UpstreamCall) => Response | Promise<Response>,
	upstreamUrl = UPSTREAM_URL,
): (request: Request) => Promise<Response> {
	const fetchImpl: GatewayFetch = async (input, init) => {
		return respond({ url: String(input), init: init ?? {} })
	}
	return createGatewayHandler({
		gatewaySecret: SECRET,
		tokenManager,
		upstreamUrl,
		fetchImpl,
		nowMs: () => 1_700_000_000_000,
	})
}

function authorized(request: Request): Request {
	request.headers.set("authorization", `Bearer ${SECRET}`)
	return request
}

describe("Auth Relay Proxy request forwarding", () => {
	it("forwards method, query, body, and sanitized headers with the Access Token", async () => {
		let call: UpstreamCall | undefined
		const handle = proxyWith((upstreamCall) => {
			call = upstreamCall
			return new Response("ok")
		})
		const request = authorized(
			new Request("http://gateway.test/mobbin/mcp?session=abc", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: "session=secret",
					"x-forwarded-for": "203.0.113.9",
					"x-forwarded-proto": "https",
					connection: "keep-alive, x-remove-me",
					"proxy-connection": "keep-alive",
					"x-remove-me": "hop-by-hop",
					"x-keep-me": "yes",
				},
				body: '{"jsonrpc":"2.0","id":7,"method":"tools/list"}',
			}),
		)

		const response = await handle(request)

		expect(response.status).toBe(200)
		expect(call?.url).toBe("https://upstream.example.com/mcp?session=abc")
		expect(call?.init.method).toBe("POST")
		expect(new TextDecoder().decode(call?.init.body as Uint8Array)).toBe(
			'{"jsonrpc":"2.0","id":7,"method":"tools/list"}',
		)
		const headers = new Headers(call?.init.headers)
		expect(headers.get("authorization")).toBe("Bearer access-token")
		expect(headers.get("content-type")).toBe("application/json")
		expect(headers.get("cookie")).toBeNull()
		expect(headers.get("x-forwarded-for")).toBeNull()
		expect(headers.get("x-forwarded-proto")).toBeNull()
		expect(headers.get("connection")).toBeNull()
		expect(headers.get("proxy-connection")).toBeNull()
		expect(headers.get("x-remove-me")).toBeNull()
		expect(headers.get("x-keep-me")).toBe("yes")
	})

	it("appends the incoming query string to a configured upstream query", async () => {
		let call: UpstreamCall | undefined
		const handle = proxyWith((upstreamCall) => {
			call = upstreamCall
			return new Response("ok")
		}, "https://upstream.example.com/mcp?base=1")

		await handle(authorized(new Request("http://gateway.test/mobbin/mcp?session=abc")))

		expect(call?.url).toBe("https://upstream.example.com/mcp?base=1&session=abc")
	})

	it("strips upstream framing and authentication headers from the response", async () => {
		const handle = proxyWith(
			() =>
				new Response("upstream-body", {
					status: 201,
					headers: {
						"content-type": "application/json",
						"content-encoding": "gzip",
						"content-length": "13",
						"www-authenticate": 'Bearer realm="mobbin"',
						connection: "keep-alive, x-upstream-hop",
						"proxy-connection": "keep-alive",
						"x-upstream-hop": "remove",
						"x-upstream-keep": "keep",
					},
				}),
		)

		const response = await handle(authorized(new Request("http://gateway.test/mobbin/mcp")))

		expect(response.status).toBe(201)
		expect(await response.text()).toBe("upstream-body")
		expect(response.headers.get("content-type")).toBe("application/json")
		expect(response.headers.get("content-encoding")).toBeNull()
		expect(response.headers.get("content-length")).toBeNull()
		expect(response.headers.get("www-authenticate")).toBeNull()
		expect(response.headers.get("connection")).toBeNull()
		expect(response.headers.get("proxy-connection")).toBeNull()
		expect(response.headers.get("x-upstream-hop")).toBeNull()
		expect(response.headers.get("x-upstream-keep")).toBe("keep")
	})

	it("preserves a bodyless upstream status", async () => {
		const handle = proxyWith(() => new Response(null, { status: 204 }))

		const response = await handle(
			authorized(new Request("http://gateway.test/mobbin/mcp", { method: "DELETE" })),
		)

		expect(response.status).toBe(204)
		expect(await response.text()).toBe("")
	})
})
