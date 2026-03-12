import { access } from "node:fs/promises"
import { join } from "node:path"
import { x } from "tinyexec"
import { listRemotes } from "./remote.ts"

async function exists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	} catch {
		return false
	}
}

async function trackMainBookmark(destination: string): Promise<void> {
	const remotes = await listRemotes(destination)
	for (const remote of remotes) {
		try {
			await x("jj", ["bookmark", "track", `main@${remote}`], {
				throwOnError: true,
				nodeOptions: { cwd: destination, stdio: "inherit" },
			})
		} catch {}
	}
}

export async function ensureJjInitialized(destination: string): Promise<void> {
	if (await exists(join(destination, ".jj"))) {
		return
	}

	await x("jj", ["git", "init"], {
		throwOnError: true,
		nodeOptions: { cwd: destination, stdio: "inherit" },
	})
	await trackMainBookmark(destination)
}
