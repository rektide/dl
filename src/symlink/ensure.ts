import { lstat, readlink, symlink } from "node:fs/promises"
import { join } from "node:path"
import type { LogExtension } from "../plugin/log.ts"
import { simplify } from "./simplify.ts"

/** Result of an {@link ensureSymlink} call. */
export type SimplifyStatus =
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
export function needsSymlink(original: string, simplified: string, anycase: boolean): boolean {
	if (simplified === original) return false
	if (!anycase && original.toLowerCase() === simplified) return false
	const first = original[0]
	if (!first) return false
	if (/^[a-z0-9]$/.test(first)) return false
	return true
}

export async function ensureSymlink(
	parentDir: string,
	original: string,
	simplified: string,
	dryRun: boolean,
	log: SimplifyLog | LogExtension,
	anycase = false,
): Promise<SimplifyStatus> {
	if (!needsSymlink(original, simplified, anycase)) return "skip_same"

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
