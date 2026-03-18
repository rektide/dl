import { homedir } from "node:os"
import { x } from "tinyexec"

function dexportArgs(outputRoot: string, wikiDeepUrl: string): string[] {
	return ["--output", outputRoot, "--strip-host", wikiDeepUrl]
}

export function runDexportDetached(
	dexportPath: string,
	outputRoot: string,
	wikiDeepUrl: string,
): void {
	const proc = x(dexportPath, dexportArgs(outputRoot, wikiDeepUrl), {
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
	wikiDeepUrl: string,
): Promise<void> {
	await x(dexportPath, dexportArgs(outputRoot, wikiDeepUrl), {
		throwOnError: true,
		nodeOptions: { cwd: homedir(), stdio: "inherit" },
	})
}
