import { describe, expect, test } from "vitest"
import { resolveDlFlags } from "./flags.ts"

describe("resolveDlFlags", () => {
	test("defaults: all enabled when no explicit flags", () => {
		const result = resolveDlFlags(
			{ archive: false, wiki: false, symlink: true },
			{ archive: false, wiki: false, symlink: false },
		)
		expect(result).toEqual({ anyExplicit: false, doArchive: true, doWiki: true, doSymlink: true })
	})

	test("--archive explicitly set: only archive enabled", () => {
		const result = resolveDlFlags(
			{ archive: true, wiki: false, symlink: true },
			{ archive: true, wiki: false, symlink: false },
		)
		expect(result).toEqual({ anyExplicit: true, doArchive: true, doWiki: false, doSymlink: true })
	})

	test("--wiki explicitly set: only wiki enabled", () => {
		const result = resolveDlFlags(
			{ archive: false, wiki: true, symlink: true },
			{ archive: false, wiki: true, symlink: false },
		)
		expect(result).toEqual({ anyExplicit: true, doArchive: false, doWiki: true, doSymlink: true })
	})

	test("--archive and --wiki both set: both enabled", () => {
		const result = resolveDlFlags(
			{ archive: true, wiki: true, symlink: true },
			{ archive: true, wiki: true, symlink: false },
		)
		expect(result).toEqual({ anyExplicit: true, doArchive: true, doWiki: true, doSymlink: true })
	})

	test("--no-symlink explicitly set: symlink off", () => {
		const result = resolveDlFlags(
			{ archive: false, wiki: false, symlink: false },
			{ archive: false, wiki: false, symlink: true },
		)
		expect(result).toEqual({ anyExplicit: true, doArchive: false, doWiki: false, doSymlink: false })
	})
})
