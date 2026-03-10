import { access, appendFile, lstat } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { x } from "tinyexec"
import { cloneOrUpdate } from "../archive/git.ts"
import { syncArchive } from "../archive/sync.ts"
import {
	linkSpecificProject,
} from "../repo/link.ts"
import { resolveRepository } from "./repository.ts"
import type { DestinationRoots, ProcessInputOptions } from "./types.ts"

async function exists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	} catch {
		return false
	}
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		const stats = await lstat(path)
		return stats.isDirectory()
	} catch {
		return false
	}
}

function runDetached(command: string, args: string[], cwd: string): void {
	const proc = x(command, args, {
		persist: true,
		nodeOptions: {
			cwd,
			stdio: "ignore",
			detached: true,
		},
	})
	proc.process?.unref()
}

export async function processInput(
	input: string,
	roots: DestinationRoots,
	options: ProcessInputOptions,
): Promise<boolean> {
	try {
		const resolved = await resolveRepository(input)
		if (options.doArchlist) {
			const archlistPath = join(homedir(), "archlist")
			await appendFile(archlistPath, `${resolved.cloneUrl}\n`)
		}

		const wikiDestination = join(roots.wikiRoot, resolved.namespacePath)

		if (options.doArchive) {
			await syncArchive(resolved, roots)
		}

		if (options.doWiki) {
			console.log(`wiki: ${wikiDestination}`)
			if (resolved.host === "github.com") {
				const dexportPath = join(
					homedir(),
					"src",
					"dexport",
					"src",
					"cli.ts",
				)
				if (await exists(dexportPath)) {
					const deepwikiUrl = `https://deepwiki.com/${resolved.org}/${resolved.repo}`
					if (await isDirectory(wikiDestination)) {
						if (!options.noLogCache) {
							console.log(
								`dexport: skipped because ${wikiDestination} already exists`,
							)
						}
					} else if (options.consumeDexportOutput) {
						try {
							runDetached(
								dexportPath,
								["--output", roots.wikiRoot, "--strip-host", deepwikiUrl],
								homedir(),
							)
							console.log(`dexport: queued ${deepwikiUrl}`)
						} catch (error) {
							const message =
								error instanceof Error ? error.message : String(error)
							console.warn(`dexport skipped: ${message}`)
						}
					} else {
						try {
							console.log(`dexport: running ${deepwikiUrl}`)
							await x(dexportPath, ["--output", roots.wikiRoot, "--strip-host", deepwikiUrl], {
								throwOnError: true,
								nodeOptions: { cwd: homedir(), stdio: "inherit" },
							})
						} catch (error) {
							const message =
								error instanceof Error ? error.message : String(error)
							console.warn(`dexport skipped: ${message}`)
						}
					}
				} else {
					console.warn(`dexport skipped: not found at ${dexportPath}`)
				}
			} else {
				const wikiRemoteUrl = `https://${resolved.host}/${resolved.namespacePath}.wiki.git`
				try {
					await cloneOrUpdate(wikiRemoteUrl, wikiDestination)
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error)
					console.warn(`wiki fetch skipped: ${message}`)
				}
			}
		}

		if (options.doArchive && options.doWiki) {
			const linkErrors = await linkSpecificProject({
				archiveRoot: roots.archiveRoot,
				wikiRoot: roots.wikiRoot,
				namespacePath: resolved.namespacePath,
				onEvent: (event, useErrorStream = false) => {
					if (!event.status.startsWith("error")) {
						return
					}
					const line = JSON.stringify(event)
					if (useErrorStream) {
						console.error(line)
						return
					}
					console.log(line)
				},
			})
			if (linkErrors) {
				return true
			}
		}

		return false
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(message)
		return true
	}
}
