/** Token File path inside the container volume. */
export const DEFAULT_TOKEN_FILE = "/data/tokens.json"

/** Upstream MCP server the Auth Relay Proxy forwards to. */
export const DEFAULT_UPSTREAM_URL = "https://api.mobbin.com/mcp"

/** Authorization server issuer used by the Bootstrap Login. */
export const DEFAULT_ISSUER = "https://ujasntkfphywizsdaapi.supabase.co/auth/v1"

/** OAuth resource indicator for Upstream requests; the resource is the MCP endpoint. */
export const DEFAULT_RESOURCE: string = DEFAULT_UPSTREAM_URL
