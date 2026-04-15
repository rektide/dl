import { describe, expect, test } from "vitest"
import { cratesIoProvider } from "./crates-io.ts"

describe("cratesIoProvider", () => {
	test("resolves crates.io URL to repository URL", async () => {
		const ctx = await cratesIoProvider.resolve(
			new URL("https://crates.io/crates/hardware-address"),
			AbortSignal.timeout(10000),
		)
		expect(ctx).toBeDefined()
		expect(ctx!.url).toBeDefined()
		expect(ctx!.url!.host).toBe("github.com")
	})

	test("returns undefined for non-crate paths", async () => {
		const ctx = await cratesIoProvider.resolve(
			new URL("https://crates.io/users/someone"),
			AbortSignal.timeout(5000),
		)
		expect(ctx).toBeUndefined()
	})

	test("returns undefined for missing crate name", async () => {
		const ctx = await cratesIoProvider.resolve(
			new URL("https://crates.io/crates/"),
			AbortSignal.timeout(5000),
		)
		expect(ctx).toBeUndefined()
	})
})
