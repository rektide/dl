import { lstat, readlink, symlink } from "node:fs/promises"
import { join } from "node:path"
import type { LogExtension } from "../plugin/log.ts"
import type { RepoContext } from "../repo/context.ts"
import type { DlContext } from "../dl/types.ts"

/**
 * Lowercases and strips all non-alphanumeric characters from a name.
 *
 * @example
 * ```ts
 * simplify("Effect-TS")       // "effectts"
 * simplify("duckdb_mooncake") // "duckdbmooncake"
 * simplify("effect")          // "effect"
 * ```
 */
export function simplify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Result of an {@link ensureSymlink} call. */
type SimplifyStatus =
	| "skip_same"
	| "created"
	| "already_linked"
	| "conflict_symlink"
	| "conflict_exists"

/** Minimal logger interface accepted by {@link ensureSymlink}. */
export interface SimplifyLog {
	info: (stage: string, event: string, data?: Record<string, unknown>) => void
	warn: (stage: string, event: string, data?: Record<string, unknown>) => void
}

/**
 * Create a symlink at `parentDir/simplified` pointing to `original`, if it
 * doesn't already exist.
 *
 * Returns a {@link SimplifyStatus} describing what happened:
 * - `skip_same` — simplified name equals original, nothing to do
 * - `already_linked` — symlink already points to the correct target
 * - `conflict_symlink` — symlink exists but points elsewhere (no-op, logged)
 * - `conflict_exists` — non-symlink entry exists at path (no-op, logged)
 * - `created` — symlink was created (or would be, in dry-run mode)
 */
export async function ensureSymlink(
	parentDir: string,
	original: string,
	simplified: string,
	dryRun: boolean,
	log: SimplifyLog | LogExtension,
): Promise<SimplifyStatus> {
	if (simplified === original) return "skip_same"

	const linkPath = join(parentDir, simplified)

	try {
		const existing = await lstat(linkPath)
		if (existing.isSymbolicLink()) {
			const target = await readlink(linkPath)
			if (target === original) return "already_linked"
			log.warn("link", "conflict_symlink", { linkPath, existingTarget: target, wantedTarget: original })
			return "conflict_symlink"
		}
		log.warn("link", "conflict_exists", { linkPath, type: existing.isDirectory() ? "directory" : "file" })
		return "conflict_exists"
	} catch {
		// ENOENT — nothing there, proceed
	}

	if (dryRun) {
		log.info("dry-run", "would_link", { linkPath, target: original })
		return "created"
	}

	await symlink(original, linkPath, "junction")
	log.info("link", "created", { linkPath, target: original })
	return "created"
}

/**
 * Given a resolved repo context, create org-level and repo-level simplified
 * symlinks under the archive root. Runs as a step in the dl pipeline after
 * {@link syncArchive} so the real directory exists.
 */
export async function syncSimplify(
	resolved: RepoContext,
	ctx: DlContext,
): Promise<void> {
	if (!resolved.url) return

	const segments = resolved.url.pathname.replace(/^\//, "").split("/")
	if (segments.length < 2) return

	const org = segments[0]
	const project = segments[1].replace(/\.git$/, "")

	const simplifiedOrg = simplify(org)
	const simplifiedProject = simplify(project)
	const dryRun = ctx.options.dryRun

	await ensureSymlink(ctx.roots.archiveRoot, org, simplifiedOrg, dryRun, ctx.log)

	const orgDir = join(ctx.roots.archiveRoot, org)
	await ensureSymlink(orgDir, project, simplifiedProject, dryRun, ctx.log)
}
