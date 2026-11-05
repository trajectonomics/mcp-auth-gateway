import { DEFAULT_MAX_REQUEST_BYTES, readRequestBody } from "./gateway-body"
import type { GatewayFetch, GatewayHandlerDeps } from "./gateway-handler-types"
import { buildUpstreamRequest, fetchUpstream, gatewayResponse } from "./gateway-upstream"
import {
	type JsonRpcId,
	readJsonRpcId,
	revokedRefreshTokenResponse,
	upstreamFailureResponse,
} from "./jsonrpc-error"
import { TokenRefreshError } from "./token-refresh-error"

/** Internal proxy context: handler boundaries plus the resolved fetch and clock. */
export interface GatewayProxyContext {
	readonly deps: GatewayHandlerDeps
	readonly fetchImpl: GatewayFetch
	readonly nowMs: () => number
}

type AccessTokenResult =
	| { readonly ok: true; readonly token: string }
	| { readonly ok: false; readonly response: Response }

type UpstreamAttempt = { readonly ok: true; readonly response: Response } | { readonly ok: false }

/** Proxies one authenticated request, replaying a buffered body at most once after a 401. */
export async function proxyRequest(
	context: GatewayProxyContext,
	request: Request,
): Promise<Response> {
	const maxBytes = context.deps.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES
	const buffered = await readRequestBody(request, maxBytes)
	if (!buffered.ok) return new Response("Payload Too Large", { status: 413 })
	const id = readJsonRpcId(buffered.body)
	const initial = await accessTokenFor(context, id)
	if (!initial.ok) return initial.response
	const upstream = await attempt(context, request, buffered.body, initial.token)
	if (!upstream.ok) return upstreamFailureResponse(id)
	if (upstream.response.status !== 401) return gatewayResponse(upstream.response)
	await upstream.response.body?.cancel().catch(() => undefined)
	const replay = await accessTokenFor(context, id, initial.token)
	if (!replay.ok) return replay.response
	const replayed = await attempt(context, request, buffered.body, replay.token)
	return replayed.ok ? gatewayResponse(replayed.response) : upstreamFailureResponse(id)
}

async function attempt(
	context: GatewayProxyContext,
	request: Request,
	body: Uint8Array | undefined,
	accessToken: string,
): Promise<UpstreamAttempt> {
	try {
		const prepared = buildUpstreamRequest(context.deps.upstreamUrl, request, body, accessToken)
		return { ok: true, response: await fetchUpstream(context.fetchImpl, prepared) }
	} catch {
		return { ok: false }
	}
}

async function accessTokenFor(
	context: GatewayProxyContext,
	id: JsonRpcId,
	rejectedAccessToken?: string,
): Promise<AccessTokenResult> {
	try {
		const nowMs = context.nowMs()
		const input = rejectedAccessToken === undefined ? { nowMs } : { nowMs, rejectedAccessToken }
		return { ok: true, token: await context.deps.tokenManager.getAccessToken(input) }
	} catch (error) {
		if (error instanceof TokenRefreshError && error.code === "refresh_token_revoked") {
			return { ok: false, response: revokedRefreshTokenResponse(id) }
		}
		return { ok: false, response: upstreamFailureResponse(id) }
	}
}
