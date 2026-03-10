#!/usr/bin/env node
import { access, appendFile, lstat, mkdir, open, realpath, stat, watch } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { define, cli } from "gunshi"
import { c12 } from "gunshi-c12"
import { x } from "tinyexec"
import {
	linkSpecificProject,
	resolveDestinationRoots,
	type LinkContext,
} from "../repo/link.ts"

const COMMAND_NAME = "dl"

interface ParsedArgs {
	inputs: string[]
	watch: boolean
	consumeDexportOutput: boolean
	noLogCache: boolean
	doArchive: boolean
	doWiki: boolean
	doArchlist: boolean
}

interface ResolvedRepo {
	host: string
	namespacePath: string
	org: string
	repo: string
	cloneUrl: string
}

export interface ParsedRepositoryInput {
	host?: string
	repoPathCandidates: string[]
	preferGitHub: boolean
}

interface DlCommandContext extends LinkContext {}

function parseArgs(argv: string[]): ParsedArgs {
	const tokens = argv[0] === COMMAND_NAME ? argv.slice(1) : argv
	const inputs = tokens.filter((token) => !token.startsWith("-"))
	const consumeDexportOutput =
		tokens.includes("--consume-dexport-output") || tokens.includes("-c")
	const watch = tokens.includes("--watch")
	const noLogCache = tokens.includes("--no-log-cache")
	const hasArchiveFlag = tokens.includes("--archive")
	const hasWikiFlag = tokens.includes("--wiki")
	const hasArchlistFlag = tokens.includes("--archlist")

	// ADR: Action flags (archive, wiki, archlist) are all on by default.
	// If any action flag is explicitly set, only those explicitly-set actions run.
	let doArchive = true
	let doWiki = true
	let doArchlist = true
	if (hasArchiveFlag || hasWikiFlag || hasArchlistFlag) {
		doArchive = hasArchiveFlag
		doWiki = hasWikiFlag
		doArchlist = hasArchlistFlag
	}
	return {
		inputs,
		watch,
		consumeDexportOutput,
		noLogCache,
		doArchive,
		doWiki,
		doArchlist,
	}
}

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

async function urlExists(url: string): Promise<boolean> {
	try {
		const response = await fetch(url, {
			method: "HEAD",
			redirect: "manual",
			signal: AbortSignal.timeout(8000),
		})
		return response.status >= 200 && response.status < 400
	} catch {
		return false
	}
}

function normalizeCloneUrl(remoteUrl: string): string {
	const trimmed = remoteUrl.trim()
	if (/^[a-z]+:\/\//i.test(trimmed) || /^git@/.test(trimmed)) {
		return trimmed
	}

	const withoutLeadingSlashes = trimmed.replace(/^\/+/, "")
	const withScheme = `https://${withoutLeadingSlashes}`
	return withScheme.endsWith(".git") ? withScheme : `${withScheme}.git`
}

function buildRepoPathCandidates(
	host: string | undefined,
	segments: string[],
): string[] {
	const candidates: string[] = []
	const addCandidate = (value: string) => {
		if (!value || candidates.includes(value)) {
			return
		}
		candidates.push(value)
	}

	const markerIndex = segments.indexOf("-")
	if (markerIndex >= 2) {
		addCandidate(segments.slice(0, markerIndex).join("/"))
	}

	const isGitHubHost = host?.includes("github.com") ?? false
	const isGitLabHost = host?.includes("gitlab") ?? false
	const hasGitHubMarker =
		segments.includes("blob") ||
		segments.includes("tree") ||
		segments.includes("raw")

	if (isGitHubHost || hasGitHubMarker) {
		addCandidate(segments.slice(0, 2).join("/"))
	}

	if (isGitLabHost || !host) {
		for (let length = segments.length; length >= 2; length--) {
			addCandidate(segments.slice(0, length).join("/"))
		}
	}

	if (!isGitHubHost && !isGitLabHost && !hasGitHubMarker) {
		addCandidate(segments.slice(0, 2).join("/"))
	}

	return candidates
}

