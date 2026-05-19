import { join } from "node:path";
import { defaultGitOps } from "../git/default.ts";
import type { GitCloneStatus, GitOps, JjInitStatus } from "../git/types.ts";
import type { Repo } from "../flow/types.ts";
import type { LogExtension } from "../plugin/log.ts";

export type ArchiveSyncReport = {
  readonly destination: string;
  readonly archiveStatus: GitCloneStatus;
  readonly jjStatus: JjInitStatus;
};

export async function syncArchive(
  repo: Repo,
  roots: { archiveRoot: string; wikiRoot: string; githubWikiRoot: string },
  log: LogExtension,
  gitOps: GitOps = defaultGitOps,
): Promise<ArchiveSyncReport> {
  const pathname = repo.url.pathname.replace(/^\//, "");
  const archiveDestination = join(roots.archiveRoot, pathname);
  log.info("sync", "archive", { destination: archiveDestination });
  const archiveStatus = await gitOps.cloneOrUpdate(repo.url.toString(), archiveDestination);
  const jjStatus = await gitOps.ensureJjInitialized(archiveDestination);

  return {
    destination: archiveDestination,
    archiveStatus,
    jjStatus,
  };
}
