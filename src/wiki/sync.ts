import { defaultGitOps } from "../git/default.ts";
import type { GitCloneStatus, GitOps } from "../git/types.ts";
import type { LogExtension } from "../plugin/log.ts";

export type GitWikiSyncReport =
  | {
      readonly status: GitCloneStatus;
    }
  | {
      readonly status: "failed";
      readonly message: string;
    };

export async function syncGitWiki(
  wikiRepoUrl: URL,
  wikiDestination: string,
  gitOps: GitOps = defaultGitOps,
  log: LogExtension,
): Promise<GitWikiSyncReport> {
  try {
    const status = await gitOps.cloneOrUpdate(wikiRepoUrl.toString(), wikiDestination);
    return { status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("sync", "wiki_fetch_skipped", { message });
    return { status: "failed", message };
  }
}
