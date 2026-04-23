import { describe, expect, test } from "vitest"
import {
	normalizeInput,
	isUrl,
	isSsh,
	looksLikeHost,
	parseSsh,
	parseUrl,
} from "./parse.ts"

describe("normalizeInput", () => {
	test("trims whitespace", () => {
		const result = normalizeInput("  github.com/org/repo  ")
		expect(result.trimmed).toBe("github.com/org/repo")
	})

	test("strips query params for withoutQuery", () => {
		const result = normalizeInput("github.com/org/repo?tab=readme")
		expect(result.withoutQuery).toBe("github.com/org/repo")
	})

	test("strips hash for withoutQuery", () => {
		const result = normalizeInput("github.com/org/repo#section")
		expect(result.withoutQuery).toBe("github.com/org/repo")
	})

	test("strips query then hash", () => {
		const result = normalizeInput("github.com/org/repo?tab=readme#section")
		expect(result.withoutQuery).toBe("github.com/org/repo")
	})

	test("removes leading slashes from path", () => {
		const result = normalizeInput("/org/repo")
		expect(result.path).toBe("org/repo")
	})

	test("removes .git suffix from path", () => {
		const result = normalizeInput("github.com/org/repo.git")
		expect(result.path).toBe("github.com/org/repo")
	})

	test("splits path into segments", () => {
		const result = normalizeInput("github.com/org/repo")
		expect(result.segments).toEqual(["github.com", "org", "repo"])
	})

	test("filters empty segments", () => {
		const result = normalizeInput("github.com//org/repo")
		expect(result.segments).toEqual(["github.com", "org", "repo"])
	})

	test("splits URL input with scheme as first segment", () => {
		const result = normalizeInput("https://github.com/org/repo")
		expect(result.segments).toEqual(["https:", "github.com", "org", "repo"])
	})
})

describe("isUrl", () => {
	test("matches https://", () => {
		expect(isUrl("https://github.com/org/repo")).toBe(true)
	})

	test("matches http://", () => {
		expect(isUrl("http://example.com/repo")).toBe(true)
	})

	test("matches ssh://", () => {
		expect(isUrl("ssh://git@github.com/org/repo")).toBe(true)
	})

	test("matches git://", () => {
		expect(isUrl("git://github.com/org/repo")).toBe(true)
	})

	test("rejects git@ (SSH shorthand)", () => {
		expect(isUrl("git@github.com:org/repo")).toBe(false)
	})

	test("rejects bare host/path", () => {
		expect(isUrl("github.com/org/repo")).toBe(false)
	})

	test("rejects shorthand org/repo", () => {
		expect(isUrl("org/repo")).toBe(false)
	})
})

describe("isSsh", () => {
	test("matches git@host:path", () => {
		expect(isSsh("git@github.com:org/repo")).toBe(true)
	})

	test("rejects https://", () => {
		expect(isSsh("https://github.com/org/repo")).toBe(false)
	})

	test("rejects ssh:// URL", () => {
		expect(isSsh("ssh://git@github.com/org/repo")).toBe(false)
	})

	test("rejects bare host/path", () => {
		expect(isSsh("github.com/org/repo")).toBe(false)
	})
})

describe("looksLikeHost", () => {
	test("matches dotted host", () => {
		expect(looksLikeHost("github.com")).toBe(true)
	})

	test("matches localhost", () => {
		expect(looksLikeHost("localhost")).toBe(true)
	})

	test("rejects plain org name", () => {
		expect(looksLikeHost("huggingface")).toBe(false)
	})

	test("rejects empty string", () => {
		expect(looksLikeHost("")).toBe(false)
	})
})

describe("parseSsh", () => {
	test("parses git@host:path", () => {
		const result = parseSsh("git@github.com:huggingface/transformers")
		expect(result).toEqual({
			host: "github.com",
			path: "huggingface/transformers",
		})
	})

	test("strips .git suffix", () => {
		const result = parseSsh("git@github.com:org/repo.git")
		expect(result?.path).toBe("org/repo")
	})

	test("strips query params", () => {
		const result = parseSsh("git@github.com:org/repo?tab=1")
		expect(result?.path).toBe("org/repo")
	})

	test("handles nested org paths", () => {
		const result = parseSsh("git@gitlab.com:interception/linux/tools")
		expect(result).toEqual({
			host: "gitlab.com",
			path: "interception/linux/tools",
		})
	})

	test("returns undefined for non-ssh input", () => {
		expect(parseSsh("https://github.com/org/repo")).toBeUndefined()
	})
})

describe("parseUrl", () => {
	test("parses https URL", () => {
		const result = parseUrl("https://github.com/org/repo")
		expect(result).not.toBeUndefined()
		expect(result!.host).toBe("github.com")
		expect(result!.protocol).toBe("https:")
		expect(result!.pathname).toBe("/org/repo")
	})

	test("converts ssh:// to https://", () => {
		const result = parseUrl("ssh://github.com/org/repo")
		expect(result).not.toBeUndefined()
		expect(result!.host).toBe("github.com")
		expect(result!.protocol).toBe("https:")
	})

	test("converts git:// to https://", () => {
		const result = parseUrl("git://github.com/org/repo")
		expect(result).not.toBeUndefined()
		expect(result!.host).toBe("github.com")
		expect(result!.protocol).toBe("https:")
	})

	test("strips .git suffix from pathname", () => {
		const result = parseUrl("https://github.com/org/repo.git")
		expect(result!.pathname).toBe("/org/repo")
	})

	test("drops query and hash from canonical URL", () => {
		const result = parseUrl("https://github.com/org/repo.git?tab=readme#section")
		expect(result).not.toBeUndefined()
		expect(result!.toString()).toBe("https://github.com/org/repo")
	})

	test("preserves non-default port in host", () => {
		const result = parseUrl("https://example.com:8443/org/repo")
		expect(result).not.toBeUndefined()
		expect(result!.host).toBe("example.com:8443")
		expect(result!.toString()).toBe("https://example.com:8443/org/repo")
	})

	test("preserves host from ssh:// URL", () => {
		const result = parseUrl("ssh://git@github.com/org/repo")
		expect(result!.host).toBe("github.com")
	})

	test("returns undefined for non-URL input", () => {
		expect(parseUrl("github.com/org/repo")).toBeUndefined()
	})

	test("returns undefined for unparseable input", () => {
		expect(parseUrl("not a url")).toBeUndefined()
	})

	test("preserves nested gitlab paths", () => {
		const result = parseUrl("https://gitlab.com/interception/linux/tools")
		expect(result!.pathname).toBe("/interception/linux/tools")
	})
})
