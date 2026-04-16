export type StepState = "force" | "ensure" | "skip" | "off"

export interface ActionDef {
	name: string
	short?: string
	states: readonly StepState[]
	defaultState: StepState
}

export interface ResolvedActions {
	anyExplicit: boolean
	states: Record<string, StepState>
	explicit: Record<string, boolean>
}

export function buildGunshiArgs(actions: readonly ActionDef[]): Record<string, {
	type: string
	description: string
	default?: boolean
	short?: string
}> {
	const args: Record<string, any> = {}

	for (const action of actions) {
		const mainArg: Record<string, any> = {
			type: "string",
			description: `${action.name} action (${[...action.states].join("|")}; default: ${action.defaultState})`,
		}
		if (action.short) {
			mainArg.short = action.short
		}
		args[action.name] = mainArg

		args[`no-${action.name}`] = {
			type: "boolean",
			default: false,
			description: `Disable ${action.name}`,
		}

		for (const state of action.states) {
			if (state === "off") continue
			args[`${action.name}-${state}`] = {
				type: "boolean",
				default: false,
				description: `${action.name}: ${state}`,
			}
		}
	}

	return args
}

export function preprocessArgv(argv: string[], actions: readonly ActionDef[]): string[] {
	const defaults = new Map<string, string>()
	for (const action of actions) {
		defaults.set(`--${action.name}`, `--${action.name}=${action.defaultState}`)
	}
	return argv.map(token => defaults.get(token) ?? token)
}

export function resolveActions(
	actions: readonly ActionDef[],
	values: Record<string, unknown>,
	explicitFlags: Record<string, boolean>,
): ResolvedActions {
	const states: Record<string, StepState> = {}
	const wasExplicit: Record<string, boolean> = {}

	for (const action of actions) {
		let state: StepState | undefined
		let isExplicit = false

		const strVal = values[action.name]
		if (typeof strVal === "string" && strVal !== "") {
			if ((action.states as readonly string[]).includes(strVal)) {
				state = strVal as StepState
				isExplicit = true
			}
		}

		for (const s of action.states) {
			if (s === "off") continue
			if (values[`${action.name}-${s}`] === true) {
				state = s
				isExplicit = true
			}
		}

		if (values[`no-${action.name}`] === true) {
			state = "off"
			isExplicit = true
		}

		if (explicitFlags[action.name] || explicitFlags[`no-${action.name}`]) {
			isExplicit = true
			if (state === undefined) {
				state = action.defaultState
			}
		}

		for (const s of action.states) {
			if (explicitFlags[`${action.name}-${s}`]) {
				isExplicit = true
			}
		}

		states[action.name] = state ?? action.defaultState
		wasExplicit[action.name] = isExplicit
	}

	const anyExplicit = Object.values(wasExplicit).some(Boolean)

	if (anyExplicit) {
		for (const action of actions) {
			if (!wasExplicit[action.name]) {
				states[action.name] = "off"
			}
		}
	}

	return { anyExplicit, states, explicit: wasExplicit }
}
