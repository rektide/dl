import type { Repo, RepoRegistry } from "./types.ts"

export function createRegistry(generic: Repo): RepoRegistry {
	const byHost = new Map<string, Repo>()

	return {
		byHost,
		generic,

		register(provider: Repo, hosts?: string[]): void {
			if (hosts) {
				for (const host of hosts) {
					byHost.set(host, provider)
				}
			}
		},

		knownHosts(): string[] {
			return Array.from(byHost.keys())
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
