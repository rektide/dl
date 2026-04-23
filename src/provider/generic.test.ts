import { describe, expect, test } from "vitest"
import { genericProvider } from "./generic.ts"

describe("genericProvider.candidates", () => {
	test("builds host/project URL without double slash", async () => {
		const results = []
		for await (const repo of genericProvider.candidates("mary.my.id/atcute")) {
			results.push(repo)
		}

		expect(results).toHaveLength(1)
		expect(results[0]?.url.toString()).toBe("https://mary.my.id/atcute")
		expect(results[0]?.org).toBeNull()
		expect(results[0]?.project).toBe("atcute")
	})

	test("keeps org/project URL shape when org exists", async () => {
		const results = []
		for await (const repo of genericProvider.candidates("example.com/foo/bar")) {
			results.push(repo)
		}

		expect(results).toHaveLength(1)
		expect(results[0]?.url.toString()).toBe("https://example.com/foo/bar")
		expect(results[0]?.org).toBe("foo")
		expect(results[0]?.project).toBe("bar")
	})
})
