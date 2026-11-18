import { describe, expect, it } from "bun:test"
import type { UpstreamConfig } from "./defaults"
import { type GatewayConfig, GatewayConfigError, loadGatewayConfig } from "./gateway-config"

const SECRET = "0123456789abcdef0123456789abcdef"

function upstream(config: GatewayConfig, name: string): UpstreamConfig {
	const found = config.upstreams.find((candidate) => candidate.name === name)
	if (found === undefined) throw new Error(`expected an Upstream named ${name}`)
	return found
}

describe("Gateway configuration", () => {
	it("loads both Upstreams with their documented defaults", () => {
		const config = loadGatewayConfig({ GATEWAY_INTERNAL_SECRET: SECRET })

		expect(config.gatewaySecret).toBe(SECRET)
		expect(config.port).toBe(8080)
		expect(config.host).toBe("127.0.0.1")
		expect(config.upstreams).toEqual([
			{
				name: "mobbin",
				displayName: "Mobbin",
				route: "/mobbin/mcp",
				upstreamUrl: "https://api.mobbin.com/mcp",
				issuer: "https://ujasntkfphywizsdaapi.supabase.co/auth/v1",
				resource: "https://api.mobbin.com/mcp",
				tokenFile: "/data/tokens.json",
				loginCommand: "bun run login:mobbin",
			},
			{
				name: "posthog",
				displayName: "PostHog",
				route: "/posthog/mcp",
				upstreamUrl: "https://mcp.posthog.com/mcp",
				issuer: "https://oauth.posthog.com",
				resource: "https://mcp.posthog.com/mcp",
				tokenFile: "/data/posthog-tokens.json",
				loginCommand: "bun run login:posthog",
			},
		])
	})

	it("freezes the Upstream list and each Upstream", () => {
		const config = loadGatewayConfig({ GATEWAY_INTERNAL_SECRET: SECRET })

		expect(Object.isFrozen(config)).toBe(true)
		expect(Object.isFrozen(config.upstreams)).toBe(true)
		for (const entry of config.upstreams) expect(Object.isFrozen(entry)).toBe(true)
	})

	it("applies each prefixed override to its own Upstream only", () => {
		const config = loadGatewayConfig({
			GATEWAY_INTERNAL_SECRET: SECRET,
			MOBBIN_UPSTREAM_URL: "https://mobbin.example.com/mcp",
			MOBBIN_TOKEN_FILE: "/data/other-mobbin.json",
			POSTHOG_UPSTREAM_URL: "https://posthog.example.com/mcp",
			POSTHOG_ISSUER: "https://auth.posthog.example.com",
			POSTHOG_RESOURCE: "https://posthog.example.com/mcp",
			POSTHOG_TOKEN_FILE: "/data/other-posthog.json",
		})

		expect(upstream(config, "mobbin")).toEqual({
			name: "mobbin",
			displayName: "Mobbin",
			route: "/mobbin/mcp",
			upstreamUrl: "https://mobbin.example.com/mcp",
			issuer: "https://ujasntkfphywizsdaapi.supabase.co/auth/v1",
			resource: "https://api.mobbin.com/mcp",
			tokenFile: "/data/other-mobbin.json",
			loginCommand: "bun run login:mobbin",
		})
		expect(upstream(config, "posthog")).toEqual({
			name: "posthog",
			displayName: "PostHog",
			route: "/posthog/mcp",
			upstreamUrl: "https://posthog.example.com/mcp",
			issuer: "https://auth.posthog.example.com",
			resource: "https://posthog.example.com/mcp",
			tokenFile: "/data/other-posthog.json",
			loginCommand: "bun run login:posthog",
		})
	})

	it("no longer reads the un-prefixed Upstream or Token File names", () => {
		const config = loadGatewayConfig({
			GATEWAY_INTERNAL_SECRET: SECRET,
			UPSTREAM_URL: "https://legacy.example.com/mcp",
			TOKEN_FILE: "/data/legacy.json",
		})

		expect(upstream(config, "mobbin").upstreamUrl).toBe("https://api.mobbin.com/mcp")
		expect(upstream(config, "mobbin").tokenFile).toBe("/data/tokens.json")
	})

	it("keeps the default for an empty prefixed override", () => {
		const config = loadGatewayConfig({
			GATEWAY_INTERNAL_SECRET: SECRET,
			POSTHOG_UPSTREAM_URL: "",
			POSTHOG_TOKEN_FILE: "",
		})

		expect(upstream(config, "posthog").upstreamUrl).toBe("https://mcp.posthog.com/mcp")
		expect(upstream(config, "posthog").tokenFile).toBe("/data/posthog-tokens.json")
	})

	it("accepts explicit port and host overrides", () => {
		const config = loadGatewayConfig({
			GATEWAY_INTERNAL_SECRET: SECRET,
			PORT: "9999",
			HOST: "127.0.0.2",
		})

		expect(config.port).toBe(9999)
		expect(config.host).toBe("127.0.0.2")
	})

	it("falls back to loopback for an empty host", () => {
		const config = loadGatewayConfig({ GATEWAY_INTERNAL_SECRET: SECRET, HOST: "" })

		expect(config.host).toBe("127.0.0.1")
	})

	it("refuses a wildcard host", () => {
		for (const host of ["0.0.0.0", "::", "[::]"]) {
			const caught = catchError(() =>
				loadGatewayConfig({ GATEWAY_INTERNAL_SECRET: SECRET, HOST: host }),
			)
			expect(caught.code).toBe("host_invalid")
		}
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