export function parseRepositoryInput(input: string): ParsedRepositoryInput {
	const trimmedInput = input.trim()
	if (!trimmedInput) {
		throw new Error(`dl: unsupported repository input: ${input}`)
	}

	let host = ""
	let path = ""

	const sshMatch = trimmedInput.match(/^git@([^:]+):(.+)$/)
	if (sshMatch) {
		host = sshMatch[1]
		path = sshMatch[2]
	} else if (/^[a-z]+:\/\//i.test(trimmedInput)) {
		const url = new URL(trimmedInput)
		host = url.host
		path = url.pathname
	} else {
		const withoutQuery = trimmedInput.split(/[?#]/, 1)[0] ?? ""
		const normalized = withoutQuery.replace(/^\/+/, "")
		const firstSegment = normalized.split("/")[0] ?? ""
		const looksLikeHostPath =
			normalized.includes("/") &&
			(firstSegment.includes(".") || firstSegment === "localhost")

		if (looksLikeHostPath) {
			const url = new URL(`https://${trimmedInput}`)
			host = url.host
			path = url.pathname
		} else {
			path = normalized
		}
	}

	path = path.split(/[?#]/, 1)[0] ?? ""
	path = path.replace(/^\/+/, "")
	path = path.replace(/\.git$/, "")

	const segments = path.split("/").filter(Boolean)
	if (segments.length < 2) {
		throw new Error(`dl: unsupported repository input: ${input}`)
	}

	const hasGitHubMarker =
		segments.includes("blob") ||
		segments.includes("tree") ||
		segments.includes("raw")
	const repoPathCandidates = buildRepoPathCandidates(
		host || undefined,
		segments,
	)
	if (repoPathCandidates.length === 0) {
		throw new Error(`dl: unsupported repository input: ${input}`)
	}

	return {
		host: host || undefined,
		repoPathCandidates,
		preferGitHub: hasGitHubMarker,
	}
}

async function validateRepositoryPath(
	host: string,
	repoPath: string,
): Promise<string | null> {
	const signal = AbortSignal.timeout(8000)

	if (host.includes("github.com")) {
		const parts = repoPath.split("/").filter(Boolean)
		if (parts.length !== 2) {
			return null
		}

		const base =
			host === "github.com"
				? "https://api.github.com"
				: `https://${host}/api/v3`
		const response = await fetch(`${base}/repos/${parts[0]}/${parts[1]}`, {
			method: "GET",
			headers: {
				"user-agent": "rekon-dl",
			},
			signal,
		}).catch(() => null)

		if (!response || !response.ok) {
			return null
		}
		return `${parts[0]}/${parts[1]}`
	}

	if (host.includes("gitlab")) {
		const encodedPath = encodeURIComponent(repoPath)
		const response = await fetch(
			`https://${host}/api/v4/projects/${encodedPath}`,
			{
				method: "GET",
				headers: {
					"user-agent": "rekon-dl",
				},
				signal,
			},
		).catch(() => null)

		if (!response || !response.ok) {
			return null
		}

		const body = (await response.json()) as { path_with_namespace?: string }
		return body.path_with_namespace ?? repoPath
	}

	if (await urlExists(`https://${host}/${repoPath}`)) {
		return repoPath
	}

	return null
}

async function resolveRepository(input: string): Promise<ResolvedRepo> {
	const parsed = parseRepositoryInput(input)

	const hostCandidates = parsed.host
		? [parsed.host]
		: parsed.preferGitHub
			? ["github.com", "gitlab.com"]
			: ["gitlab.com", "github.com"]

	const isKnownHost = (h: string) =>
		h.includes("github.com") || h.includes("gitlab")

	for (const host of hostCandidates) {
		for (const repoPath of parsed.repoPathCandidates) {
			let namespacePath: string | null = null

			if (parsed.host && !isKnownHost(host)) {
				namespacePath = repoPath
			} else {
				namespacePath = await validateRepositoryPath(host, repoPath)
			}

			if (!namespacePath) {
				continue
			}

			const pathParts = namespacePath.split("/")
			const org = pathParts[0]
			const repo = pathParts[pathParts.length - 1]

			return {
				host,
				namespacePath,
				org,
				repo,
				cloneUrl: `https://${host}/${namespacePath}.git`,
			}
		}
	}

	const unresolvedSample = parsed.repoPathCandidates[0] ?? input
	const triedHosts = hostCandidates.join(", ")
	throw new Error(
		`dl: could not resolve host for ${unresolvedSample} (tried ${triedHosts})`,
	)
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

interface ProcessInputOptions {
	consumeDexportOutput: boolean
	noLogCache: boolean
	doArchive: boolean
	doWiki: boolean
	doArchlist: boolean
}

interface DestinationRoots {
	archiveRoot: string
	wikiRoot: string
}

async function processInput(
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

function parseAppendedLines(chunk: string): { lines: string[]; remainder: string } {
	const normalized = chunk.replace(/\r\n/g, "\n")
	const parts = normalized.split("\n")
	const remainder = parts.pop() ?? ""
	const lines = parts.map((line) => line.trim()).filter(Boolean)
	return { lines, remainder }
}

async function readAppendedText(
	filePath: string,
	position: number,
): Promise<{ text: string; nextPosition: number }> {
	const stats = await stat(filePath)
	if (stats.size <= position) {
		return { text: "", nextPosition: stats.size }
	}

	const bytesToRead = stats.size - position
	const handle = await open(filePath, "r")
	try {
		const buffer = Buffer.alloc(bytesToRead)
		await handle.read(buffer, 0, bytesToRead, position)
		return { text: buffer.toString("utf8"), nextPosition: stats.size }
	} finally {
		await handle.close()
	}
}

async function watchArchlist(
	roots: DestinationRoots,
	options: ProcessInputOptions,
): Promise<boolean> {
	const archlistPath = join(homedir(), "archlist")
	await appendFile(archlistPath, "")

	let hadError = false
	let filePosition = (await stat(archlistPath)).size
	let trailing = ""
	const queue: string[] = []
	let processing = false

	const drainQueue = async () => {
		if (processing) {
			return
		}
		processing = true
		try {
			while (queue.length > 0) {
				const nextInput = queue.shift()
				if (!nextInput) {
					continue
				}
				hadError =
					(await processInput(nextInput, roots, options)) || hadError
			}
		} finally {
			processing = false
		}
	}

	let readChain = Promise.resolve()
	const scheduleRead = () => {
		readChain = readChain
			.then(async () => {
				const { text, nextPosition } = await readAppendedText(
					archlistPath,
					filePosition,
				)
				filePosition = nextPosition
				if (!text) {
					return
				}

				const parsed = parseAppendedLines(`${trailing}${text}`)
				trailing = parsed.remainder
				for (const line of parsed.lines) {
					queue.push(line)
				}
				await drainQueue()
			})
			.catch((error) => {
				hadError = true
				const message = error instanceof Error ? error.message : String(error)
				console.error(message)
			})
	}

	console.log(`watching: ${archlistPath}`)
	const abortController = new AbortController()

	process.on("SIGINT", () => {
		abortController.abort()
	})
	process.on("SIGTERM", () => {
		abortController.abort()
	})

	try {
		for await (const event of watch(archlistPath, { signal: abortController.signal })) {
			if (event.eventType !== "change") {
				continue
			}
			scheduleRead()
		}
	} catch (error) {
		if (!(error instanceof Error) || error.name !== "AbortError") {
			throw error
		}
	}

	await readChain
	return hadError
}

async function run(ctx?: DlCommandContext) {
	try {
		const {
			inputs,
			watch,
			consumeDexportOutput,
			noLogCache,
			doArchive,
			doWiki,
			doArchlist,
		} =
			parseArgs(process.argv.slice(2))
		if (inputs.length === 0 && !watch) {
			console.error(
				"usage: rekon dl [--watch] <repo-url|org/repo> [repo-url|org/repo ...]",
			)
			process.exit(1)
		}

		const { archiveRoot, wikiRoot } = await resolveDestinationRoots(ctx)
		const roots = { archiveRoot, wikiRoot }

		const options: ProcessInputOptions = {
			consumeDexportOutput,
			noLogCache,
			doArchive,
			doWiki,
			doArchlist,
		}

		if (watch && options.doArchlist) {
			console.warn("--watch disables --archlist to avoid feedback loops")
			options.doArchlist = false
		}

		let hadError = false
		for (const input of inputs) {
			hadError = (await processInput(input, roots, options)) || hadError
		}

		if (watch) {
			hadError = (await watchArchlist(roots, options)) || hadError
		}

		if (hadError) {
			process.exit(1)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(message)
		process.exit(1)
	}
}

export default define({
	name: COMMAND_NAME,
	description: "Fetch repository checkout and wiki checkout",
	args: {
		"consume-dexport-output": {
			type: "boolean",
			short: "c",
			default: false,
			description: "Run dexport detached and suppress its output",
		},
		"no-log-cache": {
			type: "boolean",
			default: false,
			description: "Disable logging of cached file names",
		},
		archive: {
			type: "boolean",
			default: false,
			description: "Only update archive (disables wiki unless --wiki also set)",
		},
		wiki: {
			type: "boolean",
			default: false,
			description: "Only update wiki (disables archive unless --archive also set)",
		},
		archlist: {
			type: "boolean",
			default: false,
			description: "Append resolved repository URLs to ~/archlist",
		},
		watch: {
			type: "boolean",
			default: false,
			description: "Watch ~/archlist and process appended entries serially",
		},
	},
	run,
})

void (async () => {
	const mainPath = await realpath(process.argv[1])
	const mainUrl = pathToFileURL(mainPath).href
	if (import.meta.url === mainUrl) {
		const module = await import("./dl.ts")
		await cli(process.argv.slice(2), module.default, {
			name: COMMAND_NAME,
			plugins: [c12({ name: "rekon" })],
		})
	}
})()
