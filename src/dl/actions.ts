declare const stepStateBrand: unique symbol

export type StepState = string & { readonly [stepStateBrand]: void }

export const FORCE = state("force")
export const ENSURE = state("ensure")
export const SKIP = state("skip")
export const CHECK = state("check")
export const FETCH = state("fetch")
export const OFF = state("off")

export function state(s: string): StepState {
	return s as StepState
}

export function isStepState(value: string, action: ActionDef): value is StepState {
	return action.states.includes(value as StepState)
}

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

		for (const s of action.states) {
			if (s === OFF) continue
			args[`${action.name}-${s}`] = {
				type: "boolean",
				default: false,
				description: `${action.name}: ${s}`,
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
	const resolved: Record<string, StepState> = {}
	const wasExplicit: Record<string, boolean> = {}

	for (const action of actions) {
		let found: StepState | undefined
		let isExplicit = false

		const strVal = values[action.name]
		if (typeof strVal === "string" && strVal !== "") {
			if (isStepState(strVal, action)) {
				found = strVal
				isExplicit = true
			}
		}

		for (const s of action.states) {
			if (s === OFF) continue
			if (values[`${action.name}-${s}`] === true) {
				found = s
				isExplicit = true
			}
		}

		if (values[`no-${action.name}`] === true) {
			found = OFF
			isExplicit = true
		}

		if (explicitFlags[action.name] || explicitFlags[`no-${action.name}`]) {
			isExplicit = true
			if (found === undefined) {
				found = action.defaultState
			}
		}

		for (const s of action.states) {
			if (explicitFlags[`${action.name}-${s}`]) {
				isExplicit = true
			}
		}

		resolved[action.name] = found ?? action.defaultState
		wasExplicit[action.name] = isExplicit
	}

	const anyExplicit = Object.values(wasExplicit).some(Boolean)

	if (anyExplicit) {
		for (const action of actions) {
			if (!wasExplicit[action.name]) {
				resolved[action.name] = OFF
			}
		}
	}

	return { anyExplicit, states: resolved, explicit: wasExplicit }
}
