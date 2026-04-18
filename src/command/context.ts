import type { DlOptions } from "../action/types.ts"
import {
	DL_ACTIONS_PLUGIN_ID,
	type DlActionsExtension,
} from "../plugin/dl-actions.ts"
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
	RESOLVE_STREAM_PLUGIN_ID,
	type ResolveStreamExtension,
} from "../plugin/resolve-stream.ts"
import {
	ROOTS_PLUGIN_ID,
	type RootsExtension,
} from "../plugin/roots.ts"

export interface DlExtensions extends Record<string, unknown> {
	[DL_ACTIONS_PLUGIN_ID]: DlActionsExtension
	[ROOTS_PLUGIN_ID]: RootsExtension
	[REPO_PLUGIN_ID]: RepoExtension
	[RESOLVE_STREAM_PLUGIN_ID]: ResolveStreamExtension
	[GIT_PLUGIN_ID]: GitExtension
	[DEXPORT_PLUGIN_ID]: DexportExtension
	[LOG_PLUGIN_ID]: LogExtension
}

export type DlCommandParams = { extensions: DlExtensions }

export interface DlRunCtx {
	actions: DlActionsExtension
	log: LogExtension
	roots: { archiveRoot: string; wikiRoot: string }
	repo: RepoExtension
	options: DlOptions
}

export function requireExtensions(extensions: DlExtensions) {
	const actions = extensions[DL_ACTIONS_PLUGIN_ID]
	const log = extensions[LOG_PLUGIN_ID]
	const roots = extensions[ROOTS_PLUGIN_ID]
	const repo = extensions[REPO_PLUGIN_ID]
	if (!actions) throw new Error("dl: actions plugin extension is not available")
	if (!log) throw new Error("dl: log plugin extension is not available")
	if (!roots) throw new Error("dl: roots plugin extension is not available")
	if (!repo) throw new Error("dl: repo plugin extension is not available")
	return { actions, log, roots, repo }
}

export async function resolveDlSetup(
	extensions: DlExtensions,
	options: DlOptions,
): Promise<DlRunCtx> {
	const ext = requireExtensions(extensions)
	const roots = await ext.roots.resolveRoots()
	return {
		actions: ext.actions,
		log: ext.log,
		roots,
		repo: ext.repo,
		options,
	}
}
