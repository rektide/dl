import { homedir } from "node:os"
import { x } from "tinyexec"

function dexportArgs(outputRoot: string, deepwikiUrl: string): string[] {
	return ["--output", outputRoot, "--strip-host", deepwikiUrl]
}

export function runDexportDetached(
	dexportPath: string,
	outputRoot: string,
	deepwikiUrl: string,
): void {
	const proc = x(dexportPath, dexportArgs(outputRoot, deepwikiUrl), {
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
	deepwikiUrl: string,
): Promise<void> {
	await x(dexportPath, dexportArgs(outputRoot, deepwikiUrl), {
		throwOnError: true,
		nodeOptions: { cwd: homedir(), stdio: "inherit" },
	})
}
