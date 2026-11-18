import { isRecord } from "../is-record"
import { trimTrailingSlashes } from "../trim-trailing-slashes"
import { BootstrapLoginError } from "./errors"
import { authorizationServerMetadataUrls } from "./metadata-urls"

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

/** Resolves the PKCE endpoints from the authorization server's RFC 8414 metadata. */
export async function discoverAuthorizationServer(
	options: DiscoverAuthorizationServerOptions,
): Promise<AuthorizationServerMetadata> {
	const metadata = await readMetadata(
		options.fetchImpl,
		authorizationServerMetadataUrls(options.issuer),
	)
	const issuer = metadata["issuer"]
	if (
		typeof issuer !== "string" ||
		trimTrailingSlashes(issuer) !== trimTrailingSlashes(options.issuer)
	) {
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
