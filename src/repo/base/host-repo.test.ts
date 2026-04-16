import { describe, expect, test, beforeAll, afterAll, afterEach } from "vitest"
import { setupServer } from "msw/node"
import { http, HttpResponse } from "msw"
import { HostRepo } from "./host-repo.ts"
import type { PathSplit } from "./host-repo.ts"
import type { RepoContext } from "../context.ts"

class TestHostRepo extends HostRepo {
	name = "test-host"
	hosts = ["testhost.example.com", "testhost.local"]

	splitPath(segments: string[]): PathSplit | null {
		if (segments.length < 2) return null
		return {
			org: segments.slice(0, -1).join("/"),
			project: segments.at(-1)!,
		}
	}

	async *verify(ctx: RepoContext, signal: AbortSignal): AsyncGenerator<RepoContext> {
		const response = await fetch(`https://testhost.example.com/api/${ctx.org}/${ctx.project}`, {
			signal,
		}).catch(() => null)
		if (!response || !response.ok) return
		ctx.verified = true
		yield ctx
	}
}

class FlatTestHostRepo extends HostRepo {
	name = "test-flat"
	hosts = ["flat.example.com"]

	splitPath(segments: string[]): PathSplit | null {
		if (segments.length < 2) return null
		return { org: segments[0]!, project: segments[1]! }
	}

	async *verify(_ctx: RepoContext): AsyncGenerator<RepoContext> {}
}

class NoSshTestHostRepo extends HostRepo {
	name = "test-nossh"
	hosts = ["nossh.example.com"]
	get supportsSsh() { return false }

	splitPath(segments: string[]): PathSplit | null {
		if (segments.length < 2) return null
		return { org: segments[0]!, project: segments[1]! }
	}

	async *verify(_ctx: RepoContext): AsyncGenerator<RepoContext> {}
}

async function collect(provider: HostRepo, input: string): Promise<RepoContext[]> {
	const results: RepoContext[] = []
	for await (const ctx of provider.candidates(input)) {
		results.push(ctx)
	}
	return results
}

describe("HostRepo.toUrlString", () => {
	const provider = new TestHostRepo()

	test("constructs URL from host/org/project", () => {
		const ctx = { org: "myorg", project: "myrepo" } as RepoContext
		expect(provider.toUrlString(ctx)).toBe("https://testhost.example.com/myorg/myrepo")
	})

	test("returns undefined when org missing", () => {
		const ctx = { project: "myrepo" } as RepoContext
		expect(provider.toUrlString(ctx)).toBeUndefined()
	})

	test("returns undefined when project missing", () => {
		const ctx = { org: "myorg" } as RepoContext
		expect(provider.toUrlString(ctx)).toBeUndefined()
	})
})

describe("HostRepo.candidates SSH branch", () => {
	const provider = new TestHostRepo()

	test("produces candidate for matching SSH host", async () => {
		const results = await collect(provider, "git@testhost.example.com:org/repo")
		expect(results).toHaveLength(1)
		expect(results[0]!.org).toBe("org")
		expect(results[0]!.project).toBe("repo")
		expect(results[0]!.host).toBe("testhost.example.com")
	})

	test("produces candidate for SSH with nested org", async () => {
		const results = await collect(provider, "git@testhost.example.com:group/subgroup/repo")
		expect(results).toHaveLength(1)
		expect(results[0]!.org).toBe("group/subgroup")
		expect(results[0]!.project).toBe("repo")
	})

	test("produces candidate for secondary host", async () => {
		const results = await collect(provider, "git@testhost.local:org/repo")
		expect(results).toHaveLength(1)
		expect(results[0]!.host).toBe("testhost.example.com")
	})

	test("returns nothing for non-matching SSH host", async () => {
		const results = await collect(provider, "git@other.host:org/repo")
		expect(results).toHaveLength(0)
	})

	test("returns nothing for SSH with single path segment", async () => {
		const results = await collect(provider, "git@testhost.example.com:repo")
		expect(results).toHaveLength(0)
	})
})

describe("HostRepo.candidates SSH disabled", () => {
	const provider = new NoSshTestHostRepo()

	test("returns nothing for SSH input when supportsSsh is false", async () => {
		const results = await collect(provider, "git@nossh.example.com:org/repo")
		expect(results).toHaveLength(0)
	})

	test("still produces candidates for URL input", async () => {
		const results = await collect(provider, "https://nossh.example.com/org/repo")
		expect(results).toHaveLength(1)
	})
})

