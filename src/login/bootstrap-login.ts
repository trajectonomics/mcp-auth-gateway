import { parseTokenFile, type TokenFile } from "../token-file"
import { createFileTokenStore } from "../token-store"
import { createAuthorizeUrl } from "./authorize-url"
import { startCallbackServer } from "./callback-server"
import { createCodeChallenge, createCodeVerifier, createState } from "./pkce"
import { registerClient } from "./registration"
import { exchangeCode } from "./token-exchange"
import { authServerUrl } from "./urls"

/** Injected inputs for the interactive Bootstrap Login. */
export interface BootstrapLoginDeps {
	readonly fetchImpl: typeof fetch
	readonly openBrowser: (url: string) => Promise<void>
	readonly nowMs: () => number
	readonly randomBytes: (length: number) => Uint8Array
	readonly outPath: string
	readonly port?: number
	readonly issuer?: string
	readonly resource?: string
}

const DEFAULT_PORT = 9696
const DEFAULT_ISSUER = "https://ujasntkfphywizsdaapi.supabase.co/auth/v1"
const DEFAULT_RESOURCE = "https://api.mobbin.com/mcp"
const RANDOM_BYTES_LENGTH = 32

/**
 * Runs the one-time PKCE Bootstrap Login and persists the resulting Token File.
 * A failed browser opener does not fail the login; the operator can use the printed URL.
 */
export async function runBootstrapLogin(deps: BootstrapLoginDeps): Promise<TokenFile> {
	const issuer = deps.issuer ?? DEFAULT_ISSUER
	const resource = deps.resource ?? DEFAULT_RESOURCE
	const port = deps.port ?? DEFAULT_PORT
	const redirectUri = `http://127.0.0.1:${port}/callback`
	const clientId = await registerClient({ fetchImpl: deps.fetchImpl, issuer, redirectUri })
	const codeVerifier = createCodeVerifier(deps.randomBytes(RANDOM_BYTES_LENGTH))
	const codeChallenge = await createCodeChallenge(codeVerifier)
	const state = createState(deps.randomBytes(RANDOM_BYTES_LENGTH))
	const callback = startCallbackServer({ port, state })
	let code: string
	try {
		const authorizeUrl = createAuthorizeUrl({
			issuer,
			clientId,
			redirectUri,
			codeChallenge,
			state,
			resource,
		})
		deps.openBrowser(authorizeUrl).catch(() => undefined)
		code = await callback.waitForCode()
	} finally {
		await callback.stop()
	}
	const tokens = await exchangeCode({
		fetchImpl: deps.fetchImpl,
		tokenEndpoint: authServerUrl(issuer, "token"),
		code,
		redirectUri,
		clientId,
		codeVerifier,
		resource,
	})
	const tokenFile = parseTokenFile({
		issuer,
		token_endpoint: authServerUrl(issuer, "token"),
		client_id: clientId,
		resource,
		access_token: tokens.accessToken,
		refresh_token: tokens.refreshToken,
		expires_at: deps.nowMs() + tokens.expiresIn * 1000,
	})
	await createFileTokenStore({ path: deps.outPath }).write(tokenFile)
	return tokenFile
}
