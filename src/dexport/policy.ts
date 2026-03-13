import { lstat } from "node:fs/promises"

export type DexportPlan = "skip-existing" | "queue" | "run"

async function isDirectory(path: string): Promise<boolean> {
	try {
		const stats = await lstat(path)
		return stats.isDirectory()
	} catch {
		return false
	}
}

export async function chooseDexportPlan(
	wikiDestination: string,
	consumeDexportOutput: boolean,
): Promise<DexportPlan> {
	if (await isDirectory(wikiDestination)) {
		return "skip-existing"
	}

	if (consumeDexportOutput) {
		return "queue"
	}

	return "run"
}
