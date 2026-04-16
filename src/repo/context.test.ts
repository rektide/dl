import { describe, expect, test } from "vitest"
import { DefaultRepoContext } from "./context.ts"

describe("DefaultRepoContext", () => {
	test("org and project are plain fields set by provider", () => {
		const ctx = new DefaultRepoContext()
		ctx.org = "huggingface"
		ctx.project = "transformers"
		ctx.host = "github.com"
		expect(ctx.org).toBe("huggingface")
		expect(ctx.project).toBe("transformers")
		expect(ctx.host).toBe("github.com")
	})

	test("defaults verified to false", () => {
		const ctx = new DefaultRepoContext()
		expect(ctx.verified).toBe(false)
	})

	test("defaults org, project, host to undefined", () => {
		const ctx = new DefaultRepoContext()
		expect(ctx.org).toBeUndefined()
		expect(ctx.project).toBeUndefined()
		expect(ctx.host).toBeUndefined()
	})
})
