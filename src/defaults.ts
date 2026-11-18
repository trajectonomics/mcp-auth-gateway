/** Settings the Gateway and the Bootstrap Login need for one Upstream. */
export interface UpstreamConfig {
	/** Lowercase identifier: the environment prefix and the Token State key. */
	readonly name: string
	/** Operator-facing name used in error messages. */
	readonly displayName: string
	/** Path the Auth Relay Proxy serves for this Upstream. */
	readonly route: string
	/** Upstream MCP server the Auth Relay Proxy forwards to. */
	readonly upstreamUrl: string
	/** Authorization server issuer the Bootstrap Login starts from. */
	readonly issuer: string
	/** OAuth resource indicator for Upstream requests. */
	readonly resource: string
	/** Token File path inside the container volume. */
	readonly tokenFile: string
	/** Command that performs this Upstream's Bootstrap Login. */
	readonly loginCommand: string
}

/** Documented defaults for Mobbin. */
export const MOBBIN_DEFAULTS: UpstreamConfig = Object.freeze({
	name: "mobbin",
	displayName: "Mobbin",
	route: "/mobbin/mcp",
	upstreamUrl: "https://api.mobbin.com/mcp",
	issuer: "https://ujasntkfphywizsdaapi.supabase.co/auth/v1",
	resource: "https://api.mobbin.com/mcp",
	tokenFile: "/data/tokens.json",
	loginCommand: "bun run login:mobbin",
})

/** Documented defaults for PostHog. */
export const POSTHOG_DEFAULTS: UpstreamConfig = Object.freeze({
	name: "posthog",
	displayName: "PostHog",
	route: "/posthog/mcp",
	upstreamUrl: "https://mcp.posthog.com/mcp",
	issuer: "https://oauth.posthog.com",
	resource: "https://mcp.posthog.com/mcp",
	tokenFile: "/data/posthog-tokens.json",
	loginCommand: "bun run login:posthog",
})

/** The Upstreams the Gateway fronts, in route-table order. */
export const UPSTREAM_DEFAULTS: readonly UpstreamConfig[] = Object.freeze([
	MOBBIN_DEFAULTS,
	POSTHOG_DEFAULTS,
])
