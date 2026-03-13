export interface GitOps {
	cloneOrUpdate: (remoteUrl: string, destination: string) => Promise<void>
	ensureJjInitialized: (destination: string) => Promise<void>
	listRemotes: (repoDir: string) => Promise<string[]>
	normalizeCloneUrl: (remoteUrl: string) => string
}
