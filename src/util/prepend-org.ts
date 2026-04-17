export function prependOrg(org: string | undefined, positionals: string[]): string[] {
	return org
		? positionals.map((input) => `${org}/${input}`)
		: positionals
}
