import type { Args } from "gunshi"

/**
 * Declarative definition of a dl action surfaced on the CLI.
 *
 * `states` is intentionally open-ended (`string`) so plugins can define
 * provider-specific state machines without editing core code.
 */
export interface DlActionSpec<State extends string = string> {
	/** CLI flag name, used as `--<name>` */
	readonly name: string
	/** Human description used in help output */
	readonly description: string
	/** State used when `--<name>` is provided without a value */
	readonly defaultState: State
	/** Allowed state values for this action */
	readonly states: ReadonlyArray<State>
	/** Optional target key in dl options mapping */
	readonly optionKey?: string
}

/**
 * Plugin extension contract for action providers.
 *
 * Any plugin can expose this field to contribute action metadata.
 */
export interface DlActionProviderExtension {
	readonly "dl:actions": ReadonlyArray<DlActionSpec>
}

/**
 * Minimal plugin context contract needed to register global options.
 */
export interface DlActionOptionRegistrar {
	addGlobalOption: (name: string, schema: Record<string, unknown>) => void
}

/**
 * Minimal token shape consumed from Gunshi command context.
 */
export interface DlActionToken {
	readonly kind?: string
	readonly name?: string
	readonly value?: string
	readonly inlineValue?: boolean
}

/**
 * Returns `true` when value looks like an action provider extension.
 */
export function isDlActionProviderExtension(value: unknown): value is DlActionProviderExtension {
	if (!value || typeof value !== "object") {
		return false
	}

	const candidate = value as { "dl:actions"?: unknown }
	return Array.isArray(candidate["dl:actions"])
}

/**
 * Deduplicates action specs by name while preserving first occurrence.
 */
export function dedupeActionSpecs(specs: ReadonlyArray<DlActionSpec>): Array<DlActionSpec> {
	const seen = new Set<string>()
	const deduped: Array<DlActionSpec> = []

	for (const spec of specs) {
		if (seen.has(spec.name)) {
			continue
		}
		seen.add(spec.name)
		deduped.push(spec)
	}

	return deduped
}

/**
 * Collects every `dl:actions` contribution from current plugin extensions.
 */
export function collectActionSpecsFromExtensions(
	extensions: Record<string, unknown>,
): Array<DlActionSpec> {
	const collected: Array<DlActionSpec> = []

	for (const value of Object.values(extensions)) {
		if (!isDlActionProviderExtension(value)) {
			continue
		}
		collected.push(...value["dl:actions"])
	}

	return dedupeActionSpecs(collected)
}

function validState(spec: DlActionSpec, value: unknown): string | null {
	if (typeof value !== "string") {
		return null
	}
	if (!spec.states.includes(value)) {
		return null
	}
	return value
}

/**
 * Derives the state-option key for an action.
 *
 * Example: `archlist` -> `archlist-state`
 */
export function stateOptionName(spec: DlActionSpec): string {
	return `${spec.name}-state`
}

/**
 * Converts action specs into Gunshi args definitions.
 */
export function buildActionArgs(specs: ReadonlyArray<DlActionSpec>): Args {
	const args: Args = {}

	for (const spec of specs) {
		args[spec.name] = {
			type: "boolean",
			default: false,
			description: `${spec.description} (bare --${spec.name} uses default state '${spec.defaultState}')`,
		}
		args[stateOptionName(spec)] = {
			type: "enum",
			choices: [...spec.states],
			description: `${spec.description} state (${spec.states.join("|")})`,
		}
	}

	return args
}

/**
 * Registers action args as global options via Gunshi plugin setup.
 */
export function registerActionGlobalOptions(
	ctx: DlActionOptionRegistrar,
	specs: ReadonlyArray<DlActionSpec>,
): void {
	const args = buildActionArgs(specs)
	for (const [name, schema] of Object.entries(args)) {
		ctx.addGlobalOption(name, schema as Record<string, unknown>)
	}
}

/**
 * Resolves a single action state from parsed values.
 */
export function resolveActionState(spec: DlActionSpec, value: unknown): string {
	return validState(spec, value) ?? spec.defaultState
}

/**
 * Reads `--action=<state>` inline values from Gunshi tokens.
 */
export function extractInlineActionStates(
	specs: ReadonlyArray<DlActionSpec>,
	tokens: ReadonlyArray<DlActionToken>,
): Record<string, string> {
	const byName = new Map(specs.map((spec) => [spec.name, spec]))
	const resolved: Record<string, string> = {}

	for (const token of tokens) {
		if (token.kind !== "option") {
			continue
		}
		if (!token.inlineValue || !token.name) {
			continue
		}

		const spec = byName.get(token.name)
		if (!spec) {
			continue
		}

		const inlineState = validState(spec, token.value)
		if (!inlineState) {
			throw new Error(
				`invalid --${spec.name} state '${token.value}' (valid: ${spec.states.join("|")})`,
			)
		}

		resolved[spec.name] = inlineState
	}

	return resolved
}

/**
 * Resolves all action states under the policy:
 * - If no action flag is explicit: all actions use defaults
 * - If any action flag is explicit: only explicit actions run, others become `off`
 */
export function resolveActionStates(
	specs: ReadonlyArray<DlActionSpec>,
	values: Record<string, unknown>,
	explicit: Record<string, boolean | undefined>,
	tokens: ReadonlyArray<DlActionToken> = [],
): Record<string, string> {
	const resolved: Record<string, string> = {}
	const inlineStates = extractInlineActionStates(specs, tokens)
	const anyExplicit = specs.some((spec) => {
		return (
			explicit[spec.name] === true ||
			explicit[stateOptionName(spec)] === true ||
			inlineStates[spec.name] !== undefined
		)
	})

	for (const spec of specs) {
		const hasActionFlag = explicit[spec.name] === true
		const inlineState = inlineStates[spec.name]
		const hasStateFlag = explicit[stateOptionName(spec)] === true || inlineState !== undefined

		if (hasStateFlag) {
			resolved[spec.name] = inlineState ?? resolveActionState(spec, values[stateOptionName(spec)])
			continue
		}

		if (hasActionFlag) {
			resolved[spec.name] = spec.defaultState
			continue
		}

		if (anyExplicit) {
			resolved[spec.name] = "off"
			continue
		}

		resolved[spec.name] = spec.defaultState
	}

	return resolved
}

/**
 * Maps resolved states to an options bag keyed by `spec.optionKey`.
 */
export function actionStatesToOptions(
	specs: ReadonlyArray<DlActionSpec>,
	states: Record<string, string>,
): Record<string, string> {
	const options: Record<string, string> = {}

	for (const spec of specs) {
		if (!spec.optionKey) {
			continue
		}
		options[spec.optionKey] = states[spec.name] ?? spec.defaultState
	}

	return options
}

/**
 * Convenience wrapper that resolves states and maps them into option keys.
 */
export function resolveActionOptions(
	specs: ReadonlyArray<DlActionSpec>,
	values: Record<string, unknown>,
	explicit: Record<string, boolean | undefined>,
	tokens: ReadonlyArray<DlActionToken> = [],
): Record<string, string> {
	return actionStatesToOptions(
		specs,
		resolveActionStates(specs, values, explicit, tokens),
	)
}
