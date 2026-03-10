import { access, appendFile, lstat, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { x } from "tinyexec"
import {
	linkSpecificProject,
} from "../repo/link.ts"
import { normalizeCloneUrl, resolveRepository } from "./repository.ts"
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

async function trackMainBookmark(destination: string): Promise<void> {
	const result = await x("git", ["remote"], { nodeOptions: { cwd: destination } })
	const remotes = result.stdout.trim().split("\n").filter(Boolean)
	for (const remote of remotes) {
		try {
			await x("jj", ["bookmark", "track", `main@${remote}`], {
				throwOnError: true,
				nodeOptions: { cwd: destination, stdio: "inherit" },
			})
		} catch {}
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

async function cloneOrUpdate(
	remoteUrl: string,
	destination: string,
): Promise<void> {
	const normalizedRemoteUrl = normalizeCloneUrl(remoteUrl)
	const gitDir = join(destination, ".git")
	if (await exists(gitDir)) {
		await x("git", ["-C", destination, "pull", "--ff-only"], {
			throwOnError: true,
			nodeOptions: { stdio: "inherit" },
		})
		return
	}

	if (await exists(destination)) {
		throw new Error(
			`Destination exists and is not a git checkout: ${destination}`,
		)
	}

	await mkdir(dirname(destination), { recursive: true })
	await x("git", ["clone", normalizedRemoteUrl, destination], {
		throwOnError: true,
		nodeOptions: { stdio: "inherit" },
	})
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

		const archiveDestination = join(roots.archiveRoot, resolved.namespacePath)
		const wikiDestination = join(roots.wikiRoot, resolved.namespacePath)

		if (options.doArchive) {
			console.log(`archive: ${archiveDestination}`)
			await cloneOrUpdate(resolved.cloneUrl, archiveDestination)
			if (!(await exists(join(archiveDestination, ".jj")))) {
				await x("jj", ["git", "init"], {
					throwOnError: true,
					nodeOptions: { cwd: archiveDestination, stdio: "inherit" },
				})
				await trackMainBookmark(archiveDestination)
			}
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
