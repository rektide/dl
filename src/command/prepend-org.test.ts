import { describe, expect, test } from "vitest"
import { expand, createShorthandExpander } from "../url/index.ts"
import { prependOrg } from "./prepend-org.ts"

const expanders = [
	createShorthandExpander({ defaultHosts: ["github.com"] }),
]

describe("prependOrg", () => {
	test("prepends org to bare repo names", () => {
		expect(prependOrg("huggingface", ["transformers", "diffusers"]))
			.toEqual(["huggingface/transformers", "huggingface/diffusers"])
	})

	test("always prepends, even to slash-containing inputs", () => {
		expect(prependOrg("huggingface", ["other-org/repo"]))
			.toEqual(["huggingface/other-org/repo"])
	})

	test("returns positionals unchanged when no org", () => {
		expect(prependOrg(undefined, ["huggingface/transformers"]))
			.toEqual(["huggingface/transformers"])
	})

	test("prepended bare name expands through shorthand", () => {
		const inputs = prependOrg("huggingface", ["transformers"])
		expect(inputs).toEqual(["huggingface/transformers"])
		const results = expand(inputs[0], expanders)
		expect(results).toHaveLength(1)
		expect(results[0].url.host).toBe("github.com")
		expect(results[0].url.pathname).toBe("/huggingface/transformers")
	})
})
