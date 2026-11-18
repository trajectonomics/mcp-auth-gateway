import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
	type CapturedRequest,
	connectable,
	fakeAuthorizationServer,
	loginDeps,
	reservePort,
	sendCallback,
} from "../testing/login-fixtures"
import { parseTokenFile } from "../token-file"
import { runBootstrapLogin } from "./bootstrap-login"
import { authorizationServerMetadataUrls } from "./discovery"
import { createCodeChallenge } from "./pkce"

const ISSUER = "https://auth.example.com/auth/v1"
const RESOURCE = "https://api.mobbin.com/mcp"
const NOW = 1_700_000_000_000
const METADATA = {
	issuer: ISSUER,
	authorization_endpoint: `${ISSUER}/oauth/authorize`,
	token_endpoint: `${ISSUER}/oauth/token`,
	registration_endpoint: `${ISSUER}/oauth/clients/register`,
}

let directory: string

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "bootstrap-login-"))
})

afterEach(async () => {
	await rm(directory, { recursive: true, force: true })
})

describe("Bootstrap Login", () => {
	it("writes a Token File after a complete S256 PKCE login through discovered endpoints", async () => {
		const port = await reservePort()
		const outPath = join(directory, "data", "tokens.json")
		const requests: CapturedRequest[] = []
		const fetchImpl = fakeAuthorizationServer({
			metadataUrls: authorizationServerMetadataUrls(ISSUER),
			metadata: METADATA,
			registrationEndpoint: METADATA.registration_endpoint,
			tokenEndpoint: METADATA.token_endpoint,
			requests,
		})
		let authorizeUrl: URL | undefined
		let callbackStatus = 0
		let opener: Promise<void> | undefined
		let randomCall = 0
		const openBrowser = (url: string): Promise<void> => {
			opener = (async () => {
				authorizeUrl = new URL(url)
				const state = authorizeUrl.searchParams.get("state") ?? ""
				callbackStatus = (await sendCallback(port, { code: "auth-code", state })).status
			})()
			return opener
		}

		const tokenFile = await runBootstrapLogin({
			...loginDeps({ port, outPath, fetchImpl, openBrowser, issuer: ISSUER, resource: RESOURCE }),
			randomBytes: (length) => new Uint8Array(length).fill(++randomCall),
			nowMs: () => NOW,
		})
		await opener
		if (!authorizeUrl) throw new Error("expected an authorize URL")

		expect(callbackStatus).toBe(200)
		expect(tokenFile).toEqual({
			issuer: ISSUER,
			token_endpoint: METADATA.token_endpoint,
			client_id: "client-abc",
			resource: RESOURCE,
			access_token: "access-token",
			refresh_token: "refresh-token",
			expires_at: NOW + 3_600_000,
		})
		expect(parseTokenFile(JSON.parse(await readFile(outPath, "utf8")))).toEqual(tokenFile)
		expect((await stat(outPath)).mode & 0o777).toBe(0o600)
		expect((await stat(dirname(outPath))).mode & 0o777).toBe(0o700)
		expect(await connectable("127.0.0.1", port)).toBe(false)

		const expectedVerifier = Buffer.from(new Uint8Array(32).fill(1)).toString("base64url")
		const expectedState = Buffer.from(new Uint8Array(32).fill(2)).toString("base64url")
		expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(METADATA.authorization_endpoint)
		expect(authorizeUrl.searchParams.get("response_type")).toBe("code")
		expect(authorizeUrl.searchParams.get("client_id")).toBe("client-abc")
		expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(`http://127.0.0.1:${port}/callback`)
		expect(authorizeUrl.searchParams.get("code_challenge")).toBe(
			await createCodeChallenge(expectedVerifier),
		)
		expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256")
		expect(authorizeUrl.searchParams.get("state")).toBe(expectedState)
		expect(authorizeUrl.searchParams.get("resource")).toBe(RESOURCE)

		const registration = requests.find((request) => request.url.endsWith("/register"))
		expect(registration?.url).toBe(METADATA.registration_endpoint)
		expect(JSON.parse(String(registration?.init?.body))).toEqual({
			client_name: "mcp-auth-gateway",
			redirect_uris: [`http://127.0.0.1:${port}/callback`],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		})
		const exchange = requests.find((request) => request.url.endsWith("/token"))
		expect(exchange?.url).toBe(METADATA.token_endpoint)
		expect(Object.fromEntries(new URLSearchParams(String(exchange?.init?.body)))).toEqual({
			grant_type: "authorization_code",
			code: "auth-code",
			redirect_uri: `http://127.0.0.1:${port}/callback`,
			client_id: "client-abc",
			code_verifier: expectedVerifier,
			resource: RESOURCE,
		})
	}, 10_000)
})
