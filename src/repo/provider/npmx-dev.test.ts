import { describe, expect, test } from "vitest"
import { npmxDevProvider } from "./npmx-dev.ts"

describe("npmxDevProvider", () => {
	test("resolves npmx.dev/package/{name} URL", async () => {
		const ctx = await npmxDevProvider.resolve(
			new URL("https://npmx.dev/package/lightningcss"),
			AbortSignal.timeout(10000),
		)
		expect(ctx).toBeDefined()
		expect(ctx!.url).toBeDefined()
		expect(ctx!.url!.host).toBe("github.com")
		expect(ctx!.url!.pathname).toContain("parcel-bundler/lightningcss")
	})

	test("returns undefined for non-package paths", async () => {
		const ctx = await npmxDevProvider.resolve(
			new URL("https://npmx.dev/search?q=test"),
			AbortSignal.timeout(5000),
		)
		expect(ctx).toBeUndefined()
	})

	test("returns undefined for missing package name", async () => {
		const ctx = await npmxDevProvider.resolve(
			new URL("https://npmx.dev/package/"),
			AbortSignal.timeout(5000),
		)
		expect(ctx).toBeUndefined()
	})
})
