import { readFile } from "node:fs/promises"
import { atomicWriteFile } from "./atomic-write"
import { parseTokenFile, type TokenFile } from "./token-file"
import { TokenStoreError } from "./token-store-error"

/** Persistent store for the Token File. */
export interface TokenStore {
	read(): Promise<TokenFile>
	write(tokenFile: TokenFile): Promise<void>
}

/** Creates a Token Store backed by the Token File at `path`. */
export function createFileTokenStore(options: { path: string }): TokenStore {
	const { path } = options
	return Object.freeze({
		async read(): Promise<TokenFile> {
			const data = await readTokenFile(path)
			try {
				return parseTokenFile(JSON.parse(data))
			} catch (error) {
				throw new TokenStoreError(
					"token_file_corrupt",
					`Token File at "${path}" is not a valid Token File`,
					{ cause: error },
				)
			}
		},
		async write(tokenFile: TokenFile): Promise<void> {
			try {
				await atomicWriteFile(path, serializeTokenFile(tokenFile))
			} catch (error) {
				throw new TokenStoreError(
					"token_file_unwritable",
					`Token File at "${path}" cannot be written`,
					{ cause: error },
				)
			}
		},
	})
}

function serializeTokenFile(tokenFile: TokenFile): string {
	return JSON.stringify({
		issuer: tokenFile.issuer,
		token_endpoint: tokenFile.token_endpoint,
		client_id: tokenFile.client_id,
		resource: tokenFile.resource,
		access_token: tokenFile.access_token,
		refresh_token: tokenFile.refresh_token,
		expires_at: tokenFile.expires_at,
	})
}

function errorCode(error: unknown): unknown {
	return typeof error === "object" && error !== null && "code" in error ? error.code : undefined
}

async function readTokenFile(path: string): Promise<string> {
	try {
		return await readFile(path, "utf8")
	} catch (error) {
		if (errorCode(error) === "ENOENT") {
			throw new TokenStoreError("token_file_missing", `Token File at "${path}" does not exist`, {
				cause: error,
			})
		}
		throw new TokenStoreError("token_file_unreadable", `Token File at "${path}" cannot be read`, {
			cause: error,
		})
	}
}
