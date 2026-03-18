import { appendFile, open, stat, watch } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { LogExtension } from "../plugin/log.ts"

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

export async function watchArchlist(
	processEntry: (input: string) => Promise<boolean>,
	log: LogExtension,
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
				hadError = (await processEntry(nextInput)) || hadError
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
				log.error("sync", "watch_failed", { message })
			})
	}

	log.info("sync", "watching", { path: archlistPath })
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
