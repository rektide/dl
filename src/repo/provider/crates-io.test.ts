import { describe, expect, test } from "vitest"
import { DefaultRepoContext } from "../context.ts"
import { cratesIoProvider, docsRsProvider } from "./crates-io.ts"

function makeCtx(url: string): DefaultRepoContext {
	const ctx = new DefaultRepoContext()
	ctx.url = new URL(url)
	ctx.source = { provider: "crates-io" }
	return ctx
}

describe("cratesIoProvider", () => {
	test("resolves crates.io/crates/hardware-address to github repo", async () => {
		const ctx = await cratesIoProvider.verify(
			makeCtx("https://crates.io/crates/hardware-address"),
			AbortSignal.timeout(10000),
		)
		expect(ctx).toBeDefined()
		expect(ctx!.url!.toString()).toBe("https://github.com/al8n/hardware-address")
		expect(ctx!.org).toBe("al8n")
		expect(ctx!.project).toBe("hardware-address")
	})

	test("returns undefined for non-crate paths", async () => {
		const ctx = await cratesIoProvider.verify(
			makeCtx("https://crates.io/users/someone"),
			AbortSignal.timeout(5000),
		)
		expect(ctx).toBeUndefined()
	})

	test("returns undefined for missing crate name", async () => {
		const ctx = await cratesIoProvider.verify(
			makeCtx("https://crates.io/crates/"),
			AbortSignal.timeout(5000),
		)
		expect(ctx).toBeUndefined()
	})
})

describe("docsRsProvider", () => {
	test("resolves docs.rs/{crate}/latest/{crate} to github repo", async () => {
		const ctx = await docsRsProvider.verify(
			makeCtx("https://docs.rs/zerocopy/latest/zerocopy/"),
			AbortSignal.timeout(10000),
		)
		expect(ctx).toBeDefined()
		expect(ctx!.url!.toString()).toBe("https://github.com/google/zerocopy")
		expect(ctx!.org).toBe("google")
		expect(ctx!.project).toBe("zerocopy")
	})

	test("resolves docs.rs/crate/{crate} to same repo", async () => {
		const ctxA = await docsRsProvider.verify(
			makeCtx("https://docs.rs/zerocopy/latest/zerocopy/"),
			AbortSignal.timeout(10000),
		)
		const ctxB = await docsRsProvider.verify(
			makeCtx("https://docs.rs/crate/zerocopy"),
			AbortSignal.timeout(10000),
		)
		expect(ctxA!.url!.toString()).toBe(ctxB!.url!.toString())
	})

	test("returns undefined for bare docs.rs URL", async () => {
		const ctx = await docsRsProvider.verify(
			makeCtx("https://docs.rs"),
			AbortSignal.timeout(5000),
		)
		expect(ctx).toBeUndefined()
	})

	test("returns undefined for docs.rs/crate/ without name", async () => {
		const ctx = await docsRsProvider.verify(
			makeCtx("https://docs.rs/crate/"),
			AbortSignal.timeout(5000),
		)
		expect(ctx).toBeUndefined()
	})
})
