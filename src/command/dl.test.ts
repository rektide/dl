import { describe, expect, test } from "vitest"
import { expand, sshExpander, urlExpander, hostPathExpander, createShorthandExpander } from "../url/index.ts"
import { parseArgs } from "../dl/args.ts"

const allExpanders = [
	sshExpander,
	urlExpander,
	hostPathExpander,
	createShorthandExpander({ defaultHosts: ["github.com"] }),
]

describe("expanders", () => {
	describe("sshExpander", () => {
		test("parses git@host:path", () => {
			const results = sshExpander.expand("git@github.com:huggingface/transformers.git")
			expect(results).toHaveLength(1)
			expect(results[0].toString()).toBe("https://github.com/huggingface/transformers")
		})

		test("ignores non-ssh input", () => {
			expect(sshExpander.expand("huggingface/transformers")).toHaveLength(0)
		})
	})

	describe("urlExpander", () => {
		test("parses https URL", () => {
			const results = urlExpander.expand("https://github.com/huggingface/transformers.git")
			expect(results).toHaveLength(1)
			expect(results[0].toString()).toBe("https://github.com/huggingface/transformers")
		})

		test("parses ssh:// URL", () => {
			const results = urlExpander.expand("ssh://github.com/huggingface/transformers")
			expect(results).toHaveLength(1)
			expect(results[0].host).toBe("github.com")
			expect(results[0].protocol).toBe("https:")
		})

		test("ignores non-URL input", () => {
			expect(urlExpander.expand("github.com/org/repo")).toHaveLength(0)
		})
	})

	describe("hostPathExpander", () => {
		test("parses host/path", () => {
			const results = hostPathExpander.expand("github.com/huggingface/transformers")
			expect(results).toHaveLength(1)
			expect(results[0].toString()).toBe("https://github.com/huggingface/transformers")
		})

		test("parses localhost/path", () => {
			const results = hostPathExpander.expand("localhost/team/repo")
			expect(results).toHaveLength(1)
			expect(results[0].host).toBe("localhost")
		})

		test("strips .git suffix", () => {
			const results = hostPathExpander.expand("github.com/org/repo.git")
			expect(results).toHaveLength(1)
			expect(results[0].pathname).toBe("/org/repo")
		})

		test("ignores shorthand input", () => {
			expect(hostPathExpander.expand("huggingface/transformers")).toHaveLength(0)
		})
	})

	describe("shorthandExpander", () => {
		test("fans out to default hosts", () => {
			const expander = createShorthandExpander({
				defaultHosts: ["github.com", "gitlab.com"],
			})
			const results = expander.expand("org/repo")
			expect(results).toHaveLength(2)
			expect(results[0].host).toBe("github.com")
			expect(results[1].host).toBe("gitlab.com")
		})

		test("ignores host-path input", () => {
			const expander = createShorthandExpander({ defaultHosts: ["github.com"] })
			expect(expander.expand("github.com/org/repo")).toHaveLength(0)
		})

		test("strips leading slashes", () => {
			const expander = createShorthandExpander({ defaultHosts: ["github.com"] })
			const results = expander.expand("/org/repo")
			expect(results).toHaveLength(1)
			expect(results[0].pathname).toBe("/org/repo")
		})
	})
})

describe("expand", () => {
	test("deduplicates by URL.toString()", () => {
		const results = expand("https://github.com/org/repo", allExpanders)
		expect(results).toHaveLength(1)
		expect(results[0].expander).toBe("url")
	})

	test("shorthand produces github candidate", () => {
		const results = expand("huggingface/transformers", allExpanders)
		expect(results).toHaveLength(1)
		expect(results[0].url.host).toBe("github.com")
		expect(results[0].url.pathname).toBe("/huggingface/transformers")
		expect(results[0].expander).toBe("shorthand")
	})

	test("host-path and shorthand deduplicate for github.com", () => {
		const results = expand("github.com/org/repo", allExpanders)
		const hosts = results.map((r) => r.url.host)
		expect(hosts).toContain("github.com")
		expect(new Set(results.map((r) => r.url.toString())).size).toBe(results.length)
	})

	test("ssh input produces URL", () => {
		const results = expand("git@github.com:org/repo.git", allExpanders)
		expect(results).toHaveLength(1)
		expect(results[0].url.host).toBe("github.com")
		expect(results[0].url.pathname).toBe("/org/repo")
	})

	test("gitlab host-path", () => {
		const results = expand("gitlab.com/group/subgroup/project", allExpanders)
		expect(results.length).toBeGreaterThanOrEqual(1)
		expect(results[0].url.host).toBe("gitlab.com")
		expect(results[0].url.pathname).toBe("/group/subgroup/project")
	})
})

describe("parseArgs --org", () => {
	test("parses --org with bare repo names", () => {
		const result = parseArgs(["--org", "huggingface", "transformers", "diffusers"])
		expect(result.org).toBe("huggingface")
		expect(result.inputs).toEqual(["transformers", "diffusers"])
	})

	test("no --org preserves inputs as-is", () => {
		const result = parseArgs(["huggingface/transformers"])
		expect(result.org).toBeUndefined()
		expect(result.inputs).toEqual(["huggingface/transformers"])
	})

	test("--org with single repo", () => {
		const result = parseArgs(["--org", "huggingface", "transformers"])
		expect(result.org).toBe("huggingface")
		expect(result.inputs).toEqual(["transformers"])
	})

	test("--org always prepends even to slash-containing inputs", () => {
		const result = parseArgs(["--org", "huggingface", "other-org/repo"])
		expect(result.org).toBe("huggingface")
		expect(result.inputs).toEqual(["other-org/repo"])
	})

	test("--org with other flags", () => {
		const result = parseArgs(["--org", "huggingface", "--dry-run", "transformers"])
		expect(result.org).toBe("huggingface")
		expect(result.inputs).toEqual(["transformers"])
		expect(result.dryRun).toBe(true)
	})
})

describe("parseArgs --org prepending", () => {
	test("prepending bare repo name produces org/repo shorthand", () => {
		const result = parseArgs(["--org", "huggingface", "transformers"])
		const inputs = result.org
			? result.inputs.map((input) => `${result.org}/${input}`)
			: result.inputs
		expect(inputs).toEqual(["huggingface/transformers"])
		const results = expand(inputs[0], allExpanders)
		expect(results).toHaveLength(1)
		expect(results[0].url.host).toBe("github.com")
		expect(results[0].url.pathname).toBe("/huggingface/transformers")
	})

	test("prepending to slash-containing input produces nested path", () => {
		const result = parseArgs(["--org", "huggingface", "other-org/repo"])
		const inputs = result.org
			? result.inputs.map((input) => `${result.org}/${input}`)
			: result.inputs
		expect(inputs).toEqual(["huggingface/other-org/repo"])
	})

	test("multiple repos with --org all get prepended", () => {
		const result = parseArgs(["--org", "huggingface", "transformers", "diffusers", "tokenizers"])
		const inputs = result.org
			? result.inputs.map((input) => `${result.org}/${input}`)
			: result.inputs
		expect(inputs).toEqual([
			"huggingface/transformers",
			"huggingface/diffusers",
			"huggingface/tokenizers",
		])
	})
})
