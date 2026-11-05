import { describe, expect, it } from "bun:test"
import { connect } from "node:net"
import { networkInterfaces } from "node:os"
import { type CallbackServer, startCallbackServer } from "./callback-server"
import { BootstrapLoginError } from "./errors"

function callbackUrl(server: CallbackServer, params: Record<string, string>): string {
	const url = new URL(server.redirectUri)
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
	return url.toString()
}

function connectable(host: string, port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connect({ host, port })
		socket.once("connect", () => {
			socket.destroy()
			resolve(true)
		})
		socket.once("error", () => resolve(false))
	})
}

function nonLoopbackIPv4(): string | undefined {
	for (const entries of Object.values(networkInterfaces())) {
		for (const entry of entries ?? []) {
			if (entry.family === "IPv4" && !entry.internal) return entry.address
		}
	}
	return undefined
}

async function settle(server: CallbackServer): Promise<unknown> {
	try {
		return await server.waitForCode()
	} catch (error) {
		return error
	}
}

describe("Loopback callback server", () => {
	it("captures the authorization code and responds with a completion page", async () => {
		const server = startCallbackServer({ port: 0, state: "state-xyz" })
		try {
			const response = await fetch(callbackUrl(server, { code: "auth-code", state: "state-xyz" }))

			expect(response.status).toBe(200)
			expect(await response.text()).toContain("Bootstrap Login complete")
			expect(await server.waitForCode()).toBe("auth-code")
		} finally {
			await server.stop()
		}
	})

	it("rejects a state mismatch with 400 and keeps waiting for the real callback", async () => {
		const server = startCallbackServer({ port: 0, state: "state-xyz" })
		let settled = false
		const waiting = server.waitForCode().finally(() => {
			settled = true
		})
		try {
			const mismatch = await fetch(
				callbackUrl(server, { code: "attacker-code", state: "wrong-state" }),
			)

			expect(mismatch.status).toBe(400)
			expect(settled).toBe(false)

			const valid = await fetch(callbackUrl(server, { code: "auth-code", state: "state-xyz" }))
			expect(valid.status).toBe(200)
			expect(await waiting).toBe("auth-code")
		} finally {
			await server.stop()
		}
	})

	it("reports an authorization denial without capturing a code", async () => {
		const server = startCallbackServer({ port: 0, state: "state-xyz" })
		const waiting = settle(server)
		try {
			const response = await fetch(
				callbackUrl(server, {
					error: "access_denied",
					error_description: "operator cancelled",
					state: "state-xyz",
				}),
			)

			expect(response.status).toBe(400)
			const error = await waiting
			expect(error).toBeInstanceOf(BootstrapLoginError)
			expect((error as BootstrapLoginError).code).toBe("authorization_denied")
		} finally {
			await server.stop()
		}
	})

	it("binds 127.0.0.1 only and releases the port on stop", async () => {
		const server = startCallbackServer({ port: 0, state: "state-xyz" })
		const port = Number(new URL(server.redirectUri).port)
		const external = nonLoopbackIPv4()
		try {
			expect(await connectable("127.0.0.1", port)).toBe(true)
			if (external) expect(await connectable(external, port)).toBe(false)
		} finally {
			await server.stop()
		}

		expect(await connectable("127.0.0.1", port)).toBe(false)
	})

	it("does not answer paths other than GET /callback", async () => {
		const server = startCallbackServer({ port: 0, state: "state-xyz" })
		try {
			const wrongPath = await fetch(new URL("/other", server.redirectUri))
			const wrongMethod = await fetch(server.redirectUri, { method: "POST" })

			expect(wrongPath.status).toBe(404)
			expect(wrongMethod.status).toBe(404)
		} finally {
			await server.stop()
		}
	})
})
