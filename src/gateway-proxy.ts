import { readRequestBody } from "./gateway-body"
import type { GatewayFetch, GatewayUpstream } from "./gateway-handler-types"
import { buildUpstreamRequest, fetchUpstream, gatewayResponse } from "./gateway-upstream"
import {
	type JsonRpcId,
	readJsonRpcId,
	revokedRefreshTokenResponse,
	tokenFileUnusableResponse,
	upstreamFailureResponse,
} from "./jsonrpc-error"
import { TokenRefreshError } from "./token-refresh-error"
import { TokenStoreError, type TokenStoreErrorCode } from "./token-store-error"

/** Internal proxy context: the injected fetch, clock and request ceiling. */
export interface GatewayProxyContext {
	readonly fetchImpl: GatewayFetch
	readonly nowMs: () => number
	readonly maxRequestBytes: number
}

type AccessTokenResult =
	| { readonly ok: true; readonly token: string }
	| { readonly ok: false; readonly response: Response }

type UpstreamAttempt = { readonly ok: true; readonly response: Response } | { readonly ok: false }

/** Proxies one authenticated request, replaying a buffered body at most once after a 401. */
export async function proxyRequest(
	context: GatewayProxyContext,
	request: Request,
	upstream: GatewayUpstream,
): Promise<Response> {
	const buffered = await readRequestBody(request, context.maxRequestBytes)
	if (!buffered.ok) return new Response("Payload Too Large", { status: 413 })
	const id = readJsonRpcId(buffered.body)
	const initial = await accessTokenFor(context, upstream, id)
	if (!initial.ok) return initial.response
	const first = await attempt(context, request, buffered.body, upstream, initial.token)
	if (!first.ok) return upstreamFailureResponse(id)
	if (first.response.status !== 401) return gatewayResponse(first.response)
	await first.response.body?.cancel().catch(() => undefined)
	const replay = await accessTokenFor(context, upstream, id, initial.token)
	if (!replay.ok) return replay.response
	const replayed = await attempt(context, request, buffered.body, upstream, replay.token)
	return replayed.ok ? gatewayResponse(replayed.response) : upstreamFailureResponse(id)
}

async function attempt(
	context: GatewayProxyContext,
	request: Request,
	body: Uint8Array | undefined,
	upstream: GatewayUpstream,
	accessToken: string,
): Promise<UpstreamAttempt> {
	try {
		const prepared = buildUpstreamRequest(upstream.upstreamUrl, request, body, accessToken)
		return { ok: true, response: await fetchUpstream(context.fetchImpl, prepared) }
	} catch {
		return { ok: false }
	}
}

async function accessTokenFor(
	context: GatewayProxyContext,
	upstream: GatewayUpstream,
	id: JsonRpcId,
	rejectedAccessToken?: string,
): Promise<AccessTokenResult> {
	try {
		const nowMs = context.nowMs()
		const input = rejectedAccessToken === undefined ? { nowMs } : { nowMs, rejectedAccessToken }
		return { ok: true, token: await upstream.tokenManager.getAccessToken(input) }
	} catch (error) {
		return { ok: false, response: tokenFailureResponse(id, upstream, error) }
	}
}

const UNUSABLE_TOKEN_FILE_CODES = new Set<TokenStoreErrorCode>([
	"token_file_missing",
	"token_file_unreadable",
	"token_file_corrupt",
])

function tokenFailureResponse(id: JsonRpcId, upstream: GatewayUpstream, error: unknown): Response {
	if (error instanceof TokenRefreshError && error.code === "refresh_token_revoked") {
		return revokedRefreshTokenResponse(id, upstream)
	}
	if (error instanceof TokenStoreError && UNUSABLE_TOKEN_FILE_CODES.has(error.code)) {
		return tokenFileUnusableResponse(id, upstream, error.code)
	}
	return upstreamFailureResponse(id)
}
