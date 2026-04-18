/**
 * @module command/input
 *
 * Input sources for the dl pipeline.
 *
 * An input source is simply an `AsyncIterable<string>` — anything that yields
 * repo URLs or org/repo strings over time. Commands compose sources and pass
 * the merged stream to {@link processEntries}.
 *
 * Built-in sources:
 * - {@link positionalSource}: yields a fixed set of CLI positional args
 * - {@link watchSource}: yields lines appended to ~/archlist
 * - {@link clipboardSource}: yields clipboard text as it changes
 *
 * Sources are merged sequentially with {@link mergeSources}: it drains each
 * source fully before moving to the next. This matches the current behavior
 * where positionals are processed first, then watch/clipboard take over.
 */

import { appendFile, open, stat, watch } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { startWatch, getText, type ClipboardWatcherJs } from "@crosscopy/clipboard"
import { prependOrg } from "./prepend-org.ts"
import type { LogExtension } from "../plugin/log.ts"

export type InputSource = AsyncIterable<string>

export async function* positionalSource(org: string | undefined, positionals: readonly string[]): InputSource {
	for (const input of prependOrg(org, positionals)) {
		yield input
	}
}

export async function* mergeSources(sources: readonly InputSource[]): InputSource {
	for (const source of sources) {
		yield* source
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

/**
 * Yields lines appended to `~/archlist` as they appear.
 *
 * Watches the file with `fs.watch`, reads appended bytes on change events,
 * and yields complete lines. Handles partial lines (trailing newline not yet
 * written) by buffering until the next change event.
 */
export async function* watchSource(log: LogExtension): InputSource {
	const archlistPath = join(homedir(), "archlist")
	await appendFile(archlistPath, "")

	let filePosition = (await stat(archlistPath)).size
	let trailing = ""

	log.info("sync", "watching", { path: archlistPath })
	const abortController = new AbortController()

	process.on("SIGINT", () => abortController.abort())
	process.on("SIGTERM", () => abortController.abort())

	try {
		for await (const event of watch(archlistPath, { signal: abortController.signal })) {
			if (event.eventType !== "change") {
				log.debug("sync", "watch_event_ignored", { eventType: event.eventType })
				continue
			}

			const { text, nextPosition } = await readAppendedText(archlistPath, filePosition)
			filePosition = nextPosition
			if (!text) continue

			const parsed = parseAppendedLines(`${trailing}${text}`)
			trailing = parsed.remainder
			for (const line of parsed.lines) {
				log.info("sync", "watch_entry", { input: line })
				yield line
			}
		}
	} catch (error) {
		if (!(error instanceof Error) || error.name !== "AbortError") {
			throw error
		}
	}

	log.info("sync", "watch_stopped", { path: archlistPath })
}

/**
 * Yields clipboard text as it changes.
 *
 * Deduplicates consecutive identical values and ignores empty/whitespace-only
 * content. Stops on SIGINT/SIGTERM.
 */
export async function* clipboardSource(log: LogExtension): InputSource {
	let lastText = ""
	const watcher: ClipboardWatcherJs = startWatch(async () => {})

	log.info("sync", "clipboard_watching", {})

	const buffer: string[] = []
	let resolveNext: ((done: boolean) => void) | null = null

	const originalCallback = watcher

	const pollInterval = setInterval(async () => {
		try {
			const text = await getText()
			const trimmed = text.trim()
			if (!trimmed || trimmed === lastText) return
			lastText = trimmed
			buffer.push(trimmed)
			if (resolveNext) {
				resolveNext(false)
				resolveNext = null
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			log.error("sync", "clipboard_read_failed", { message })
		}
	}, 500)

	try {
		while (true) {
			if (buffer.length > 0) {
				const value = buffer.shift()!
				log.info("sync", "clipboard_entry", { input: value })
				yield value
				continue
			}

			const next = await new Promise<boolean>((resolve) => {
				resolveNext = resolve
				process.once("SIGINT", () => resolve(true))
				process.once("SIGTERM", () => resolve(true))
			})

			if (next) break
		}
	} finally {
		clearInterval(pollInterval)
		watcher.stop()
		log.info("sync", "clipboard_stopped", {})
	}
}
