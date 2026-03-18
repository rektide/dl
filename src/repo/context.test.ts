import { describe, expect, test } from "vitest"
import { DefaultRepoContext } from "./context.ts"

describe("DefaultRepoContext", () => {
	test("project is extension-less basename", () => {
		const ctx = new DefaultRepoContext()
		ctx.url = new URL("https://github.com/huggingface/transformers.git")
		expect(ctx.project).toBe("transformers")
	})

	test("org is path before project", () => {
		const ctx = new DefaultRepoContext()
		ctx.url = new URL("https://github.com/huggingface/transformers")
		expect(ctx.org).toBe("huggingface")
	})

	test("handles nested org paths", () => {
		const ctx = new DefaultRepoContext()
		ctx.url = new URL("https://gitlab.com/group/subgroup/project")
		expect(ctx.org).toBe("group/subgroup")
		expect(ctx.project).toBe("project")
	})

	test("namespacePath combines org and project", () => {
		const ctx = new DefaultRepoContext()
		ctx.url = new URL("https://github.com/org/repo")
		expect(ctx.namespacePath).toBe("org/repo")
	})

	test("returns undefined when url not set", () => {
		const ctx = new DefaultRepoContext()
		expect(ctx.project).toBeUndefined()
		expect(ctx.org).toBeUndefined()
		expect(ctx.namespacePath).toBeUndefined()
	})
})
