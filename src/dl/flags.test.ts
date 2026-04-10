import { describe, expect, test } from "vitest"
import { resolveDlFlags } from "./flags.ts"

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
