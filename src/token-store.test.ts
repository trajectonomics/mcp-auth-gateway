import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type TokenFile, TokenFileParseError } from "./token-file"
import { createFileTokenStore, type TokenStore } from "./token-store"
import { TokenStoreError } from "./token-store-error"

const TOKEN_FILE: TokenFile = {
	issuer: "https://auth.example.com",
	token_endpoint: "https://auth.example.com/token",
	client_id: "client-abc",
	resource: "https://api.example.com/mcp",
	access_token: "access-token",
	refresh_token: "refresh-token",
	expires_at: 1_700_000_000_000,
}

let directory: string
let path: string

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "token-store-"))
	path = join(directory, "tokens.json")
})

afterEach(async () => {
	await rm(directory, { recursive: true, force: true })
})

async function readError(store: TokenStore): Promise<TokenStoreError> {
	try {
		await store.read()
	} catch (error) {
		if (error instanceof TokenStoreError) return error
		throw error
	}
	throw new Error("expected read to fail")
}

async function writeError(store: TokenStore): Promise<TokenStoreError> {
	try {
		await store.write(TOKEN_FILE)
	} catch (error) {
		if (error instanceof TokenStoreError) return error
		throw error
	}
	throw new Error("expected write to fail")
}

describe("File Token Store", () => {
	it("reads back the Token File it wrote", async () => {
		const store = createFileTokenStore({ path })

		await store.write(TOKEN_FILE)

		expect(await store.read()).toEqual(TOKEN_FILE)
	})

	it("reads the Token File from disk on every call", async () => {
		const store = createFileTokenStore({ path })
		await store.write(TOKEN_FILE)
		const updated = { ...TOKEN_FILE, access_token: "updated-token" }
		await writeFile(path, JSON.stringify(updated))

		expect(await store.read()).toEqual(updated)
	})

	it("writes the documented Token File schema without extra fields", async () => {
		const store = createFileTokenStore({ path })

		await store.write({ ...TOKEN_FILE, extra: "ignored" } as TokenFile)

		expect(JSON.parse(await readFile(path, "utf8"))).toEqual(TOKEN_FILE)
	})

	it("reports a missing Token File as token_file_missing", async () => {
		const store = createFileTokenStore({ path })

		const error = await readError(store)

		expect(error.code).toBe("token_file_missing")
	})

	it("reports malformed JSON as token_file_corrupt with the parse cause", async () => {
		await writeFile(path, "{not json")
		const store = createFileTokenStore({ path })

		const error = await readError(store)

		expect(error.code).toBe("token_file_corrupt")
		expect(error.cause).toBeInstanceOf(SyntaxError)
	})

	it("reports a schema violation as token_file_corrupt with the parse cause", async () => {
		await writeFile(path, JSON.stringify({ issuer: "https://auth.example.com" }))
		const store = createFileTokenStore({ path })

		const error = await readError(store)

		expect(error.code).toBe("token_file_corrupt")
		expect(error.cause).toBeInstanceOf(TokenFileParseError)
	})

	it("reports a Token File that cannot be read as token_file_unreadable", async () => {
		await mkdir(path)
		const store = createFileTokenStore({ path })

		const error = await readError(store)

		expect(error.code).toBe("token_file_unreadable")
		expect(error.cause).toBeDefined()
	})

	it("reports a Token File that cannot be persisted as token_file_unwritable", async () => {
		const blocker = join(directory, "blocker")
		await writeFile(blocker, "not a directory")
		const store = createFileTokenStore({ path: join(blocker, "tokens.json") })

		const error = await writeError(store)

		expect(error.code).toBe("token_file_unwritable")
		expect(error.cause).toBeDefined()
	})

	it("never exposes a partial Token File to concurrent readers", async () => {
		const store = createFileTokenStore({ path })
		const alternate = { ...TOKEN_FILE, access_token: "alternate-token" }
		await store.write(TOKEN_FILE)
		const writer = (async () => {
			for (let index = 0; index < 50; index += 1) {
				await store.write(index % 2 === 0 ? TOKEN_FILE : alternate)
			}
		})()
		const reader = (async () => {
			const observed: TokenFile[] = []
			for (let index = 0; index < 50; index += 1) {
				observed.push(await store.read())
			}
			return observed
		})()

		const [, observed] = await Promise.all([writer, reader])

		for (const tokenFile of observed) {
			expect([TOKEN_FILE, alternate]).toContainEqual(tokenFile)
		}
	})
})
