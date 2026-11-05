const RUNBOOK_URL = "https://github.com/trajectonomics/infra/issues/3"

const REVOKED_MESSAGE =
	"Mobbin refresh token revoked. Run `bun run login:mobbin` to re-authenticate. " +
	`See the runbook at ${RUNBOOK_URL}.`

/** JSON-RPC request identifier, or null when the request carried none. */
export type JsonRpcId = string | number | null

/** Reads the JSON-RPC id from an already-buffered request body without failing the proxy. */
export function readJsonRpcId(body: Uint8Array | undefined): JsonRpcId {
	if (body === undefined || body.byteLength === 0) return null
	try {
		const value: unknown = JSON.parse(new TextDecoder().decode(body))
		if (typeof value !== "object" || value === null || Array.isArray(value)) return null
		const id = (value as Record<string, unknown>)["id"]
		return typeof id === "string" || typeof id === "number" ? id : null
	} catch {
		return null
	}
}

function jsonRpcErrorResponse(
	id: JsonRpcId,
	code: number,
	message: string,
	status = 200,
	data?: Record<string, string>,
): Response {
	const error: Record<string, unknown> = { code, message }
	if (data !== undefined) error["data"] = data
	return new Response(JSON.stringify({ jsonrpc: "2.0", id, error }), {
		status,
		headers: { "content-type": "application/json" },
	})
}

/** Builds the Runbook JSON-RPC error returned when the Refresh Token is permanently revoked. */
export function revokedRefreshTokenResponse(id: JsonRpcId): Response {
	return jsonRpcErrorResponse(id, -32001, REVOKED_MESSAGE, 200, { runbook: RUNBOOK_URL })
}

/** Builds a sanitized JSON-RPC error for an unreachable or failing Upstream. */
export function upstreamFailureResponse(id: JsonRpcId): Response {
	return jsonRpcErrorResponse(id, -32603, "Upstream MCP request failed", 502)
}
