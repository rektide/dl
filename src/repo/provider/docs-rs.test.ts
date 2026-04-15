import { describe, expect, test } from "vitest"
import { docsRsProvider } from "./docs-rs.ts"

describe("docsRsProvider", () => {
	test("resolves docs.rs/{crate}/latest/{crate} URL", async () => {
		const ctx = await docsRsProvider.resolve(
			new URL("https://docs.rs/zerocopy/latest/zerocopy/"),
			AbortSignal.timeout(10000),
		)
		expect(ctx).toBeDefined()
		expect(ctx!.url).toBeDefined()
		expect(ctx!.url!.host).toBe("github.com")
	})

	test("resolves docs.rs/crate/{crate} URL", async () => {
		const ctx = await docsRsProvider.resolve(
			new URL("https://docs.rs/crate/zerocopy"),
			AbortSignal.timeout(10000),
		)
		expect(ctx).toBeDefined()
		expect(ctx!.url).toBeDefined()
		expect(ctx!.url!.host).toBe("github.com")
	})

	test("returns undefined for bare docs.rs URL", async () => {
		const ctx = await docsRsProvider.resolve(
			new URL("https://docs.rs"),
			AbortSignal.timeout(5000),
		)
		expect(ctx).toBeUndefined()
	})

	test("returns undefined for docs.rs/crate/ without name", async () => {
		const ctx = await docsRsProvider.resolve(
			new URL("https://docs.rs/crate/"),
			AbortSignal.timeout(5000),
		)
		expect(ctx).toBeUndefined()
	})
})
