import type { GatewayFetch } from "./gateway-handler-types"
import { sanitizeRequestHeaders, sanitizeResponseHeaders } from "./gateway-headers"

/** A prepared upstream request that can be replayed with a different Access Token. */
export interface UpstreamRequest {
	readonly url: string
	readonly method: string
	readonly headers: Headers
	readonly body: Uint8Array | undefined
}

/** Prepares an upstream request from an inbound request, its buffered body, and an Access Token. */
export function buildUpstreamRequest(
	upstreamUrl: string,
	request: Request,
	body: Uint8Array | undefined,
	accessToken: string,
): UpstreamRequest {
	const target = new URL(upstreamUrl)
	const incomingQuery = new URL(request.url).search
	if (incomingQuery.length > 0) {
		target.search =
			target.search.length > 0 ? `${target.search}&${incomingQuery.slice(1)}` : incomingQuery
	}
	return Object.freeze({
		url: target.toString(),
		method: request.method,
		headers: sanitizeRequestHeaders(request.headers, accessToken),
		body,
	})
}

/** Sends an upstream request, allowing a caller to observe the response status before forwarding. */
export async function fetchUpstream(
	fetchImpl: GatewayFetch,
	upstream: UpstreamRequest,
): Promise<Response> {
	const init: RequestInit = {
		method: upstream.method,
		headers: upstream.headers,
		redirect: "manual",
	}
	if (upstream.body !== undefined) init.body = upstream.body
	return fetchImpl(upstream.url, init)
}

/** Wraps an upstream response while passing its body stream through untouched. */
export function gatewayResponse(upstream: Response): Response {
	return new Response(upstream.body, {
		status: upstream.status,
		headers: sanitizeResponseHeaders(upstream.headers),
	})
}
