import { x } from "tinyexec"

export function normalizeCloneUrl(remoteUrl: string): string {
	const trimmed = remoteUrl.trim()
	if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith("git@")) {
		return trimmed
	}

	const withoutLeadingSlashes = trimmed.replace(/^\/+/, "")
	const withScheme = `https://${withoutLeadingSlashes}`
	return withScheme.endsWith(".git") ? withScheme : `${withScheme}.git`
}

export async function listRemotes(repoDir: string): Promise<string[]> {
	const result = await x("git", ["remote"], { nodeOptions: { cwd: repoDir } })
	return result.stdout.trim().split("\n").filter(Boolean)
}
