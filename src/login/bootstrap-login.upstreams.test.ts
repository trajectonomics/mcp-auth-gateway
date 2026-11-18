import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MOBBIN_DEFAULTS, POSTHOG_DEFAULTS } from "../defaults"
import {
	type CapturedRequest,
	fakeAuthorizationServer,
	loginDeps,
	reservePort,
	sendCallback,
} from "../testing/login-fixtures"
import type { TokenFile } from "../token-file"
import { runBootstrapLogin } from "./bootstrap-login"
import { authorizationServerMetadataUrls } from "./metadata-urls"

interface UpstreamCase {
	readonly file: string
	readonly issuer: string
	readonly resource: string
	readonly authorizationEndpoint: string
	readonly tokenEndpoint: string
	readonly registrationEndpoint: string
}

const SUPABASE: UpstreamCase = {
	file: "mobbin",
	issuer: MOBBIN_DEFAULTS.issuer,
	resource: MOBBIN_DEFAULTS.resource,
	authorizationEndpoint: `${MOBBIN_DEFAULTS.issuer}/oauth/authorize`,
	tokenEndpoint: `${MOBBIN_DEFAULTS.issuer}/oauth/token`,
	registrationEndpoint: `${MOBBIN_DEFAULTS.issuer}/oauth/clients/register`,
}

const POSTHOG: UpstreamCase = {
	file: "posthog",
	issuer: "https://oauth.posthog.com",
	resource: POSTHOG_DEFAULTS.resource,
	authorizationEndpoint: "https://oauth.posthog.com/oauth/authorize/",
	tokenEndpoint: "https://oauth.posthog.com/oauth/token/",
	registrationEndpoint: "https://oauth.posthog.com/oauth/register/",
}

let directory: string

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "bootstrap-login-upstreams-"))
})

afterEach(async () => {
	await rm(directory, { recursive: true, force: true })
})

async function loginThrough(
	upstream: UpstreamCase,
): Promise<{ tokenFile: TokenFile; requests: CapturedRequest[] }> {
	const port = await reservePort()
	const requests: CapturedRequest[] = []
	const fetchImpl = fakeAuthorizationServer({
		metadataUrls: authorizationServerMetadataUrls(upstream.issuer),
		metadata: {
			issuer: upstream.issuer,
			authorization_endpoint: upstream.authorizationEndpoint,
			token_endpoint: upstream.tokenEndpoint,
			registration_endpoint: upstream.registrationEndpoint,
		},
		registrationEndpoint: upstream.registrationEndpoint,
		tokenEndpoint: upstream.tokenEndpoint,
		requests,
	})
	let authorizeUrl: URL | undefined
	let opener: Promise<void> | undefined
	const openBrowser = (url: string): Promise<void> => {
		opener = (async () => {
			authorizeUrl = new URL(url)
			const state = authorizeUrl.searchParams.get("state") ?? ""
			await sendCallback(port, { code: "auth-code", state })
		})()
		return opener
	}

	const tokenFile = await runBootstrapLogin(
		loginDeps({
			port,
			outPath: join(directory, `${upstream.file}.json`),
			fetchImpl,
			openBrowser,
			issuer: upstream.issuer,
			resource: upstream.resource,
		}),
	)
	await opener
	if (!authorizeUrl) throw new Error("expected an authorize URL")
	expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(upstream.authorizationEndpoint)
	return { tokenFile, requests }
}

describe("Bootstrap Login per Upstream", () => {
	it("writes Mobbin's Token File from Supabase's metadata", async () => {
		const { tokenFile, requests } = await loginThrough(SUPABASE)

		expect(tokenFile.issuer).toBe(SUPABASE.issuer)
		expect(tokenFile.token_endpoint).toBe(SUPABASE.tokenEndpoint)
		expect(tokenFile.resource).toBe(SUPABASE.resource)
		expect(requests.some((request) => request.url === SUPABASE.registrationEndpoint)).toBe(true)
	})

	it("writes PostHog's Token File from PostHog's metadata", async () => {
		const { tokenFile, requests } = await loginThrough(POSTHOG)

		expect(tokenFile.issuer).toBe(POSTHOG.issuer)
		expect(tokenFile.token_endpoint).toBe(POSTHOG.tokenEndpoint)
		expect(tokenFile.resource).toBe(POSTHOG.resource)
		expect(requests.some((request) => request.url === POSTHOG.registrationEndpoint)).toBe(true)
	})
})
