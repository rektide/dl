export type InputEntryShape = {
	value: string
	source: string
}

export type InputEntry = Readonly<InputEntryShape>

export type InputStream = AsyncIterable<InputEntry>

export type InputSourceShape = {
	name: string
	active: boolean
	stream(): InputStream
}

export type InputSource = Readonly<InputSourceShape>

export type InputOptionsShape = {
	org: string | null
	watch: boolean
	clipboard: boolean
}

export type InputOptions = Readonly<InputOptionsShape>
