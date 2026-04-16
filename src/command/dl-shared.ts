import type { CommandContext } from "gunshi"
import type { DlOptions } from "../dl/types.ts"
import { OFF, type StepState } from "../dl/actions.ts"
import {
	DEXPORT_PLUGIN_ID,
	type DexportExtension,
} from "../plugin/dexport.ts"
import {
	GIT_PLUGIN_ID,
	type GitExtension,
} from "../plugin/git.ts"
import {
	LOG_PLUGIN_ID,
	type LogExtension,
} from "../plugin/log.ts"
import {
	REPO_PLUGIN_ID,
	type RepoExtension,
} from "../plugin/repo.ts"
import {
	ROOTS_PLUGIN_ID,
	type RootsExtension,
} from "../plugin/roots.ts"

export type DlExtensions = {
	[ROOTS_PLUGIN_ID]: RootsExtension
	[REPO_PLUGIN_ID]: RepoExtension
	[GIT_PLUGIN_ID]: GitExtension
	[DEXPORT_PLUGIN_ID]: DexportExtension
	[LOG_PLUGIN_ID]: LogExtension
	[key: string]: unknown
}

export interface DlRunCtx {
	log: LogExtension
	roots: { archiveRoot: string; wikiRoot: string }
	repo: RepoExtension
	git: GitExtension
	dexport: DexportExtension
	options: DlOptions
}

export function requireExtensions(extensions: DlExtensions) {
	const log = extensions[LOG_PLUGIN_ID]
	const roots = extensions[ROOTS_PLUGIN_ID]
	const repo = extensions[REPO_PLUGIN_ID]
	const git = extensions[GIT_PLUGIN_ID]
	const dexport = extensions[DEXPORT_PLUGIN_ID]
	if (!log) throw new Error("dl: log plugin extension is not available")
	if (!roots) throw new Error("dl: roots plugin extension is not available")
	if (!repo) throw new Error("dl: repo plugin extension is not available")
	if (!git) throw new Error("dl: git plugin extension is not available")
	if (!dexport) throw new Error("dl: dexport plugin extension is not available")
	return { log, roots, repo, git, dexport }
}

export async function resolveDlSetup(
	ctx: CommandContext<{ extensions: DlExtensions }>,
	options: DlOptions,
): Promise<DlRunCtx> {
	const ext = requireExtensions(ctx.extensions)
	const roots = await ext.roots.resolveRoots()
	return { log: ext.log, roots, repo: ext.repo, git: ext.git, dexport: ext.dexport, options }
}
