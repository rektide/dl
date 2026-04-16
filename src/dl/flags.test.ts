import { describe, expect, test } from "vitest"
import { resolveDlFlags } from "./flags.ts"

describe("resolveDlFlags", () => {
	test("defaults: all enabled when no explicit flags", () => {
		const result = resolveDlFlags(
			{ archive: false, wiki: false, archlist: false, symlink: true },
			{ archive: false, wiki: false, archlist: false, symlink: false },
		)
		expect(result).toEqual({ doArchive: true, doWiki: true, doArchlist: true, doSymlink: true })
	})

	test("--archive explicitly set: only archive enabled", () => {
		const result = resolveDlFlags(
			{ archive: true, wiki: false, archlist: false, symlink: true },
			{ archive: true, wiki: false, archlist: false, symlink: false },
		)
		expect(result).toEqual({ doArchive: true, doWiki: false, doArchlist: false, doSymlink: true })
	})

	test("--wiki explicitly set: only wiki enabled", () => {
		const result = resolveDlFlags(
			{ archive: false, wiki: true, archlist: false, symlink: true },
			{ archive: false, wiki: true, archlist: false, symlink: false },
		)
		expect(result).toEqual({ doArchive: false, doWiki: true, doArchlist: false, doSymlink: true })
	})

	test("--archive and --wiki both set: both enabled", () => {
		const result = resolveDlFlags(
			{ archive: true, wiki: true, archlist: false, symlink: true },
			{ archive: true, wiki: true, archlist: false, symlink: false },
		)
		expect(result).toEqual({ doArchive: true, doWiki: true, doArchlist: false, doSymlink: true })
	})

	test("--no-symlink explicitly set: symlink off", () => {
		const result = resolveDlFlags(
			{ archive: false, wiki: false, archlist: false, symlink: false },
			{ archive: false, wiki: false, archlist: false, symlink: true },
		)
		expect(result).toEqual({ doArchive: false, doWiki: false, doArchlist: false, doSymlink: false })
	})
})
