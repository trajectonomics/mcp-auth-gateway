/** Domain error codes for rejecting unusable PKCE inputs. */
export type PkceErrorCode = "code_verifier_length_out_of_range" | "code_verifier_charset_invalid"

/** Error thrown when caller-supplied PKCE inputs violate RFC 7636. */
export class PkceError extends Error {
	readonly code: PkceErrorCode

	constructor(code: PkceErrorCode, message: string) {
		super(message)
		this.name = "PkceError"
		this.code = code
	}
}

const MIN_VERIFIER_LENGTH = 43
const MAX_VERIFIER_LENGTH = 128
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]+$/

/** Creates an RFC 7636 code verifier from caller-supplied random bytes. */
export function createCodeVerifier(randomBytes: Uint8Array): string {
	const verifier = encodeBase64Url(randomBytes)
	assertCodeVerifier(verifier)
	return verifier
}

/** Creates the S256 PKCE challenge for an RFC 7636 code verifier. */
export async function createCodeChallenge(verifier: string): Promise<string> {
	assertCodeVerifier(verifier)
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
	return encodeBase64Url(new Uint8Array(digest))
}

/** Creates an OAuth state value from caller-supplied random bytes. */
export function createState(randomBytes: Uint8Array): string {
	return encodeBase64Url(randomBytes)
}

function assertCodeVerifier(verifier: string): void {
	if (verifier.length < MIN_VERIFIER_LENGTH || verifier.length > MAX_VERIFIER_LENGTH) {
		throw new PkceError(
			"code_verifier_length_out_of_range",
			`PKCE code verifier must be ${MIN_VERIFIER_LENGTH}-${MAX_VERIFIER_LENGTH} characters`,
		)
	}
	if (!VERIFIER_PATTERN.test(verifier)) {
		throw new PkceError(
			"code_verifier_charset_invalid",
			"PKCE code verifier must use only unreserved URL characters",
		)
	}
}

function encodeBase64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64url")
}
