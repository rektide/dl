import { join } from "node:path";
import type { Repo } from "../flow/types.ts";
import type { RunOptions } from "../planner/types.ts";
import type { LogExtension } from "../plugin/log.ts";
import { simplify } from "./simplify.ts";
import { ensureSymlink, type SimplifyStatus } from "./ensure.ts";

export type SimplifySyncReport = {
  readonly orgStatus: SimplifyStatus | "skipped";
  readonly projectStatus: SimplifyStatus | "skipped";
  readonly org: string | null;
  readonly project: string | null;
};

/**
 * Given a resolved repo context, create org-level and repo-level simplified
 * symlinks under the archive root. Runs as a step in the dl pipeline after
 * {@link syncArchive} so the real directory exists.
 */
export async function syncSimplify(
  repo: Repo,
  roots: { archiveRoot: string; wikiRoot: string; githubWikiRoot: string },
  options: RunOptions,
  log: LogExtension,
): Promise<SimplifySyncReport> {
  const segments = repo.url.pathname.replace(/^\//, "").split("/");
  if (segments.length < 2) {
    return {
      orgStatus: "skipped",
      projectStatus: "skipped",
      org: null,
      project: null,
    };
  }

  const org = segments[0];
  const project = segments[1].replace(/\.git$/, "");

  const simplifiedOrg = simplify(org);
  const simplifiedProject = simplify(project);
  const dryRun = options.dryRun;
  const anycase = options.anycase;

  const orgStatus = await ensureSymlink(
    roots.archiveRoot,
    org,
    simplifiedOrg,
    dryRun,
    log,
    anycase,
  );

  const orgDir = join(roots.archiveRoot, org);
  const projectStatus = await ensureSymlink(
    orgDir,
    project,
    simplifiedProject,
    dryRun,
    log,
    anycase,
  );

  return {
    orgStatus,
    projectStatus,
    org,
    project,
  };
}
