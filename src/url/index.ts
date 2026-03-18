import type { Expander } from "./types.ts"

export type { Expander } from "./types.ts"
export { sshExpander } from "./ssh.ts"
export { urlExpander } from "./url.ts"
export { hostPathExpander } from "./host-path.ts"
export { createShorthandExpander } from "./shorthand.ts"
export type { ShorthandExpanderOptions } from "./shorthand.ts"

export function expand(
	input: string,
	expanders: Expander[],
): { url: URL; expander: string }[] {
	const seen = new Set<string>()
	const candidates: { url: URL; expander: string }[] = []
	for (const exp of expanders) {
		for (const url of exp.expand(input)) {
			const key = url.toString()
			if (seen.has(key)) continue
			seen.add(key)
			candidates.push({ url, expander: exp.name })
		}
	}
	return candidates
}
