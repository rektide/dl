import { plugin } from "gunshi/plugin"

export const LOG_PLUGIN_ID = "rekon:log" as const

export type LogLevel = "debug" | "info" | "warn" | "error"
export type LogStage = "expand" | "verify" | "enrich" | "sync" | "link"
export type LogStream = "stdout" | "stderr"

export interface LogEvent {
	level: LogLevel
	stage: LogStage
	event: string
	data: Record<string, unknown>
	timestamp?: string
}

export interface LogOptions {
	output?: LogStream
	outputStdout?: boolean
	outputStderr?: boolean
	json?: boolean
}

export interface LogExtension {
	log: (event: LogEvent) => void
	info: (stage: LogStage, event: string, data?: Record<string, unknown>) => void
	warn: (stage: LogStage, event: string, data?: Record<string, unknown>) => void
	error: (stage: LogStage, event: string, data?: Record<string, unknown>) => void
	getOutputStream: () => NodeJS.WritableStream
	getErrorStream: () => NodeJS.WritableStream
	getOutputStdout: () => NodeJS.WritableStream
	getOutputStderr: () => NodeJS.WritableStream
	formatEvent: (event: LogEvent) => string
}

function resolveOutputStream(options: LogOptions): LogStream {
	if (options.outputStdout) return "stdout"
	if (options.outputStderr) return "stderr"
	return options.output ?? "stdout"
}

function formatEventText(event: LogEvent): string {
	const ts = event.timestamp ?? new Date().toISOString()
	return `[${ts}] [${event.level}] [${event.stage}] ${event.event}: ${JSON.stringify(event.data)}`
}

function formatEventJson(event: LogEvent): string {
	return JSON.stringify({
		...event,
		timestamp: event.timestamp ?? new Date().toISOString(),
	})
}

export function createLogPlugin() {
	return plugin({
		id: LOG_PLUGIN_ID,
		name: "Rekon Log",
		setup: (ctx) => {
			ctx.addGlobalOption("output", {
				type: "string",
				description: "Default output stream (stdout|stderr)",
			})
			ctx.addGlobalOption("output-stdout", {
				type: "boolean",
				description: "Send output to stdout (overrides --output)",
			})
			ctx.addGlobalOption("output-stderr", {
				type: "boolean",
				description: "Send output to stderr (overrides --output)",
			})
			ctx.addGlobalOption("json", {
				type: "boolean",
				short: "j",
				description: "Output as JSON lines (ndjson)",
			})
		},
		extension: (core): LogExtension => {
			const values = core.values as LogOptions
			const outputStream = resolveOutputStream(values)
			const useJson = values.json ?? false
			const formatter = useJson ? formatEventJson : formatEventText

			const log = (event: LogEvent) => {
				const stream = outputStream === "stderr" ? process.stderr : process.stdout
				stream.write(formatter(event) + "\n")
			}

			const getOutputStdout = () =>
				outputStream === "stderr" ? process.stderr : process.stdout

			const getOutputStderr = () => process.stderr

			return {
				log,
				info: (stage, event, data = {}) => log({ level: "info", stage, event, data }),
				warn: (stage, event, data = {}) => log({ level: "warn", stage, event, data }),
				error: (stage, event, data = {}) => log({ level: "error", stage, event, data }),
				getOutputStream: getOutputStdout,
				getErrorStream: getOutputStderr,
				getOutputStdout,
				getOutputStderr,
				formatEvent: formatter,
			}
		},
	})
}
