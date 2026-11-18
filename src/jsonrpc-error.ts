import { isRecord } from "./is-record"
import type { TokenStoreErrorCode } from "./token-store-error"

const RUNBOOK_URL = "https://github.com/trajectonomics/infra/issues/3"

/** JSON-RPC request identifier, or null when the request carried none. */
export type JsonRpcId = string | number | null

/** The Upstream facts an operator-facing error names. */
export interface UpstreamErrorContext {
	readonly displayName: string
	readonly tokenFile: string
	readonly loginCommand: string
}

/** Reads the JSON-RPC id from an already-buffered request body without failing the proxy. */
export function readJsonRpcId(body: Uint8Array | undefined): JsonRpcId {
	if (body === undefined || body.byteLength === 0) return null
	try {
		const value: unknown = JSON.parse(new TextDecoder().decode(body))
		if (!isRecord(value)) return null
		const id = value["id"]
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

/** Builds the JSON-RPC error returned when an Upstream's Refresh Token is permanently revoked. */
export function revokedRefreshTokenResponse(
	id: JsonRpcId,
	upstream: UpstreamErrorContext,
): Response {
	const message =
		`${upstream.displayName} refresh token revoked. ` +
		`Run \`${upstream.loginCommand}\` to re-authenticate. ` +
		`See the runbook at ${RUNBOOK_URL}.`
	return jsonRpcErrorResponse(id, -32001, message, 200, { runbook: RUNBOOK_URL })
}

/** Builds the JSON-RPC error returned when an Upstream's Token File cannot be used. */
export function tokenFileUnusableResponse(
	id: JsonRpcId,
	upstream: UpstreamErrorContext,
	code: TokenStoreErrorCode,
): Response {
	const message =
		`${upstream.displayName} Token File at "${upstream.tokenFile}" cannot be used. ` +
		`Run \`${upstream.loginCommand}\` to install it. ` +
		`See the runbook at ${RUNBOOK_URL}.`
	return jsonRpcErrorResponse(id, -32002, message, 502, { tokenFile: code })
}

/** Builds a sanitized JSON-RPC error for an unreachable or failing Upstream. */
export function upstreamFailureResponse(id: JsonRpcId): Response {
	return jsonRpcErrorResponse(id, -32603, "Upstream MCP request failed", 502)
}
