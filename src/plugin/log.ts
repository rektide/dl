import { plugin } from "gunshi/plugin"

export const LOG_PLUGIN_ID = "rekon:log" as const

export type LogLevel = "debug" | "info" | "warn" | "error"
export type LogStage = "candidates" | "dry-run" | "expand" | "verify" | "enrich" | "sync" | "link"

export interface LogEvent {
	level: LogLevel
	stage: LogStage
	event: string
	data: Record<string, unknown>
	timestamp?: string
}

export type OutputValue = true | false | "stdout" | "stderr"
export type StdioMode = "inherit" | "ignore" | "pipe"

export interface LogOptions {
	output?: OutputValue
	outputStdout?: OutputValue
	outputStderr?: OutputValue
	json?: boolean
}

export interface LogExtension {
	log: (event: LogEvent) => void
	debug: (stage: LogStage, event: string, data?: Record<string, unknown>) => void
	info: (stage: LogStage, event: string, data?: Record<string, unknown>) => void
	warn: (stage: LogStage, event: string, data?: Record<string, unknown>) => void
	error: (stage: LogStage, event: string, data?: Record<string, unknown>) => void
	formatEvent: (event: LogEvent) => string
	getOutputStdout: () => StdioMode | number
	getOutputStderr: () => StdioMode | number
}

function resolveStreamMode(
	specific: OutputValue | undefined,
	fallback: OutputValue | undefined,
): StdioMode | number {
	const val = specific ?? fallback ?? true
	if (val === true) return "inherit"
	if (val === false) return "ignore"
	if (val === "stdout") return 1
	if (val === "stderr") return 2
	return "inherit"
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
				description:
					'Default child process output (true|false|stdout|stderr). true=inherit, false=ignore, stdout/stderr=redirect',
			})
			ctx.addGlobalOption("output-stdout", {
				type: "string",
				description:
					'Child stdout handling (true|false|stdout|stderr). Overrides --output for stdout',
			})
			ctx.addGlobalOption("output-stderr", {
				type: "string",
				description:
					'Child stderr handling (true|false|stdout|stderr). Overrides --output for stderr',
			})
			ctx.addGlobalOption("json", {
				type: "boolean",
				short: "j",
				description: "Output as JSON lines (ndjson)",
			})
		},
		extension: (core): LogExtension => {
			const values = core.values as LogOptions
			const useJson = values.json ?? false
			const formatter = useJson ? formatEventJson : formatEventText

			const log = (event: LogEvent) => {
				process.stderr.write(formatter(event) + "\n")
			}

			const getOutputStdout = () => resolveStreamMode(values.outputStdout, values.output)
			const getOutputStderr = () => resolveStreamMode(values.outputStderr, values.output)

			return {
				log,
				debug: (stage, event, data = {}) => log({ level: "debug", stage, event, data }),
				info: (stage, event, data = {}) => log({ level: "info", stage, event, data }),
				warn: (stage, event, data = {}) => log({ level: "warn", stage, event, data }),
				error: (stage, event, data = {}) => log({ level: "error", stage, event, data }),
				formatEvent: formatter,
				getOutputStdout,
				getOutputStderr,
			}
		},
	})
}
