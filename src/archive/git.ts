import { access, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { x } from "tinyexec"
import { normalizeCloneUrl } from "../dl/repository.ts"

async function exists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	} catch {
		return false
	}
}

export async function cloneOrUpdate(
	remoteUrl: string,
	destination: string,
): Promise<void> {
	const normalizedRemoteUrl = normalizeCloneUrl(remoteUrl)
	const gitDir = join(destination, ".git")
	if (await exists(gitDir)) {
		await x("git", ["-C", destination, "pull", "--ff-only"], {
			throwOnError: true,
			nodeOptions: { stdio: "inherit" },
		})
		return
	}

	if (await exists(destination)) {
		throw new Error(
			`Destination exists and is not a git checkout: ${destination}`,
		)
	}

	await mkdir(dirname(destination), { recursive: true })
	await x("git", ["clone", normalizedRemoteUrl, destination], {
		throwOnError: true,
		nodeOptions: { stdio: "inherit" },
	})
}
