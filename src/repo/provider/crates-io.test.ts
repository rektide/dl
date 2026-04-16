import { describe, expect, test } from "vitest"
import { cratesIoProvider, docsRsProvider } from "./crates-io.ts"

async function collectCandidates(provider: typeof cratesIoProvider, input: string, timeout = 10000): Promise<string[]> {
	const urls: string[] = []
	for await (const ctx of provider.candidates(input)) {
		if (ctx.url) urls.push(ctx.url.toString())
	}
	return urls
}

describe("cratesIoProvider", () => {
	test("resolves crates.io/crates/hardware-address to github repo", async () => {
		const urls = await collectCandidates(cratesIoProvider, "https://crates.io/crates/hardware-address")
		expect(urls).toContain("https://github.com/al8n/hardware-address")
	})

	test("returns nothing for non-crate paths", async () => {
		const urls = await collectCandidates(cratesIoProvider, "https://crates.io/users/someone", 5000)
		expect(urls).toHaveLength(0)
	})

	test("returns nothing for missing crate name", async () => {
		const urls = await collectCandidates(cratesIoProvider, "https://crates.io/crates/", 5000)
		expect(urls).toHaveLength(0)
	})
})

describe("docsRsProvider", () => {
	test("resolves docs.rs/{crate}/latest/{crate} to github repo", async () => {
		const urls = await collectCandidates(docsRsProvider, "https://docs.rs/zerocopy/latest/zerocopy/")
		expect(urls).toContain("https://github.com/google/zerocopy")
	})

	test("resolves docs.rs/crate/{crate} to same repo", async () => {
		const urlsA = await collectCandidates(docsRsProvider, "https://docs.rs/zerocopy/latest/zerocopy/")
		const urlsB = await collectCandidates(docsRsProvider, "https://docs.rs/crate/zerocopy")
		expect(urlsA[0]).toBe(urlsB[0])
	})

	test("returns nothing for bare docs.rs URL", async () => {
		const urls = await collectCandidates(docsRsProvider, "https://docs.rs", 5000)
		expect(urls).toHaveLength(0)
	})

	test("returns nothing for docs.rs/crate/ without name", async () => {
		const urls = await collectCandidates(docsRsProvider, "https://docs.rs/crate/", 5000)
		expect(urls).toHaveLength(0)
	})
})
