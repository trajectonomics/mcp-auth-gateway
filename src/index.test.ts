import { describe, expect, it } from "bun:test"
import { getHealthStatus, type HealthStatus, handleRequest } from "./index"

describe("Service Handler", () => {
	it("returns operational health status", () => {
		const health = getHealthStatus("test-service", Date.now())
		expect(health.status).toBe("ok")
		expect(health.service).toBe("test-service")
	})

	it("handles /health route with 200 JSON", async () => {
		const res = handleRequest("/health", "test-service", Date.now())
		expect(res.status).toBe(200)
		const body = (await res.json()) as HealthStatus
		expect(body.service).toBe("test-service")
	})

	it("returns 404 for unknown route", () => {
		const res = handleRequest("/unknown", "test-service", Date.now())
		expect(res.status).toBe(404)
	})
})
