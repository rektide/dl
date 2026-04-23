// pattern: Functional Core

import { PROVIDER_LOOKUP_MODE } from "./types.ts"
import type {
	Provider,
	ProviderLookupMode,
	ProviderLookupOptions,
	ProviderRegistry,
} from "./types.ts"

function parseInputHost(input: string): string | null {
	const trimmed = input.trim()
	if (!trimmed) return null

	try {
		const parsed = new URL(trimmed)
		return parsed.host || null
	} catch {
		const first = trimmed.split("/", 1)[0] ?? ""
		if (!first) return null
		if (first.includes(".") || first === "localhost") return first
		return null
	}
}

function collectHostHints(
	input: string,
	mode: ProviderLookupMode,
	options?: ProviderLookupOptions,
): ReadonlySet<string> {
	const hints = new Set<string>()
	const repoHost = options?.repo?.host
	if (repoHost) hints.add(repoHost)

	if (mode === PROVIDER_LOOKUP_MODE.candidate || mode === PROVIDER_LOOKUP_MODE.verify) {
		const inputHost = parseInputHost(input)
		if (inputHost) hints.add(inputHost)
	}

	return hints
}

function orderProviders(
	providers: ReadonlyArray<Provider>,
	hostHints: ReadonlySet<string>,
): ReadonlyArray<Provider> {
	if (hostHints.size === 0) return [...providers]

	const preferred: Array<Provider> = []
	const remainder: Array<Provider> = []

	for (const provider of providers) {
		const isPreferred = provider.hosts.some((host) => hostHints.has(host))
		if (isPreferred) {
			preferred.push(provider)
			continue
		}
		remainder.push(provider)
	}

	return [...preferred, ...remainder]
}

export function createProviderRegistry(
	initialProviders: ReadonlyArray<Provider> = [],
): ProviderRegistry {
	const providers: Array<Provider> = []
	const byName = new Map<string, Provider>()

	function register(provider: Provider): void {
		if (byName.has(provider.name)) {
			throw new Error(`provider already registered: ${provider.name}`)
		}
		providers.push(provider)
		byName.set(provider.name, provider)
	}

	for (const provider of initialProviders) {
		register(provider)
	}

	return {
		get providers() {
			return [...providers]
		},
		get byName() {
			return new Map(byName)
		},
		register,
		lookup(input: string, options?: ProviderLookupOptions): ReadonlyArray<Provider> {
			const mode = options?.mode ?? PROVIDER_LOOKUP_MODE.candidate
			const hints = collectHostHints(input, mode, options)
			return orderProviders(providers, hints)
		},
	}
}
