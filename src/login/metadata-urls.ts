import { trimTrailingSlashes } from "../trim-trailing-slashes"
import { BootstrapLoginError } from "./errors"

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
	const path = trimTrailingSlashes(url.pathname)
	const inserted = `${url.protocol}//${url.host}/${METADATA_PATH}${path}`
	const appended = `${trimTrailingSlashes(issuer)}/${METADATA_PATH}`
	return Object.freeze(inserted === appended ? [inserted] : [inserted, appended])
}
