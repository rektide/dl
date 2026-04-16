import type { Repo, RepoRegistry } from "./types.ts"

export function createRegistry(generic: Repo): RepoRegistry {
	const byHost = new Map<string, Repo>()
	const providers: Repo[] = []

	return {
		byHost,
		providers,
		generic,

		register(provider: Repo): void {
			providers.push(provider)
			for (const host of provider.hosts) {
				byHost.set(host, provider)
			}
		},

		lookup(host: string): Repo {
			const exact = byHost.get(host)
			if (exact) return exact

			for (const [pattern, repo] of byHost) {
				if (host.includes(pattern)) return repo
			}

			return generic
		},
	}
}
