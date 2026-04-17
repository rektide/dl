import { syncArchive } from "../archive/sync.ts"
import { defaultDexportOps } from "../dexport/default.ts"
import type { DexportOps } from "../dexport/types.ts"
import { defaultGitOps } from "../git/default.ts"
import type { GitOps } from "../git/types.ts"
import type { RepoContext } from "../repo/context.ts"
import type { RepoExtension } from "../plugin/repo.ts"
import { syncSimplify } from "../simplify/index.ts"
import { syncWiki } from "../wiki/sync.ts"
import type { DlOptions, DlContext } from "./types.ts"
import type { LogExtension } from "../plugin/log.ts"
import { createLifecycleReporter } from "./lifecycle.ts"
import { OFF, ENSURE } from "./actions.ts"
import { syncArchlist } from "./archlist.ts"

export async function processRepoContext(
	resolved: RepoContext,
	ctx: DlContext,
	gitOps: GitOps = defaultGitOps,
	dexportOps: DexportOps = defaultDexportOps,
): Promise<boolean> {
	let hadError = false
	const lifecycle = createLifecycleReporter(resolved)

	try {
		const pathname = resolved.url?.pathname?.replace(/^\//, "")
		const doArchive = ctx.options.archiveState !== OFF
		const doWiki = ctx.options.wikiState !== OFF
		const doSymlink = ctx.options.symlinkState !== OFF
		if (ctx.options.dryRun) {
			ctx.log.info("dry-run", "would_sync", {
				url: resolved.url?.toString(),
				pathname,
				doArchive,
				doWiki,
				archivePath: doArchive && pathname
					? `${ctx.roots.archiveRoot}/${pathname}`
					: undefined,
				wikiPath: doWiki && pathname
					? `${ctx.roots.wikiRoot}/${pathname}`
					: undefined,
			})

			if (ctx.options.archlistState !== OFF) {
				lifecycle.ok({
					step: "archlist",
					source: "processRepoContext",
					transition: ctx.options.archlistState === ENSURE ? "would-append-if-absent" : "would-append",
				})
			} else {
				lifecycle.skipped({
					step: "archlist",
					source: "processRepoContext",
					transition: "off",
				})
			}

			if (doArchive) {
				lifecycle.ok({
					step: "archive",
					source: "processRepoContext",
					transition: "would-sync",
				})
				lifecycle.ok({
					step: "archive-jj",
					source: "processRepoContext",
					transition: "would-ensure",
				})
			} else {
				lifecycle.skipped({
					step: "archive",
					source: "processRepoContext",
					transition: "off",
				})
				lifecycle.skipped({
					step: "archive-jj",
					source: "processRepoContext",
					transition: "off",
				})
			}

			if (doSymlink) {
				lifecycle.ok({
					step: "symlink-org",
					source: "processRepoContext",
					transition: "would-ensure",
				})
				lifecycle.ok({
					step: "symlink-repo",
					source: "processRepoContext",
					transition: "would-ensure",
				})
			} else {
				lifecycle.skipped({
					step: "symlink-org",
					source: "processRepoContext",
					transition: "off",
				})
				lifecycle.skipped({
					step: "symlink-repo",
					source: "processRepoContext",
					transition: "off",
				})
			}

			if (doWiki) {
				lifecycle.ok({
					step: "wiki-dexport",
					source: "processRepoContext",
					transition: "would-sync",
				})
				lifecycle.ok({
					step: "wiki-git",
					source: "processRepoContext",
					transition: "would-sync",
				})
			} else {
				lifecycle.skipped({
					step: "wiki-dexport",
					source: "processRepoContext",
					transition: "off",
				})
				lifecycle.skipped({
					step: "wiki-git",
					source: "processRepoContext",
					transition: "off",
				})
			}
		} else {
			const archlistResult = await syncArchlist(
				resolved.url!.toString(),
				ctx.options.archlistState,
				lifecycle,
				ctx.log,
			)
			if (archlistResult.hadError) hadError = true

			if (doArchive) {
				try {
					const archiveReport = await syncArchive(resolved, ctx, gitOps)
					lifecycle.ok({
						step: "archive",
						source: "syncArchive -> git.cloneOrUpdate",
						transition: archiveReport.archiveStatus,
						details: { destination: archiveReport.destination },
					})
					lifecycle.ok({
						step: "archive-jj",
						source: "syncArchive -> git.ensureJjInitialized",
						transition: archiveReport.jjStatus,
						details: { destination: archiveReport.destination },
					})
				} catch (error) {
					hadError = true
					const message = error instanceof Error ? error.message : String(error)
					ctx.log.error("sync", "archive_failed", { message })
					lifecycle.failed({
						step: "archive",
						source: "syncArchive",
						transition: "error",
						details: { message },
					})
					lifecycle.failed({
						step: "archive-jj",
						source: "syncArchive",
						transition: "blocked",
						details: { message: "archive sync failed before jj initialization" },
					})
				}
			} else {
				lifecycle.skipped({
					step: "archive",
					source: "processRepoContext",
					transition: "off",
				})
				lifecycle.skipped({
					step: "archive-jj",
					source: "processRepoContext",
					transition: "off",
				})
			}

			if (doSymlink) {
				try {
					const simplifyReport = await syncSimplify(resolved, ctx)
					if (simplifyReport.orgStatus === "skipped") {
						lifecycle.skipped({
							step: "symlink-org",
							source: "syncSimplify",
							transition: simplifyReport.orgStatus,
						})
					} else {
						lifecycle.ok({
							step: "symlink-org",
							source: "syncSimplify -> ensureSymlink",
							transition: simplifyReport.orgStatus,
							details: { org: simplifyReport.org },
						})
					}

					if (simplifyReport.projectStatus === "skipped") {
						lifecycle.skipped({
							step: "symlink-repo",
							source: "syncSimplify",
							transition: simplifyReport.projectStatus,
						})
					} else {
						lifecycle.ok({
							step: "symlink-repo",
							source: "syncSimplify -> ensureSymlink",
							transition: simplifyReport.projectStatus,
							details: { org: simplifyReport.org, project: simplifyReport.project },
						})
					}
				} catch (error) {
					hadError = true
					const message = error instanceof Error ? error.message : String(error)
					ctx.log.error("sync", "simplify_failed", { message })
					lifecycle.failed({
						step: "symlink-org",
						source: "syncSimplify",
						transition: "error",
						details: { message },
					})
					lifecycle.failed({
						step: "symlink-repo",
						source: "syncSimplify",
						transition: "error",
						details: { message },
					})
				}
			} else {
				lifecycle.skipped({
					step: "symlink-org",
					source: "processRepoContext",
					transition: "off",
				})
				lifecycle.skipped({
					step: "symlink-repo",
					source: "processRepoContext",
					transition: "off",
				})
			}

			if (doWiki) {
				try {
					const wikiReport = await syncWiki(resolved, ctx, gitOps, dexportOps)

					if (wikiReport.dexport.status === "failed") {
						lifecycle.failed({
							step: "wiki-dexport",
							source: "syncWiki -> dexportOps.sync",
							transition: wikiReport.dexport.status,
							details: {
								plan: wikiReport.dexport.plan,
								reason: wikiReport.dexport.reason,
								destination: wikiReport.destination,
							},
						})
					} else if (wikiReport.dexport.status === "skipped") {
						lifecycle.skipped({
							step: "wiki-dexport",
							source: "syncWiki -> dexportOps.sync",
							transition: wikiReport.dexport.status,
							details: {
								plan: wikiReport.dexport.plan,
								reason: wikiReport.dexport.reason,
								destination: wikiReport.destination,
							},
						})
					} else {
						lifecycle.ok({
							step: "wiki-dexport",
							source: "syncWiki -> dexportOps.sync",
							transition: wikiReport.dexport.status,
							details: {
								plan: wikiReport.dexport.plan,
								reason: wikiReport.dexport.reason,
								destination: wikiReport.destination,
							},
						})
					}

					if (wikiReport.gitWiki.status === "failed") {
						lifecycle.failed({
							step: "wiki-git",
							source: "syncWiki -> syncGitWiki",
							transition: wikiReport.gitWiki.status,
							details: {
								message: wikiReport.gitWiki.message,
								destination: wikiReport.destination,
							},
						})
					} else if (wikiReport.gitWiki.status === "not-applicable") {
						lifecycle.skipped({
							step: "wiki-git",
							source: "syncWiki",
							transition: wikiReport.gitWiki.status,
							details: {
								reason: wikiReport.gitWiki.reason,
								destination: wikiReport.destination,
							},
						})
					} else {
						lifecycle.ok({
							step: "wiki-git",
							source: "syncWiki -> syncGitWiki",
							transition: wikiReport.gitWiki.status,
							details: { destination: wikiReport.destination },
						})
					}
				} catch (error) {
					hadError = true
					const message = error instanceof Error ? error.message : String(error)
					ctx.log.error("sync", "wiki_failed", { message })
					lifecycle.failed({
						step: "wiki-dexport",
						source: "syncWiki",
						transition: "error",
						details: { message },
					})
					lifecycle.failed({
						step: "wiki-git",
						source: "syncWiki",
						transition: "error",
						details: { message },
					})
				}
			} else {
				lifecycle.skipped({
					step: "wiki-dexport",
					source: "processRepoContext",
					transition: "off",
				})
				lifecycle.skipped({
					step: "wiki-git",
					source: "processRepoContext",
					transition: "off",
				})
			}
		}
	} catch (error) {
		hadError = true
		const message = error instanceof Error ? error.message : String(error)
		ctx.log.error("sync", "failed", { message })
		lifecycle.failed({
			step: "pipeline",
			source: "processRepoContext",
			transition: "error",
			details: { message },
		})
	} finally {
		if (ctx.options.reportLifecycle) {
			ctx.log.info("sync", "lifecycle_report", lifecycle.summary(hadError))
		}
	}

	return hadError
}

export function createProcessEntry(
	repoExtension: RepoExtension,
	roots: DlContext["roots"],
	options: DlOptions,
	log: LogExtension,
	gitOps: GitOps = defaultGitOps,
	dexportOps: DexportOps = defaultDexportOps,
): (input: string) => Promise<boolean> {
	return async (input: string) => {
		try {
			const ctx: DlContext = { roots, options, log }
			let hadError = false
			let found = false
			for await (const resolved of repoExtension.resolve(input)) {
				found = true
				hadError = (await processRepoContext(resolved, ctx, gitOps, dexportOps)) || hadError
			}
			if (!found) {
				log.warn("sync", "no_match", { input })
			}
			return hadError
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			log.error("sync", "failed", { message })
			return true
		}
	}
}
