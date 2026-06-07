import { homedir } from "node:os"
import { x } from "tinyexec"

function dexportArgs(outputRoot: string, wikiUrl: string): string[] {
	return ["--output", outputRoot, "--strip-host", wikiUrl]
}

export function runDexportDetached(
	dexportPath: string,
	outputRoot: string,
	wikiUrl: string,
): void {
	const proc = x(dexportPath, dexportArgs(outputRoot, wikiUrl), {
		persist: true,
		nodeOptions: {
			cwd: homedir(),
			stdio: "ignore",
			detached: true,
		},
	})
	proc.process?.unref()
}

export async function runDexport(
	dexportPath: string,
	outputRoot: string,
	wikiUrl: string,
): Promise<void> {
	await x(dexportPath, dexportArgs(outputRoot, wikiUrl), {
		throwOnError: true,
		nodeOptions: { cwd: homedir(), stdio: "inherit" },
	})
}
