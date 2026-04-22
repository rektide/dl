export type InputEntry = Readonly<{
	value: string
	source: string
}>

export type InputStream = AsyncIterable<InputEntry>

export type InputSource = Readonly<{
	name: string
	active: boolean
	stream(): InputStream
}>

export type InputOptions = Readonly<{
	org: string | null
	watch: boolean
	clipboard: boolean
}>
