/**
 * Service handler for @trajectonomics/mcp-auth-gateway.
 */

export interface HealthStatus {
	readonly status: "ok" | "degraded"
	readonly service: string
	readonly uptimeSeconds: number
}

export function getHealthStatus(serviceName: string, startTime: number): HealthStatus {
	return Object.freeze({
		status: "ok",
		service: serviceName,
		uptimeSeconds: Math.max(0, Math.floor((Date.now() - startTime) / 1000)),
	})
}

export function handleRequest(urlPath: string, serviceName: string, startTime: number): Response {
	if (urlPath === "/health" || urlPath === "/healthz") {
		const body = JSON.stringify(getHealthStatus(serviceName, startTime))
		return new Response(body, {
			status: 200,
			headers: { "content-type": "application/json" },
		})
	}
	return new Response("Not Found", { status: 404 })
}
