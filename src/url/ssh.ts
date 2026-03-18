import type { Expander } from "./types.ts"

export const sshExpander: Expander = {
	name: "ssh",
	expand(input: string): URL[] {
		const trimmed = input.trim()
		const match = trimmed.match(/^git@([^:]+):(.+)$/)
		if (!match) return []

		const host = match[1]
		let path = match[2]
		path = path.replace(/\.git$/, "")
		path = path.split(/[?#]/, 1)[0] ?? ""

		return [new URL(`https://${host}/${path}`)]
	},
}
