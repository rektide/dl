import { access, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { x } from "tinyexec"
import { normalizeCloneUrl } from "./remote.ts"
import type { GitCloneStatus } from "./types.ts"

async function exists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	} catch {
		return false
	}
}

const noPromptEnv = {
	GIT_TERMINAL_PROMPT: "0",
	GIT_ASKPASS: "true",
}

export async function cloneOrUpdate(
	remoteUrl: string,
	destination: string,
): Promise<GitCloneStatus> {
	const normalizedRemoteUrl = normalizeCloneUrl(remoteUrl)
	const gitDir = join(destination, ".git")
	if (await exists(gitDir)) {
		await x("git", ["-C", destination, "-c", "credential.helper=", "pull", "--ff-only"], {
			throwOnError: true,
			nodeOptions: { stdio: "inherit", env: { ...process.env, ...noPromptEnv } },
		})
		return "updated"
	}

	if (await exists(destination)) {
		throw new Error(
			`Destination exists and is not a git checkout: ${destination}`,
		)
	}

	await mkdir(dirname(destination), { recursive: true })
	await x("git", ["-c", "credential.helper=", "clone", normalizedRemoteUrl, destination], {
		throwOnError: true,
		nodeOptions: { stdio: "inherit", env: { ...process.env, ...noPromptEnv } },
	})

	return "cloned"
}
