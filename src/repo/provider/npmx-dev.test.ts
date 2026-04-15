import { describe, expect, test } from "vitest"
import { npmxDevProvider } from "./npmx-dev.ts"

describe("npmxDevProvider", () => {
	test("resolves npmx.dev unscoped package to github repo", async () => {
		const ctx = await npmxDevProvider.resolve(
			new URL("https://npmx.dev/package/lightningcss"),
			AbortSignal.timeout(10000),
		)
		expect(ctx).toBeDefined()
		expect(ctx!.url!.toString()).toBe("https://github.com/parcel-bundler/lightningcss")
		expect(ctx!.org).toBe("parcel-bundler")
		expect(ctx!.project).toBe("lightningcss")
	})

	test("resolves www.npmjs.com scoped package to github repo", async () => {
		const ctx = await npmxDevProvider.resolve(
			new URL("https://www.npmjs.com/package/@crosscopy/clipboard"),
			AbortSignal.timeout(10000),
		)
		expect(ctx).toBeDefined()
		expect(ctx!.url!.toString()).toBe("https://github.com/CrossCopy/clipboard")
		expect(ctx!.org).toBe("CrossCopy")
		expect(ctx!.project).toBe("clipboard")
	})

	test("resolves scoped package that resolves to monorepo", async () => {
		const ctx = await npmxDevProvider.resolve(
			new URL("https://npmx.dev/package/@mariozechner/pi-agent-core"),
			AbortSignal.timeout(10000),
		)
		expect(ctx).toBeDefined()
		expect(ctx!.url!.toString()).toBe("https://github.com/badlogic/pi-mono")
		expect(ctx!.org).toBe("badlogic")
		expect(ctx!.project).toBe("pi-mono")
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
