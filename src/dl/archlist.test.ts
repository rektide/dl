import { describe, expect, test } from "vitest"
import { decideArchlist } from "./archlist.ts"
import { state } from "./actions.ts"

const OFF = state("off")
const FORCE = state("force")
const ENSURE = state("ensure")

describe("decideArchlist", () => {
	test("off skips regardless of content", () => {
		const result = decideArchlist(OFF, "https://github.com/org/repo", "anything")
		expect(result).toEqual({ action: "skip" })
	})

	test("off skips even with null content", () => {
		const result = decideArchlist(OFF, "https://github.com/org/repo", null)
		expect(result).toEqual({ action: "skip" })
	})

	test("force appends even if url already present", () => {
		const content = "https://github.com/org/repo\n"
		const result = decideArchlist(FORCE, "https://github.com/org/repo", content)
		expect(result).toEqual({ action: "append" })
	})

	test("force appends with null content", () => {
		const result = decideArchlist(FORCE, "https://github.com/org/repo", null)
		expect(result).toEqual({ action: "append" })
	})

	test("ensure returns already_present when url exists", () => {
		const content = "https://github.com/other/thing\nhttps://github.com/org/repo\n"
		const result = decideArchlist(ENSURE, "https://github.com/org/repo", content)
		expect(result).toEqual({ action: "already_present" })
	})

	test("ensure appends when url not in content", () => {
		const content = "https://github.com/other/thing\n"
		const result = decideArchlist(ENSURE, "https://github.com/org/repo", content)
		expect(result).toEqual({ action: "append" })
	})

	test("ensure appends when file content is null", () => {
		const result = decideArchlist(ENSURE, "https://github.com/org/repo", null)
		expect(result).toEqual({ action: "append" })
	})

	test("ensure appends when file content is empty", () => {
		const result = decideArchlist(ENSURE, "https://github.com/org/repo", "")
		expect(result).toEqual({ action: "append" })
	})
})
