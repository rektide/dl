import { cloneOrUpdate } from "./clone.ts"
import { ensureJjInitialized } from "./jj.ts"
import { listRemotes, normalizeCloneUrl } from "./remote.ts"
import type { GitOps } from "./types.ts"

export const defaultGitOps: GitOps = {
	cloneOrUpdate,
	ensureJjInitialized,
	listRemotes,
	normalizeCloneUrl,
}
