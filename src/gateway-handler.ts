import { DEFAULT_MAX_REQUEST_BYTES } from "./gateway-body"
import type { GatewayHandlerDeps, GatewayUpstream } from "./gateway-handler-types"
import { type GatewayProxyContext, proxyRequest } from "./gateway-proxy"
import { resolveGatewayRoute } from "./gateway-routes"
import { validateGatewaySecret } from "./gateway-secret"
import type { TokenState } from "./token-state"

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	})
}

function unauthorized(): Response {
	return jsonResponse({ error: "unauthorized" }, 401)
}

interface TokenStateReport {
	readonly tokenState: TokenState
}

/** Creates the HTTP Gateway handler for health, Token State, and the Auth Relay Proxy. */
export function createGatewayHandler(
	deps: GatewayHandlerDeps,
): (request: Request) => Promise<Response> {
	const context: GatewayProxyContext = {
		fetchImpl: deps.fetchImpl ?? fetch,
		nowMs: deps.nowMs ?? Date.now,
		maxRequestBytes: deps.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES,
	}
	return async function handle(request: Request): Promise<Response> {
		const route = resolveGatewayRoute(request, deps.upstreams)
		if (route.kind === "health") return jsonResponse({ status: "ok" })
		if (route.kind === "not_found") return new Response("Not Found", { status: 404 })
		if (!validateGatewaySecret(request.headers.get("authorization"), deps.gatewaySecret)) {
			return unauthorized()
		}
		if (route.kind === "token_health") {
			return jsonResponse({ upstreams: await readTokenStates(deps.upstreams, context.nowMs) })
		}
		return proxyRequest(context, request, route.upstream)
	}
}

async function readTokenStates(
	upstreams: readonly GatewayUpstream[],
	nowMs: () => number,
): Promise<Record<string, TokenStateReport>> {
	const reports = await Promise.all(
		upstreams.map(async (upstream): Promise<[string, TokenStateReport]> => {
			return [upstream.name, { tokenState: await readTokenState(upstream, nowMs) }]
		}),
	)
	return Object.fromEntries(reports)
}

async function readTokenState(upstream: GatewayUpstream, nowMs: () => number): Promise<TokenState> {
	try {
		return await upstream.tokenManager.getTokenState(nowMs())
	} catch {
		return "invalid"
	}
}
