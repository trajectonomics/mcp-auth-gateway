import { afterEach, describe, expect, it } from "bun:test"
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { atomicWriteFile } from "./atomic-write"

let directory: string

async function makeDirectory(): Promise<string> {
	directory = await mkdtemp(join(tmpdir(), "atomic-write-"))
	return directory
}

afterEach(async () => {
	await rm(directory, { recursive: true, force: true })
})

describe("Atomic persistence", () => {
	it("stores the complete contents at the target path", async () => {
		const root = await makeDirectory()
		const path = join(root, "tokens.json")

		await atomicWriteFile(path, '{"access_token":"a"}')

		expect(await readFile(path, "utf8")).toBe('{"access_token":"a"}')
	})

	it("keeps the file owner-only even under a permissive umask", async () => {
		const root = await makeDirectory()
		const parent = join(root, "data")
		const path = join(parent, "tokens.json")
		const previousUmask = process.umask(0o000)
		try {
			await atomicWriteFile(path, "{}")
		} finally {
			process.umask(previousUmask)
		}

		expect((await stat(parent)).mode & 0o777).toBe(0o700)
		expect((await stat(path)).mode & 0o777).toBe(0o600)
	})

	it("tightens an existing parent directory to owner-only access", async () => {
		const root = await makeDirectory()
		const parent = join(root, "data")
		await mkdir(parent, { mode: 0o755 })
		await chmod(parent, 0o755)

		await atomicWriteFile(join(parent, "tokens.json"), "{}")

		expect((await stat(parent)).mode & 0o777).toBe(0o700)
	})

	it("preserves the previous contents and leaves no temporary files when a write fails", async () => {
		const root = await makeDirectory()
		// The parent is repaired to 0700, so a read-only directory cannot fail the write.
		// An over-long target name makes the sibling temporary file unrepresentable instead.
		const name = "a".repeat(255)
		const path = join(root, name)
		await writeFile(path, "previous", { mode: 0o600 })

		await expect(atomicWriteFile(path, "next")).rejects.toThrow()

		expect(await readFile(path, "utf8")).toBe("previous")
		expect(await readdir(root)).toEqual([name])
	})
})
