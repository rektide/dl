import { describe, expect, test } from "vitest"
import {
	stripGitPrefixes,
	stripGitSuffix,
	stripRepoPathExtras,
	stripQueryAndHash,
	cleanRepoUrl,
	ALL_CLEAN,
} from "./clean-url.ts"
import type { CleanUrlOptions } from "./clean-url.ts"

describe("stripGitPrefixes", () => {
	test("strips git+ prefix", () => {
		expect(stripGitPrefixes("git+https://github.com/org/repo")).toBe("https://github.com/org/repo")
	})

	test("converts git:// to https://", () => {
		expect(stripGitPrefixes("git://github.com/org/repo")).toBe("https://github.com/org/repo")
	})

	test("converts ssh://git@ to https://", () => {
		expect(stripGitPrefixes("ssh://git@github.com/org/repo")).toBe("https://github.com/org/repo")
	})

	test("strips git+ssh://git@ and converts to https://", () => {
		expect(stripGitPrefixes("git+ssh://git@github.com/org/repo")).toBe("https://github.com/org/repo")
	})

	test("leaves plain https untouched", () => {
		expect(stripGitPrefixes("https://github.com/org/repo")).toBe("https://github.com/org/repo")
	})

	test("leaves scp-style ssh syntax untouched", () => {
		expect(stripGitPrefixes("git@github.com:org/repo")).toBe("git@github.com:org/repo")
	})
})

describe("stripGitSuffix", () => {
	test("removes .git from pathname", () => {
		const url = new URL("https://github.com/org/repo.git")
		const result = stripGitSuffix(url)
		expect(result.pathname).toBe("/org/repo")
	})

	test("leaves URLs without .git untouched", () => {
		const url = new URL("https://github.com/org/repo")
		const result = stripGitSuffix(url)
		expect(result.pathname).toBe("/org/repo")
	})

	test("does not remove .git from middle of path", () => {
		const url = new URL("https://github.com/org/git-tools")
		const result = stripGitSuffix(url)
		expect(result.pathname).toBe("/org/git-tools")
	})
})

describe("stripRepoPathExtras", () => {
	test("strips /tree/master/... from github URL", () => {
		const url = new URL("https://github.com/kubernetes-sigs/external-dns/tree/master/config/crd/standard")
		const result = stripRepoPathExtras(url)
		expect(result.pathname).toBe("/kubernetes-sigs/external-dns")
	})

	test("strips /blob/master/... from github URL", () => {
		const url = new URL("https://github.com/org/repo/blob/main/src/index.ts")
		const result = stripRepoPathExtras(url)
		expect(result.pathname).toBe("/org/repo")
	})

	test("strips /-/blob/master/... from gitlab URL", () => {
		const url = new URL("https://gitlab.com/interception/linux/tools/-/blob/master/udevmon.cpp")
		const result = stripRepoPathExtras(url)
		expect(result.pathname).toBe("/interception/linux/tools")
	})

	test("strips /-/tree/... from gitlab URL", () => {
		const url = new URL("https://gitlab.com/org/repo/-/tree/develop/src")
		const result = stripRepoPathExtras(url)
		expect(result.pathname).toBe("/org/repo")
	})

	test("strips /issues/... from github URL", () => {
		const url = new URL("https://github.com/org/repo/issues/42")
		const result = stripRepoPathExtras(url)
		expect(result.pathname).toBe("/org/repo")
	})

	test("strips /pull/... from github URL", () => {
		const url = new URL("https://github.com/org/repo/pull/123")
		const result = stripRepoPathExtras(url)
		expect(result.pathname).toBe("/org/repo")
	})

	test("strips /releases/... from github URL", () => {
		const url = new URL("https://github.com/org/repo/releases/tag/v1.0")
		const result = stripRepoPathExtras(url)
		expect(result.pathname).toBe("/org/repo")
	})

	test("strips /-/merge_requests/... from gitlab URL", () => {
		const url = new URL("https://gitlab.com/org/repo/-/merge_requests/5")
		const result = stripRepoPathExtras(url)
		expect(result.pathname).toBe("/org/repo")
	})

	test("does not strip when extras segment is at position 0 or 1", () => {
		const url = new URL("https://github.com/org/repo")
		const result = stripRepoPathExtras(url)
		expect(result.pathname).toBe("/org/repo")
	})

	test("handles short path with no extras", () => {
		const url = new URL("https://github.com/org/repo")
		const result = stripRepoPathExtras(url)
		expect(result.pathname).toBe("/org/repo")
	})

	test("preserves path with fewer than 2 segments", () => {
		const url = new URL("https://github.com/org")
		const result = stripRepoPathExtras(url)
		expect(result.pathname).toBe("/org")
	})
})

