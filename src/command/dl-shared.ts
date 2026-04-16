import type { DlOptions } from "../dl/types.ts"
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

export interface DlExtensions {
	[ROOTS_PLUGIN_ID]: RootsExtension
	[REPO_PLUGIN_ID]: RepoExtension
	[GIT_PLUGIN_ID]: GitExtension
	[DEXPORT_PLUGIN_ID]: DexportExtension
	[LOG_PLUGIN_ID]: LogExtension
}

export interface DlRunCtx {
	log: LogExtension
	roots: { archiveRoot: string; wikiRoot: string }
	repo: RepoExtension
	git: GitExtension
	dexport: DexportExtension
	options: DlOptions
}

export function requireExtensions(extensions: Record<string, unknown>) {
	const log = extensions[LOG_PLUGIN_ID] as LogExtension | undefined
	const roots = extensions[ROOTS_PLUGIN_ID] as RootsExtension | undefined
	const repo = extensions[REPO_PLUGIN_ID] as RepoExtension | undefined
	const git = extensions[GIT_PLUGIN_ID] as GitExtension | undefined
	const dexport = extensions[DEXPORT_PLUGIN_ID] as DexportExtension | undefined
	if (!log) throw new Error("dl: log plugin extension is not available")
	if (!roots) throw new Error("dl: roots plugin extension is not available")
	if (!repo) throw new Error("dl: repo plugin extension is not available")
	if (!git) throw new Error("dl: git plugin extension is not available")
	if (!dexport) throw new Error("dl: dexport plugin extension is not available")
	return { log, roots, repo, git, dexport }
}

export async function resolveDlSetup(
	extensions: Record<string, unknown>,
	options: DlOptions,
): Promise<DlRunCtx> {
	const ext = requireExtensions(extensions)
	const roots = await ext.roots.resolveRoots()
	return { log: ext.log, roots, repo: ext.repo, git: ext.git, dexport: ext.dexport, options }
}