describe("HostRepo.candidates URL branch", () => {
	const provider = new TestHostRepo()

	test("produces candidate for matching URL host", async () => {
		const results = await collect(provider, "https://testhost.example.com/org/repo")
		expect(results).toHaveLength(1)
		expect(results[0]!.url!.toString()).toBe("https://testhost.example.com/org/repo")
	})

	test("produces candidate for nested path (gitlab-style)", async () => {
		const results = await collect(provider, "https://testhost.example.com/a/b/c")
		expect(results).toHaveLength(1)
		expect(results[0]!.org).toBe("a/b")
		expect(results[0]!.project).toBe("c")
	})

	test("returns nothing for non-matching URL host", async () => {
		const results = await collect(provider, "https://other.host/org/repo")
		expect(results).toHaveLength(0)
	})

	test("returns nothing for URL with single path segment", async () => {
		const results = await collect(provider, "https://testhost.example.com/org")
		expect(results).toHaveLength(0)
	})
})

describe("HostRepo.candidates host-prefixed shorthand branch", () => {
	const provider = new TestHostRepo()

	test("produces candidate for host/org/project", async () => {
		const results = await collect(provider, "testhost.example.com/org/repo")
		expect(results).toHaveLength(1)
		expect(results[0]!.url!.toString()).toBe("https://testhost.example.com/org/repo")
	})

	test("produces candidate for secondary host shorthand", async () => {
		const results = await collect(provider, "testhost.local/a/b/c")
		expect(results).toHaveLength(1)
		expect(results[0]!.org).toBe("a/b")
	})

	test("returns nothing for single segment after host", async () => {
		const results = await collect(provider, "testhost.example.com/org")
		expect(results).toHaveLength(0)
	})
})

describe("HostRepo.candidates bare shorthand branch", () => {
	const nested = new TestHostRepo()
	const flat = new FlatTestHostRepo()

	test("nested org: produces candidate for org/repo without dot", async () => {
		const results = await collect(nested, "org/repo")
		expect(results).toHaveLength(1)
		expect(results[0]!.host).toBe("testhost.example.com")
	})

	test("does not produce candidate for unknown dotted first segment", async () => {
		const results = await collect(nested, "ajbird.net/atmoco-vods")
		expect(results).toHaveLength(0)
	})

	test("does not produce candidate for dotted first segment matching a known host", async () => {
		const results = await collect(nested, "testhost.example.com/org/repo")
		expect(results).toHaveLength(1)
		expect(results[0]!.org).toBe("org")
		expect(results[0]!.project).toBe("repo")
	})

	test("flat org: produces candidate for org/repo", async () => {
		const results = await collect(flat, "org/repo")
		expect(results).toHaveLength(1)
		expect(results[0]!.org).toBe("org")
		expect(results[0]!.project).toBe("repo")
	})

	test("returns nothing for single segment", async () => {
		const results = await collect(nested, "org")
		expect(results).toHaveLength(0)
	})

	test("returns nothing for host-like first segment", async () => {
		const results = await collect(nested, "github.com/org/repo")
		expect(results).toHaveLength(0)
	})
})

describe("HostRepo.candidates source tracking", () => {
	const provider = new TestHostRepo()

	test("sets source.provider on all candidates", async () => {
		const results = await collect(provider, "org/repo")
		expect(results[0]!.source.provider).toBe("test-host")
	})

	test("sets url, host, org, project on every candidate", async () => {
		const results = await collect(provider, "testhost.example.com/a/b")
		const ctx = results[0]!
		expect(ctx.host).toBeDefined()
		expect(ctx.org).toBeDefined()
		expect(ctx.project).toBeDefined()
		expect(ctx.url).toBeInstanceOf(URL)
	})
})

describe("HostRepo.verify with MSW", () => {
	const server = setupServer()
	beforeAll(() => server.listen())
	afterEach(() => server.resetHandlers())
	afterAll(() => server.close())

	const provider = new TestHostRepo()

	test("yields verified context for 200 response", async () => {
		server.use(
			http.get("https://testhost.example.com/api/org/repo", () => {
				return HttpResponse.json({ ok: true })
			}),
		)

		const [ctx] = await collect(provider, "org/repo")
		const verified: RepoContext[] = []
		for await (const v of provider.verify(ctx, new AbortController().signal)) {
			verified.push(v)
		}
		expect(verified).toHaveLength(1)
		expect(verified[0]!.verified).toBe(true)
	})

	test("yields nothing for non-ok response", async () => {
		server.use(
			http.get("https://testhost.example.com/api/org/nonexistent", () => {
				return new HttpResponse(null, { status: 404 })
			}),
		)

		const [ctx] = await collect(provider, "org/nonexistent")
		const verified: RepoContext[] = []
		for await (const v of provider.verify(ctx, new AbortController().signal)) {
			verified.push(v)
		}
		expect(verified).toHaveLength(0)
	})

	test("yields nothing on network error", async () => {
		server.use(
			http.get("https://testhost.example.com/api/org/repo", () => {
				return HttpResponse.error()
			}),
		)

		const [ctx] = await collect(provider, "org/repo")
		const verified: RepoContext[] = []
		for await (const v of provider.verify(ctx, new AbortController().signal)) {
			verified.push(v)
		}
		expect(verified).toHaveLength(0)
	})
})
