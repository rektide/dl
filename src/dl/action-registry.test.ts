import { describe, expect, test } from "vitest"
import { ENSURE, FORCE, OFF } from "./actions.ts"
import type { DlActionSpec } from "./action-registry.ts"
import {
	actionStatesToOptions,
	buildActionArgs,
	collectActionSpecsFromExtensions,
	resolveActionOptions,
	resolveActionState,
	resolveActionStates,
	stateOptionName,
} from "./action-registry.ts"

const ARCHIVE_SPEC: DlActionSpec = {
	name: "archive",
	description: "Archive",
	defaultState: ENSURE,
	states: [ENSURE, OFF],
	optionKey: "archiveState",
}

const ARCHLIST_SPEC: DlActionSpec = {
	name: "archlist",
	description: "Archlist",
	defaultState: FORCE,
	states: [FORCE, ENSURE, OFF],
	optionKey: "archlistState",
}

const CUSTOM_SPEC: DlActionSpec = {
	name: "mirror",
	description: "Mirror",
	defaultState: "sync",
	states: ["sync", "audit", "off"],
	optionKey: "mirrorState",
}

const SPECS: ReadonlyArray<DlActionSpec> = [ARCHIVE_SPEC, ARCHLIST_SPEC, CUSTOM_SPEC]

describe("resolveActionStates", () => {
	test("uses defaults when no action is explicit", () => {
		const states = resolveActionStates(SPECS, {}, {})
		expect(states).toEqual({
			archive: ENSURE,
			archlist: FORCE,
			mirror: "sync",
		})
	})

	test("runs only explicit actions when any action is provided", () => {
		const states = resolveActionStates(
			SPECS,
			{ "archlist-state": ENSURE },
			{ "archlist-state": true },
		)
		expect(states).toEqual({
			archive: OFF,
			archlist: ENSURE,
			mirror: OFF,
		})
	})

	test("supports inline state style from gunshi tokens", () => {
		const states = resolveActionStates(
			SPECS,
			{},
			{ mirror: true },
			[
				{
					kind: "option",
					name: "mirror",
					value: "audit",
					inlineValue: true,
				},
			],
		)

		expect(states).toEqual({
			archive: OFF,
			archlist: OFF,
			mirror: "audit",
		})
	})
})

describe("resolveActionOptions", () => {
	test("maps states to optionKey values", () => {
		const options = resolveActionOptions(
			SPECS,
			{ "mirror-state": "audit" },
			{ "mirror-state": true },
		)
		expect(options).toEqual({
			archiveState: OFF,
			archlistState: OFF,
			mirrorState: "audit",
		})
	})

	test("supports direct state-to-options mapping", () => {
		const mapped = actionStatesToOptions(SPECS, {
			archive: ENSURE,
			archlist: FORCE,
			mirror: "audit",
		})
		expect(mapped).toEqual({
			archiveState: ENSURE,
			archlistState: FORCE,
			mirrorState: "audit",
		})
	})
})

describe("collectActionSpecsFromExtensions", () => {
	test("collects plugin-contributed action specs from dl:actions fields", () => {
		const collected = collectActionSpecsFromExtensions({
			"plugin:a": { "dl:actions": [ARCHIVE_SPEC] },
			"plugin:b": { "dl:actions": [CUSTOM_SPEC] },
			other: { foo: "bar" },
		})

		expect(collected.map((spec) => spec.name)).toEqual(["archive", "mirror"])
	})
})

describe("buildActionArgs", () => {
	test("builds boolean action flag and enum state flag", () => {
		const args = buildActionArgs([CUSTOM_SPEC])
		expect(args["mirror"]).toBeDefined()
		expect(args[stateOptionName(CUSTOM_SPEC)]).toBeDefined()
		expect(args[stateOptionName(CUSTOM_SPEC)]?.type).toBe("enum")
		expect(args[stateOptionName(CUSTOM_SPEC)]?.choices).toEqual(["sync", "audit", "off"])
	})
})

describe("resolveActionState", () => {
	test("falls back to default for unknown values", () => {
		expect(resolveActionState(ARCHLIST_SPEC, "not-a-state")).toBe(FORCE)
		expect(resolveActionState(CUSTOM_SPEC, "not-a-state")).toBe("sync")
	})
})
