import { isRecord } from "../is-record"
import { BootstrapLoginError } from "./errors"

/** Endpoints the Bootstrap Login resolves from the authorization server's metadata. */
export interface AuthorizationServerMetadata {
	readonly authorizationEndpoint: string
	readonly tokenEndpoint: string
	readonly registrationEndpoint: string
}

/** Inputs for authorization-server discovery. */
export interface DiscoverAuthorizationServerOptions {
	readonly fetchImpl: typeof fetch
	readonly issuer: string
}

const METADATA_PATH = ".well-known/oauth-authorization-server"

/** RFC 8414 metadata locations for an issuer: the §3.1 inserted form first, the appended form second. */
export function authorizationServerMetadataUrls(issuer: string): readonly string[] {
	let url: URL
	try {
		url = new URL(issuer)
	} catch (error) {
		throw new BootstrapLoginError(
			"issuer_invalid",
			`Authorization server issuer "${issuer}" is not an absolute URL`,
			{ cause: error },
		)
	}
	const path = url.pathname.replace(/\/+$/, "")
	const inserted = `${url.protocol}//${url.host}/${METADATA_PATH}${path}`
	const appended = `${issuer.replace(/\/+$/, "")}/${METADATA_PATH}`
	return Object.freeze(inserted === appended ? [inserted] : [inserted, appended])
}

/** Resolves the PKCE endpoints from the authorization server's RFC 8414 metadata. */
export async function discoverAuthorizationServer(
	options: DiscoverAuthorizationServerOptions,
): Promise<AuthorizationServerMetadata> {
	const metadata = await readMetadata(
		options.fetchImpl,
		authorizationServerMetadataUrls(options.issuer),
	)
	const issuer = metadata["issuer"]
	if (typeof issuer !== "string" || normalizeIssuer(issuer) !== normalizeIssuer(options.issuer)) {
		throw new BootstrapLoginError(
			"metadata_issuer_mismatch",
			`Authorization server metadata does not echo the issuer "${options.issuer}"`,
		)
	}
	return Object.freeze({
		authorizationEndpoint: readEndpoint(metadata, "authorization_endpoint"),
		tokenEndpoint: readEndpoint(metadata, "token_endpoint"),
		registrationEndpoint: readEndpoint(metadata, "registration_endpoint"),
	})
}

function normalizeIssuer(issuer: string): string {
	return issuer.replace(/\/+$/, "")
}

async function readMetadata(
	fetchImpl: typeof fetch,
	urls: readonly string[],
): Promise<Record<string, unknown>> {
	for (const url of urls) {
		const document = await readDocument(fetchImpl, url)
		if (document !== undefined) return document
	}
	throw new BootstrapLoginError(
		"metadata_unavailable",
		`Authorization server metadata is unavailable at ${urls.join(" and ")}; check the issuer URL and network access`,
	)
}

async function readDocument(
	fetchImpl: typeof fetch,
	url: string,
): Promise<Record<string, unknown> | undefined> {
	try {
		const response = await fetchImpl(url, { headers: { accept: "application/json" } })
		if (!response.ok) return undefined
		const body: unknown = await response.json()
		return isRecord(body) ? body : undefined
	} catch {
		return undefined
	}
}

function readEndpoint(metadata: Record<string, unknown>, field: string): string {
	const endpoint = metadata[field]
	if (typeof endpoint !== "string" || endpoint.length === 0) {
		throw new BootstrapLoginError(
			"metadata_endpoint_missing",
			`Authorization server metadata is missing "${field}"`,
		)
	}
	return endpoint
}
