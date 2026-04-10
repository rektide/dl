import { describe, expect, test } from "vitest"
import { expand, sshExpander, urlExpander, hostPathExpander, createShorthandExpander } from "../url/index.ts"

const allExpanders = [
	sshExpander,
	urlExpander,
	hostPathExpander,
	createShorthandExpander({ defaultHosts: ["github.com"] }),
]

function prependOrg(org: string | undefined, positionals: string[]): string[] {
	return org
		? positionals.map((input) => `${org}/${input}`)
		: positionals
}

function resolveDlFlags(
	values: { archive: boolean; wiki: boolean; archlist: boolean; simplify: boolean },
	explicit: { archive: boolean; wiki: boolean; archlist: boolean; simplify: boolean },
) {
	const anyExplicit = explicit.archive || explicit.wiki || explicit.archlist || explicit.simplify
	return {
		doArchive: anyExplicit ? values.archive : true,
		doWiki: anyExplicit ? values.wiki : true,
		doArchlist: anyExplicit ? values.archlist : true,
		doSimplify: anyExplicit ? values.simplify : true,
	}
}

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
		const results = expand(inputs[0], allExpanders)
		expect(results).toHaveLength(1)
		expect(results[0].url.host).toBe("github.com")
		expect(results[0].url.pathname).toBe("/huggingface/transformers")
	})
})

describe("resolveDlFlags", () => {
	test("defaults: all enabled when no explicit flags", () => {
		const result = resolveDlFlags(
			{ archive: false, wiki: false, archlist: false, simplify: true },
			{ archive: false, wiki: false, archlist: false, simplify: false },
		)
		expect(result).toEqual({ doArchive: true, doWiki: true, doArchlist: true, doSimplify: true })
	})

	test("--archive explicitly set: only archive enabled", () => {
		const result = resolveDlFlags(
			{ archive: true, wiki: false, archlist: false, simplify: true },
			{ archive: true, wiki: false, archlist: false, simplify: false },
		)
		expect(result).toEqual({ doArchive: true, doWiki: false, doArchlist: false, doSimplify: true })
	})

	test("--wiki explicitly set: only wiki enabled", () => {
		const result = resolveDlFlags(
			{ archive: false, wiki: true, archlist: false, simplify: true },
			{ archive: false, wiki: true, archlist: false, simplify: false },
		)
		expect(result).toEqual({ doArchive: false, doWiki: true, doArchlist: false, doSimplify: true })
	})

	test("--archive and --wiki both set: both enabled", () => {
		const result = resolveDlFlags(
			{ archive: true, wiki: true, archlist: false, simplify: true },
			{ archive: true, wiki: true, archlist: false, simplify: false },
		)
		expect(result).toEqual({ doArchive: true, doWiki: true, doArchlist: false, doSimplify: true })
	})

	test("--no-simplify explicitly set: simplify off", () => {
		const result = resolveDlFlags(
			{ archive: false, wiki: false, archlist: false, simplify: false },
			{ archive: false, wiki: false, archlist: false, simplify: true },
		)
		expect(result).toEqual({ doArchive: false, doWiki: false, doArchlist: false, doSimplify: false })
	})
})
