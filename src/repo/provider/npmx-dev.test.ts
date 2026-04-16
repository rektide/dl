import { describe, expect, test } from "vitest"
import { npmxDevProvider } from "./npmx-dev.ts"

async function collectCandidates(provider: typeof npmxDevProvider, input: string, timeout = 10000): Promise<string[]> {
	const urls: string[] = []
	for await (const ctx of provider.candidates(input)) {
		if (ctx.url) urls.push(ctx.url.toString())
	}
	return urls
}

describe("npmxDevProvider", () => {
	test("resolves npmx.dev unscoped package to github repo", async () => {
		const urls = await collectCandidates(npmxDevProvider, "https://npmx.dev/package/lightningcss")
		expect(urls).toContain("https://github.com/parcel-bundler/lightningcss")
	})

	test("resolves www.npmjs.com scoped package to github repo", async () => {
		const urls = await collectCandidates(npmxDevProvider, "https://www.npmjs.com/package/@crosscopy/clipboard")
		expect(urls).toContain("https://github.com/CrossCopy/clipboard")
	})

	test("resolves scoped package that resolves to monorepo", async () => {
		const urls = await collectCandidates(npmxDevProvider, "https://npmx.dev/package/@mariozechner/pi-agent-core")
		expect(urls).toContain("https://github.com/badlogic/pi-mono")
	})

	test("returns nothing for non-package paths", async () => {
		const urls = await collectCandidates(npmxDevProvider, "https://npmx.dev/search?q=test", 5000)
		expect(urls).toHaveLength(0)
	})

	test("returns nothing for missing package name", async () => {
		const urls = await collectCandidates(npmxDevProvider, "https://npmx.dev/package/", 5000)
		expect(urls).toHaveLength(0)
	})
})