describe("stripQueryAndHash", () => {
	test("removes query params", () => {
		const url = new URL("https://github.com/org/repo?tab=readme-ov-file")
		const result = stripQueryAndHash(url)
		expect(result.search).toBe("")
		expect(result.pathname).toBe("/org/repo")
	})

	test("removes hash fragment", () => {
		const url = new URL("https://github.com/org/repo#documentation")
		const result = stripQueryAndHash(url)
		expect(result.hash).toBe("")
	})

	test("removes both query and hash", () => {
		const url = new URL("https://github.com/org/repo?tab=readme-ov-file#documentation")
		const result = stripQueryAndHash(url)
		expect(result.search).toBe("")
		expect(result.hash).toBe("")
	})

	test("preserves URL with no query or hash", () => {
		const url = new URL("https://github.com/org/repo")
		const result = stripQueryAndHash(url)
		expect(result.toString()).toBe("https://github.com/org/repo")
	})
})

describe("cleanRepoUrl", () => {
	test("cleans a github URL with tree path, query, and hash", () => {
		const result = cleanRepoUrl(
			"https://github.com/kubernetes-sigs/external-dns/tree/master/config/crd/standard?tab=readme-ov-file#documentation",
		)
		expect(result).not.toBeNull()
		expect(result!.toString()).toBe("https://github.com/kubernetes-sigs/external-dns")
	})

	test("cleans a gitlab URL with -/blob path and query", () => {
		const result = cleanRepoUrl(
			"https://gitlab.com/interception/linux/tools/-/blob/master/udevmon.cpp?ref_type=heads",
		)
		expect(result).not.toBeNull()
		expect(result!.toString()).toBe("https://gitlab.com/interception/linux/tools")
	})

	test("cleans git+https prefix", () => {
		const result = cleanRepoUrl("git+https://github.com/org/repo.git")
		expect(result).not.toBeNull()
		expect(result!.toString()).toBe("https://github.com/org/repo")
	})

	test("cleans ssh://git@ prefix", () => {
		const result = cleanRepoUrl("ssh://git@github.com/org/repo.git")
		expect(result).not.toBeNull()
		expect(result!.toString()).toBe("https://github.com/org/repo")
	})

	test("returns null for non-http protocols", () => {
		expect(cleanRepoUrl("ftp://example.com/org/repo")).toBeNull()
	})

	test("returns null for unparseable input", () => {
		expect(cleanRepoUrl("not a url at all")).toBeNull()
	})

	test("ALL_CLEAN has all flags set to true", () => {
		expect(ALL_CLEAN.gitPrefixes).toBe(true)
		expect(ALL_CLEAN.gitSuffix).toBe(true)
		expect(ALL_CLEAN.repoPathExtras).toBe(true)
		expect(ALL_CLEAN.queryAndHash).toBe(true)
	})

	test("respects individual flag disable", () => {
		const noExtras: CleanUrlOptions = { ...ALL_CLEAN, repoPathExtras: false }
		const result = cleanRepoUrl(
			"https://github.com/org/repo/tree/main/src",
			noExtras,
		)
		expect(result).not.toBeNull()
		expect(result!.pathname).toBe("/org/repo/tree/main/src")
	})

	test("respects gitSuffix flag disable", () => {
		const noGitSuffix: CleanUrlOptions = { ...ALL_CLEAN, gitSuffix: false }
		const result = cleanRepoUrl(
			"https://github.com/org/repo.git",
			noGitSuffix,
		)
		expect(result).not.toBeNull()
		expect(result!.pathname).toBe("/org/repo.git")
	})

	test("normalizes github pages URL with query and hash", () => {
		const result = cleanRepoUrl("https://foo.github.io/bar/?a=1#readme")
		expect(result).not.toBeNull()
		expect(result!.toString()).toBe("https://foo.github.io/bar/")
	})
})
