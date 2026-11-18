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
	const path = url.pathname.replace(/\/+$/, "")
	const inserted = `${url.protocol}//${url.host}/${METADATA_PATH}${path}`
	const appended = `${issuer.replace(/\/+$/, "")}/${METADATA_PATH}`
	return Object.freeze(inserted === appended ? [inserted] : [inserted, appended])
}
