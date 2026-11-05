import type { GatewayHandlerDeps } from "./gateway-handler-types"
import { proxyRequest } from "./gateway-proxy"
import { validateGatewaySecret } from "./gateway-secret"
import type { TokenState } from "./token-state"

const HEALTH_PATHS = new Set(["/health", "/healthz"])
const PROXY_PATH = "/mobbin/mcp"
const TOKEN_HEALTH_PATH = "/health/token"

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	})
}

function unauthorized(): Response {
	return jsonResponse({ error: "unauthorized" }, 401)
}

type GatewayRoute = "health" | "token_health" | "proxy" | "not_found"

function routeFor(request: Request): GatewayRoute {
	const path = new URL(request.url).pathname
	if (request.method === "GET" && HEALTH_PATHS.has(path)) return "health"
	if (path === PROXY_PATH) return "proxy"
	if (request.method === "GET" && path === TOKEN_HEALTH_PATH) return "token_health"
	return "not_found"
}

/** Creates the HTTP Gateway handler for health, Token State, and the Auth Relay Proxy. */
export function createGatewayHandler(
	deps: GatewayHandlerDeps,
): (request: Request) => Promise<Response> {
	const fetchImpl = deps.fetchImpl ?? fetch
	const nowMs = deps.nowMs ?? Date.now
	return async function handle(request: Request): Promise<Response> {
		const route = routeFor(request)
		if (route === "health") return jsonResponse({ status: "ok" })
		if (route === "not_found") return new Response("Not Found", { status: 404 })
		if (!validateGatewaySecret(request.headers.get("authorization"), deps.gatewaySecret)) {
			return unauthorized()
		}
		if (route === "token_health") {
			return jsonResponse({ tokenState: await readTokenState(deps, nowMs) })
		}
		return proxyRequest(deps, fetchImpl, nowMs, request)
	}
}

async function readTokenState(deps: GatewayHandlerDeps, nowMs: () => number): Promise<TokenState> {
	try {
		return await deps.tokenManager.getTokenState(nowMs())
	} catch {
		return "invalid"
	}
}
