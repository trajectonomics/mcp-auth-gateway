import { isRecord } from "../is-record"
import { BootstrapLoginError } from "./errors"
import { authServerUrl } from "./urls"

/** Inputs for OAuth 2.0 Dynamic Client Registration. */
export interface RegisterClientOptions {
	readonly fetchImpl: typeof fetch
	readonly issuer: string
	readonly redirectUri: string
}

/** Registers the gateway client and returns the runtime client_id. */
export async function registerClient(options: RegisterClientOptions): Promise<string> {
	const endpoint = authServerUrl(options.issuer, "oauth/clients/register")
	let response: Response
	try {
		response = await options.fetchImpl(endpoint, {
			method: "POST",
			headers: { "content-type": "application/json", accept: "application/json" },
			body: JSON.stringify({
				client_name: "mcp-auth-gateway",
				redirect_uris: [options.redirectUri],
				grant_types: ["authorization_code", "refresh_token"],
				response_types: ["code"],
				token_endpoint_auth_method: "none",
			}),
		})
	} catch (error) {
		throw new BootstrapLoginError(
			"client_registration_failed",
			`Client Registration failed at "${endpoint}"; check network access and the issuer URL`,
			{ cause: error },
		)
	}
	if (!response.ok) {
		throw new BootstrapLoginError(
			"client_registration_failed",
			`Client Registration failed at "${endpoint}" with HTTP ${response.status}; the authorization server may not support Dynamic Client Registration`,
		)
	}
	const body = (await response.json().catch(() => undefined)) as unknown
	const clientId = isRecord(body) ? body["client_id"] : undefined
	if (typeof clientId !== "string" || clientId.trim().length === 0) {
		throw new BootstrapLoginError(
			"missing_client_id",
			`Client Registration at "${endpoint}" returned no client_id; the authorization server may not support Dynamic Client Registration`,
		)
	}
	return clientId
}
