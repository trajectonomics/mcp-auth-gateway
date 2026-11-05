import { describe, expect, it } from "bun:test"
import { createGatewayHandler } from "./gateway-handler"
import type { TokenManager } from "./token-manager"

const SECRET = "0123456789abcdef0123456789abcdef"

const tokenManager: TokenManager = Object.freeze({
	async getAccessToken(): Promise<string> {
		return "access-token"
	},
	async getTokenState(): Promise<"valid"> {
		return "valid"
	},
})

function streamingUpstream(): Response {
	const encoder = new TextEncoder()
	const body = new ReadableStream<Uint8Array>({
		async start(controller) {
			controller.enqueue(encoder.encode("data: one\n\n"))
			await Bun.sleep(50)
			controller.enqueue(encoder.encode("data: two\n\n"))
			controller.close()
		},
	})
	return new Response(body, {
		headers: {
			"content-type": "text/event-stream",
			"content-encoding": "gzip",
			"content-length": "999",
		},
	})
}

describe("unbuffered response streaming", () => {
	it("forwards the first upstream chunk before the stream finishes", async () => {
		const handle = createGatewayHandler({
			gatewaySecret: SECRET,
			tokenManager,
			upstreamUrl: "https://upstream.example.com/mcp",
			fetchImpl: async () => streamingUpstream(),
			nowMs: () => 1_700_000_000_000,
		})
		const response = await handle(
			new Request("http://gateway.test/mobbin/mcp", {
				headers: { authorization: `Bearer ${SECRET}` },
			}),
		)
		const reader = response.body?.getReader()
		if (reader === undefined) throw new Error("expected a response body")

		expect(response.headers.get("content-length")).toBeNull()
		expect(response.headers.get("content-encoding")).toBeNull()
		expect(response.headers.get("content-type")).toBe("text/event-stream")

		const first = await reader.read()
		expect(new TextDecoder().decode(first.value)).toBe("data: one\n\n")

		let secondResolved = false
		const secondPromise = reader.read().then((result) => {
			secondResolved = true
			return result
		})
		await Bun.sleep(10)
		expect(secondResolved).toBe(false)

		const second = await secondPromise
		expect(new TextDecoder().decode(second.value)).toBe("data: two\n\n")
		expect((await reader.read()).done).toBe(true)
	})
})
