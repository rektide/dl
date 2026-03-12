import { access } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

async function exists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	} catch {
		return false
	}
}

export function defaultDexportPath(): string {
	return join(homedir(), "src", "dexport", "src", "cli.ts")
}

export async function resolveDexportPath(): Promise<string | undefined> {
	const candidate = defaultDexportPath()
	if (await exists(candidate)) {
		return candidate
	}
	return undefined
}
