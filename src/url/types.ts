export interface Expander {
	name: string
	expand(input: string): URL[]
}
