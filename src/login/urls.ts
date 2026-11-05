/** Joins an authorization server issuer with a path without duplicating slashes. */
export function authServerUrl(issuer: string, path: string): string {
	return `${issuer.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
}
