import { describe, expect, test } from "vitest"
import type { Repo } from "../flow/types.ts"
import { PROVIDER_LOOKUP_MODE, type Provider } from "./types.ts"
import { createProviderRegistry } from "./registry.ts"

function makeProvider(name: string, hosts: ReadonlyArray<string>): Provider {
	return {
		name,
		hosts,
		async *candidates() {},
		verify: async () => null,
	}
}

function makeRepo(host: string | null): Repo {
	return {
		id: "repo-1",
		input: "input",
		url: new URL("https://example.com/org/repo"),
		inputUrl: null,
		host,
		org: "org",
		project: "repo",
		state: "candidate",
		producedBy: "test",
		verifiedBy: new Set<string>(),
	}
}

describe("createProviderRegistry", () => {
	test("keeps provider registration order by default", () => {
		const github = makeProvider("github", ["github.com"])
		const gitlab = makeProvider("gitlab", ["gitlab.com"])
		const registry = createProviderRegistry([github, gitlab])

		const found = registry.lookup("mary.my.id/atcute")
		expect(found.map((provider) => provider.name)).toEqual(["github", "gitlab"])
	})

	test("prioritizes matching host provider but still includes all providers", () => {
		const github = makeProvider("github", ["github.com"])
		const gitlab = makeProvider("gitlab", ["gitlab.com"])
		const tangled = makeProvider("tangled", ["tangled.org"])
		const registry = createProviderRegistry([github, gitlab, tangled])

		const found = registry.lookup("https://tangled.org/mary.my.id/atcute")
		expect(found.map((provider) => provider.name)).toEqual([
			"tangled",
			"github",
			"gitlab",
		])
	})

	test("uses repo host hint in verify mode", () => {
		const github = makeProvider("github", ["github.com"])
		const gitlab = makeProvider("gitlab", ["gitlab.com"])
		const registry = createProviderRegistry([github, gitlab])

		const found = registry.lookup("org/repo", {
			mode: PROVIDER_LOOKUP_MODE.verify,
			repo: makeRepo("gitlab.com"),
		})

		expect(found.map((provider) => provider.name)).toEqual(["gitlab", "github"])
	})

	test("rejects duplicate provider names", () => {
		const github = makeProvider("github", ["github.com"])
		const registry = createProviderRegistry([github])

		expect(() => {
			registry.register(makeProvider("github", ["github.enterprise.local"]))
		}).toThrow("provider already registered: github")
	})
})
