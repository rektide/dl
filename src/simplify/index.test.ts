import { mkdir, rm, lstat, readlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, test, beforeEach, afterEach } from "vitest"
import { simplify, ensureSymlink } from "./index.ts"

describe("simplify", () => {
	test("lowercases", () => {
		expect(simplify("Effect-TS")).toBe("effectts")
	})

	test("strips hyphens", () => {
		expect(simplify("Mooncake-Labs")).toBe("mooncakelabs")
	})

	test("strips underscores", () => {
		expect(simplify("duckdb_mooncake")).toBe("duckdbmooncake")
	})

	test("strips dots", () => {
		expect(simplify("v2.0.0")).toBe("v200")
	})

	test("idempotent on already simple name", () => {
		expect(simplify("effect")).toBe("effect")
	})

	test("strips all non-alphanumeric", () => {
		expect(simplify("0xNaN")).toBe("0xnan")
	})

	test("empty string stays empty", () => {
		expect(simplify("")).toBe("")
	})
})

describe("ensureSymlink", () => {
	let testDir: string

	beforeEach(async () => {
		testDir = join(tmpdir(), `rekon-test-${Date.now()}`)
		await mkdir(testDir, { recursive: true })
	})

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true })
	})

	const noopLog = {
		info: () => {},
		warn: () => {},
	}

	test("creates symlink when simplified differs and nothing exists", async () => {
		const result = await ensureSymlink(testDir, "Effect-TS", "effectts", false, noopLog)
		expect(result).toBe("created")

		const st = await lstat(join(testDir, "effectts"))
		expect(st.isSymbolicLink()).toBe(true)
		const target = await readlink(join(testDir, "effectts"))
		expect(target).toBe("Effect-TS")
	})

	test("returns skip_same when simplified equals original", async () => {
		const result = await ensureSymlink(testDir, "effect", "effect", false, noopLog)
		expect(result).toBe("skip_same")
	})

	test("returns already_linked when symlink already points to target", async () => {
		await ensureSymlink(testDir, "Effect-TS", "effectts", false, noopLog)
		const result = await ensureSymlink(testDir, "Effect-TS", "effectts", false, noopLog)
		expect(result).toBe("already_linked")
	})

	test("returns conflict_symlink when symlink points elsewhere", async () => {
		await ensureSymlink(testDir, "Other-Org", "effectts", false, noopLog)
		const result = await ensureSymlink(testDir, "Effect-TS", "effectts", false, noopLog)
		expect(result).toBe("conflict_symlink")
	})

	test("returns conflict_exists when a directory exists", async () => {
		await mkdir(join(testDir, "effectts"))
		const result = await ensureSymlink(testDir, "Effect-TS", "effectts", false, noopLog)
		expect(result).toBe("conflict_exists")
	})
})
