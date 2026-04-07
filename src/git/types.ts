export type GitCloneStatus = "cloned" | "updated"
export type JjInitStatus = "initialized" | "already_initialized"

export interface GitOps {
	cloneOrUpdate: (remoteUrl: string, destination: string) => Promise<GitCloneStatus>
	ensureJjInitialized: (destination: string) => Promise<JjInitStatus>
	listRemotes: (repoDir: string) => Promise<string[]>
	normalizeCloneUrl: (remoteUrl: string) => string
}
