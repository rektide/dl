export function prependOrg(org: string | undefined, positionals: readonly string[]): readonly string[] {
	return org
		? positionals.map((input) => `${org}/${input}`)
		: positionals
}
