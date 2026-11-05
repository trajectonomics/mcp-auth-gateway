import { DEFAULT_MAX_REQUEST_BYTES, readRequestBody } from "./gateway-body"
import type { GatewayFetch, GatewayHandlerDeps } from "./gateway-handler-types"
import { buildUpstreamRequest, fetchUpstream, gatewayResponse } from "./gateway-upstream"
import {
	readJsonRpcId,
	revokedRefreshTokenResponse,
	upstreamFailureResponse,
} from "./jsonrpc-error"
import { TokenRefreshError } from "./token-refresh-error"

/** Proxies one authenticated request, replaying a buffered body at most once after a 401. */
export async function proxyRequest(
	deps: GatewayHandlerDeps,
	fetchImpl: GatewayFetch,
	nowMs: () => number,
	request: Request,
): Promise<Response> {
	const buffered = await readRequestBody(request, deps.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES)
	if (!buffered.ok) return new Response("Payload Too Large", { status: 413 })
	const id = readJsonRpcId(buffered.body)
	const accessToken = await accessTokenFor(deps, nowMs, id)
	if (typeof accessToken !== "string") return accessToken
	let upstream: Response
	try {
		const prepared = buildUpstreamRequest(deps.upstreamUrl, request, buffered.body, accessToken)
		upstream = await fetchUpstream(fetchImpl, prepared)
	} catch {
		return upstreamFailureResponse(id)
	}
	if (upstream.status !== 401) return gatewayResponse(upstream)
	await upstream.body?.cancel().catch(() => undefined)
	const rotatedToken = await accessTokenFor(deps, nowMs, id, accessToken)
	if (typeof rotatedToken !== "string") return rotatedToken
	try {
		const prepared = buildUpstreamRequest(deps.upstreamUrl, request, buffered.body, rotatedToken)
		return gatewayResponse(await fetchUpstream(fetchImpl, prepared))
	} catch {
		return upstreamFailureResponse(id)
	}
}

async function accessTokenFor(
	deps: GatewayHandlerDeps,
	nowMs: () => number,
	id: string | number | null,
	rejectedAccessToken?: string,
): Promise<string | Response> {
	try {
		const input =
			rejectedAccessToken === undefined
				? { nowMs: nowMs() }
				: { nowMs: nowMs(), rejectedAccessToken }
		return await deps.tokenManager.getAccessToken(input)
	} catch (error) {
		if (error instanceof TokenRefreshError && error.code === "refresh_token_revoked") {
			return revokedRefreshTokenResponse(id)
		}
		return upstreamFailureResponse(id)
	}
}
