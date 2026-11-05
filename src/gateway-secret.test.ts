import { describe, expect, it } from "bun:test"
import { validateGatewaySecret } from "./gateway-secret"

const SECRET = "0123456789abcdef0123456789abcdef"

describe("Gateway Secret authentication", () => {
	it("accepts the configured Gateway Secret with a Bearer scheme", () => {
		expect(validateGatewaySecret(`Bearer ${SECRET}`, SECRET)).toBe(true)
	})

	it("accepts the Bearer scheme case-insensitively", () => {
		expect(validateGatewaySecret(`bearer ${SECRET}`, SECRET)).toBe(true)
	})

	it("rejects a wrong Gateway Secret", () => {
		expect(validateGatewaySecret(`Bearer ${SECRET}x`, SECRET)).toBe(false)
	})

	it("rejects a missing Authorization header", () => {
		expect(validateGatewaySecret(null, SECRET)).toBe(false)
	})

	it("rejects a non-Bearer scheme", () => {
		expect(validateGatewaySecret(`Basic ${SECRET}`, SECRET)).toBe(false)
	})

	it("rejects extra tokens after the Gateway Secret", () => {
		expect(validateGatewaySecret(`Bearer ${SECRET} extra`, SECRET)).toBe(false)
	})

	it("rejects an empty configured Gateway Secret", () => {
		expect(validateGatewaySecret("Bearer ", "")).toBe(false)
	})

	it("rejects secrets that differ only in length", () => {
		expect(validateGatewaySecret(`Bearer ${SECRET}`, SECRET.slice(0, -1))).toBe(false)
	})
})
