import type { Repo } from "../flow/types.ts"

export type Provider = Readonly<{
	name: string
	hosts: ReadonlyArray<string>
	candidates(input: string): AsyncGenerator<Repo>
	verify(repo: Repo, signal: AbortSignal): AsyncGenerator<Repo>
}>

export type ProviderRegistry = Readonly<{
	providers: ReadonlyArray<Provider>
	byName: ReadonlyMap<string, Provider>
	byHost: ReadonlyMap<string, ReadonlyArray<Provider>>
	register(provider: Provider): void
	lookup(host: string): ReadonlyArray<Provider>
	resolve(input: string): ReadonlyArray<Provider>
}>
