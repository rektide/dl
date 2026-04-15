import { startWatch, getText, type ClipboardWatcherJs } from "@crosscopy/clipboard"
import type { LogExtension } from "../plugin/log.ts"

export async function watchClipboard(
	processEntry: (input: string) => Promise<boolean>,
	log: LogExtension,
): Promise<boolean> {
	let hadError = false
	let lastText = ""
	let processing = false
	const queue: string[] = []

	const drainQueue = async () => {
		if (processing) return
		processing = true
		try {
			while (queue.length > 0) {
				const nextInput = queue.shift()
				if (!nextInput) continue
				log.info("sync", "clipboard_entry", { input: nextInput })
				hadError = (await processEntry(nextInput)) || hadError
			}
		} finally {
			processing = false
		}
	}

	const watcher: ClipboardWatcherJs = startWatch(async () => {
		try {
			const text = await getText()
			const trimmed = text.trim()
			if (!trimmed || trimmed === lastText) return
			lastText = trimmed
			queue.push(trimmed)
			await drainQueue()
		} catch (error) {
			hadError = true
			const message = error instanceof Error ? error.message : String(error)
			log.error("sync", "clipboard_read_failed", { message })
		}
	})

	log.info("sync", "clipboard_watching", {})

	await new Promise<void>((resolve) => {
		const cleanup = () => {
			process.removeListener("SIGINT", onSignal)
			process.removeListener("SIGTERM", onSignal)
			resolve()
		}
		const onSignal = () => {
			watcher.stop()
			cleanup()
		}
		process.on("SIGINT", onSignal)
		process.on("SIGTERM", onSignal)
	})

	log.info("sync", "clipboard_stopped", {})
	return hadError
}
