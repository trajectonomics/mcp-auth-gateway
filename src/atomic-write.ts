import { randomUUID } from "node:crypto"
import { chmod, mkdir, open, rename, unlink } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

/** Writes a file atomically through a sibling temporary file and a rename. */
export async function atomicWriteFile(path: string, data: string): Promise<void> {
	const directory = dirname(path)
	await mkdir(directory, { recursive: true, mode: 0o700 })
	await chmod(directory, 0o700)
	const temporaryPath = join(directory, `.${basename(path)}.${randomUUID()}.tmp`)
	try {
		const handle = await open(temporaryPath, "wx", 0o600)
		try {
			await handle.writeFile(data, "utf8")
			await handle.sync()
			await handle.chmod(0o600)
		} finally {
			await handle.close()
		}
		await rename(temporaryPath, path)
		await syncDirectory(directory)
	} catch (error) {
		await unlink(temporaryPath).catch(() => undefined)
		throw error
	}
}

async function syncDirectory(directory: string): Promise<void> {
	const handle = await open(directory, "r")
	try {
		await handle.sync()
	} finally {
		await handle.close()
	}
}
