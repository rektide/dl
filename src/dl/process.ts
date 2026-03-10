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

async function runCommand(
	command: string,
	args: string[],
	cwd?: string,
): Promise<void> {
	await x(command, args, {
		throwOnError: true,
		nodeOptions: {
			cwd,
			stdio: "inherit",
		},
	})
}

async function getCommandOutput(
	command: string,
	args: string[],
	cwd: string,
): Promise<string> {
	const result = await x(command, args, {
		nodeOptions: { cwd },
	})
	return result.stdout.trim()
}

async function trackMainBookmark(destination: string): Promise<void> {
	const remotesOutput = await getCommandOutput("git", ["remote"], destination)
	const remotes = remotesOutput.split("\n").filter(Boolean)
	for (const remote of remotes) {
		try {
			await runCommand(
				"jj",
				["bookmark", "track", `main@${remote}`],
				destination,
			)
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
		await runCommand("git", ["-C", destination, "pull", "--ff-only"])
		return
	}

	if (await exists(destination)) {
		throw new Error(
			`Destination exists and is not a git checkout: ${destination}`,
		)
	}

	await mkdir(dirname(destination), { recursive: true })
	await runCommand("git", ["clone", normalizedRemoteUrl, destination])
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
				await runCommand("jj", ["git", "init"], archiveDestination)
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
							await runCommand(
								dexportPath,
								["--output", roots.wikiRoot, "--strip-host", deepwikiUrl],
								homedir(),
							)
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
