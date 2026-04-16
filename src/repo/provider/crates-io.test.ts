import { describe, expect, test, beforeAll, afterAll, afterEach } from "vitest"
import { setupServer } from "msw/node"
import { http, HttpResponse } from "msw"
import { CratesIoProvider } from "./crates-io.ts"
import { DocsRsProvider } from "./docs-rs.ts"
import type { RepoContext } from "../context.ts"

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const cratesIo = new CratesIoProvider()
const docsRs = new DocsRsProvider()

async function collectCandidates(
	provider: CratesIoProvider | DocsRsProvider,
	input: string,
): Promise<RepoContext[]> {
	const results: RepoContext[] = []
	for await (const ctx of provider.candidates(input)) {
		results.push(ctx)
	}
	return results
}

function mockCratesApi(crateName: string, repoUrl: string | null) {
	server.use(
		http.get(`https://crates.io/api/v1/crates/${crateName}`, ({ request }) => {
			const headers = request.headers
			if (headers.get("user-agent") !== "rekon-dl") {
				return new HttpResponse(null, { status: 403 })
			}
			if (!repoUrl) {
				return HttpResponse.json({ crate: {} })
			}
			return HttpResponse.json({ crate: { repository: repoUrl } })
		}),
	)
}

describe("CratesIoProvider.extractIdentifier", () => {
	test("extracts from crates.io/crates/NAME URL", () => {
		expect(cratesIo.extractIdentifier("https://crates.io/crates/serde")).toBe("serde")
	})

	test("extracts from crates.io crates shorthand", () => {
		expect(cratesIo.extractIdentifier("crates.io/crates/serde")).toBe("serde")
	})

	test("extracts bare crate name", () => {
		expect(cratesIo.extractIdentifier("serde")).toBe("serde")
	})

	test("rejects bare name with dot", () => {
		expect(cratesIo.extractIdentifier("some.name")).toBeUndefined()
	})

	test("rejects crates.io/users path", () => {
		expect(cratesIo.extractIdentifier("https://crates.io/users/someone")).toBeUndefined()
	})

	test("rejects empty crate name", () => {
		expect(cratesIo.extractIdentifier("https://crates.io/crates/")).toBeUndefined()
	})

	test("rejects other host URLs", () => {
		expect(cratesIo.extractIdentifier("https://docs.rs/serde")).toBeUndefined()
	})
})

describe("CratesIoProvider.candidates (with MSW)", () => {
	test("resolves crate to github repo", async () => {
		mockCratesApi("serde", "https://github.com/serde-rs/serde")

		const results = await collectCandidates(cratesIo, "https://crates.io/crates/serde")
		expect(results).toHaveLength(1)
		expect(results[0]!.org).toBe("serde-rs")
		expect(results[0]!.project).toBe("serde")
		expect(results[0]!.host).toBe("github.com")
	})

	test("resolves bare crate name", async () => {
		mockCratesApi("tokio", "https://github.com/tokio-rs/tokio")

		const results = await collectCandidates(cratesIo, "tokio")
		expect(results).toHaveLength(1)
		expect(results[0]!.url!.toString()).toBe("https://github.com/tokio-rs/tokio")
	})

	test("yields nothing when crate has no repository field", async () => {
		mockCratesApi("orphan-crate", null)

		const results = await collectCandidates(cratesIo, "orphan-crate")
		expect(results).toHaveLength(0)
	})

	test("yields nothing for API 404", async () => {
		server.use(
			http.get("https://crates.io/api/v1/crates/nonexistent-crate-xyz", () => {
				return new HttpResponse(null, { status: 404 })
			}),
		)

		const results = await collectCandidates(cratesIo, "nonexistent-crate-xyz")
		expect(results).toHaveLength(0)
	})

	test("yields nothing for unrecognized input", async () => {
		const results = await collectCandidates(cratesIo, "github.com/org/repo")
		expect(results).toHaveLength(0)
	})
})

describe("DocsRsProvider.extractIdentifier", () => {
	test("extracts from docs.rs/NAME URL", () => {
		expect(docsRs.extractIdentifier("https://docs.rs/serde/latest/serde/")).toBe("serde")
	})

	test("extracts from docs.rs/crate/NAME URL", () => {
		expect(docsRs.extractIdentifier("https://docs.rs/crate/serde")).toBe("serde")
	})

	test("extracts from docs.rs shorthand", () => {
		expect(docsRs.extractIdentifier("docs.rs/serde")).toBe("serde")
	})

	test("extracts bare crate name", () => {
		expect(docsRs.extractIdentifier("serde")).toBe("serde")
	})

	test("rejects bare docs.rs URL", () => {
		expect(docsRs.extractIdentifier("https://docs.rs")).toBeUndefined()
	})

	test("rejects docs.rs/crate/ without name", () => {
		expect(docsRs.extractIdentifier("https://docs.rs/crate/")).toBeUndefined()
	})
})

describe("DocsRsProvider.candidates (with MSW)", () => {
	test("resolves via same crates.io API as CratesIoProvider", async () => {
		mockCratesApi("zerocopy", "https://github.com/google/zerocopy")

		const results = await collectCandidates(docsRs, "https://docs.rs/zerocopy/latest/zerocopy/")
		expect(results).toHaveLength(1)
		expect(results[0]!.url!.toString()).toBe("https://github.com/google/zerocopy")
	})

	test("resolves docs.rs/crate/ path", async () => {
		mockCratesApi("zerocopy", "https://github.com/google/zerocopy")

		const results = await collectCandidates(docsRs, "https://docs.rs/crate/zerocopy")
		expect(results).toHaveLength(1)
		expect(results[0]!.url!.toString()).toBe("https://github.com/google/zerocopy")
	})
})

describe("RedirectRepo.verify", () => {
	test("is a no-op for both providers", async () => {
		const ctx = await collectCandidates(cratesIo, "serde").then((r) => r[0]!)
		const verified: RepoContext[] = []
		for await (const v of cratesIo.verify(ctx, new AbortController().signal)) {
			verified.push(v)
		}
		expect(verified).toHaveLength(0)
	})
})
