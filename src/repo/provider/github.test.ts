import { describe, expect, test, beforeAll, afterAll, afterEach } from "vitest"
import { setupServer } from "msw/node"
import { http, HttpResponse } from "msw"
import { GithubProvider } from "./github.ts"
import type { RepoContext } from "../context.ts"

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const provider = new GithubProvider()

async function collect(input: string): Promise<RepoContext[]> {
	const results: RepoContext[] = []
	for await (const ctx of provider.candidates(input)) {
		results.push(ctx)
	}
	return results
}

describe("GithubProvider", () => {
	test("splitPath takes first two segments only", () => {
		expect(provider.splitPath(["org", "repo", "tree", "main"])).toEqual({ org: "org", project: "repo" })
		expect(provider.splitPath(["org"])).toBeNull()
	})

	test("candidates from SSH input", async () => {
		const results = await collect("git@github.com:serde-rs/serde")
		expect(results).toHaveLength(1)
		expect(results[0]!.url!.toString()).toBe("https://github.com/serde-rs/serde")
	})

	test("candidates from URL input", async () => {
		const results = await collect("https://github.com/serde-rs/serde")
		expect(results).toHaveLength(1)
		expect(results[0]!.org).toBe("serde-rs")
	})

	test("candidates from host-prefixed shorthand", async () => {
		const results = await collect("github.com/serde-rs/serde")
		expect(results).toHaveLength(1)
	})

	test("candidates from bare shorthand", async () => {
		const results = await collect("serde-rs/serde")
		expect(results).toHaveLength(1)
		expect(results[0]!.host).toBe("github.com")
	})

	test("no candidates for non-github SSH", async () => {
		const results = await collect("git@gitlab.com:org/repo")
		expect(results).toHaveLength(0)
	})

	test("no candidates for single segment", async () => {
		const results = await collect("serde-rs")
		expect(results).toHaveLength(0)
	})

	test("verify yields verified context for existing repo", async () => {
		server.use(
			http.get("https://api.github.com/repos/serde-rs/serde", () => {
				return HttpResponse.json({ full_name: "serde-rs/serde" })
			}),
		)

		const [ctx] = await collect("serde-rs/serde")
		const verified: RepoContext[] = []
		for await (const v of provider.verify(ctx, new AbortController().signal)) {
			verified.push(v)
		}
		expect(verified).toHaveLength(1)
		expect(verified[0]!.verified).toBe(true)
	})

	test("verify yields nothing for 404", async () => {
		server.use(
			http.get("https://api.github.com/repos/org/nonexistent", () => {
				return new HttpResponse(null, { status: 404 })
			}),
		)

		const [ctx] = await collect("org/nonexistent")
		const verified: RepoContext[] = []
		for await (const v of provider.verify(ctx, new AbortController().signal)) {
			verified.push(v)
		}
		expect(verified).toHaveLength(0)
	})

	test("resolveWikiRepo sets .wiki.git URL", async () => {
		const [ctx] = await collect("serde-rs/serde")
		provider.resolveWikiRepo!(ctx)
		expect(ctx.wikiRepoUrl!.toString()).toBe("https://github.com/serde-rs/serde.wiki.git")
	})
})
