import { describe, expect, it } from "bun:test"
import { GatewayConfigError, loadGatewayConfig } from "./gateway-config"

const SECRET = "0123456789abcdef0123456789abcdef"

describe("Gateway configuration", () => {
	it("loads documented defaults", () => {
		const config = loadGatewayConfig({ GATEWAY_INTERNAL_SECRET: SECRET })

		expect(config).toEqual({
			gatewaySecret: SECRET,
			upstreamUrl: "https://api.mobbin.com/mcp",
			tokenFile: "/data/tokens.json",
			port: 8080,
			host: "127.0.0.1",
		})
		expect(Object.isFrozen(config)).toBe(true)
	})

	it("accepts explicit upstream, Token File, port, and host overrides", () => {
		const config = loadGatewayConfig({
			GATEWAY_INTERNAL_SECRET: SECRET,
			UPSTREAM_URL: "https://example.com/mcp",
			TOKEN_FILE: "/tmp/tokens.json",
			PORT: "9999",
			HOST: "0.0.0.0",
		})

		expect(config.upstreamUrl).toBe("https://example.com/mcp")
		expect(config.tokenFile).toBe("/tmp/tokens.json")
		expect(config.port).toBe(9999)
		expect(config.host).toBe("0.0.0.0")
	})

	it("refuses a missing Gateway Secret", () => {
		const caught = catchError(() => loadGatewayConfig({}))
		expect(caught.code).toBe("gateway_secret_missing")
		expect(caught.message).not.toContain(SECRET)
	})

	it("refuses an empty Gateway Secret", () => {
		const caught = catchError(() => loadGatewayConfig({ GATEWAY_INTERNAL_SECRET: "" }))
		expect(caught.code).toBe("gateway_secret_missing")
	})

	it("refuses a Gateway Secret shorter than 32 bytes", () => {
		const caught = catchError(() => loadGatewayConfig({ GATEWAY_INTERNAL_SECRET: "too-short" }))
		expect(caught.code).toBe("gateway_secret_too_short")
	})

	it("refuses an invalid port", () => {
		const caught = catchError(() =>
			loadGatewayConfig({ GATEWAY_INTERNAL_SECRET: SECRET, PORT: "not-a-port" }),
		)
		expect(caught.code).toBe("port_invalid")
	})
})

function catchError(run: () => unknown): GatewayConfigError {
	try {
		run()
	} catch (error) {
		if (error instanceof GatewayConfigError) return error
		throw error
	}
	throw new Error("expected loadGatewayConfig to throw")
}
