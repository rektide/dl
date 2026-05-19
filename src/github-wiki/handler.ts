import { ENSURE, OFF } from "../action/state.ts";
import type {
  Action,
  ActionResult,
  ActionSpec,
  RepoExecution,
} from "../planner/types.ts";
import { syncGitWiki } from "./sync.ts";
import { join } from "node:path";

const GITHUB_WIKI_STATES = [ENSURE, OFF] as const;

export const GITHUB_WIKI_ACTION_SPEC: ActionSpec = {
  name: "github-wiki",
  description: "GitHub Wiki git checkout action",
  role: "effect",
  defaultParticipation: "default",
  suppressesDefaultsWhenExplicit: true,
  defaultState: ENSURE,
  states: GITHUB_WIKI_STATES,
  optionKey: "githubWikiState",
};

export const GITHUB_WIKI_ACTION_FLAG_OPTION = {
  type: "boolean",
  default: false,
  description: "GitHub Wiki git checkout action (bare --github-wiki uses default state 'ensure')",
} as const;

export const GITHUB_WIKI_ACTION_STATE_OPTION = {
  type: "enum",
  choices: GITHUB_WIKI_STATES,
  description: "GitHub Wiki git checkout action state (ensure|off)",
} as const;

function gitHubWikiUrl(repoUrl: URL): URL | null {
  if (repoUrl.host !== "github.com" && repoUrl.host !== "gitlab.com") return null;
  return new URL(`${repoUrl.toString()}.wiki.git`);
}

async function runGitHubWiki(ctx: RepoExecution): Promise<ActionResult> {
  if (ctx.state === OFF) {
    ctx.report.skipped({ step: "github-wiki", source: "github-wiki", event: "off" });
    return { hadError: false };
  }

  const wikiRepoUrl = gitHubWikiUrl(ctx.repo.url);
  if (!wikiRepoUrl) {
    ctx.report.skipped({
      step: "github-wiki",
      source: "github-wiki",
      event: "not-applicable",
      details: { reason: "no wiki repository URL for this host" },
    });
    return { hadError: false };
  }

  ctx.facts.set("github-wiki.repoUrl", wikiRepoUrl);
  const pathname = ctx.repo.url.pathname.replace(/^\//, "");
  const wikiDestination = join(ctx.services.roots.githubWikiRoot, pathname);
  ctx.services.log.info("sync", "github-wiki", { destination: wikiDestination });

  try {
    const report = await syncGitWiki(
      wikiRepoUrl,
      wikiDestination,
      ctx.services.gitOps,
      ctx.services.log,
    );
    if (report.status === "failed") {
      ctx.report.failed({
        step: "github-wiki",
        source: "github-wiki -> syncGitWiki",
        event: "failed",
        details: { message: report.message, destination: wikiDestination },
      });
      return { hadError: true };
    }
    ctx.report.ok({
      step: "github-wiki",
      source: "github-wiki -> syncGitWiki",
      event: report.status,
      details: { destination: wikiDestination },
    });
    return { hadError: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.report.failed({
      step: "github-wiki",
      source: "github-wiki",
      event: "error",
      details: { message },
    });
    return { hadError: true };
  }
}

export const githubWikiAction: Action = {
  spec: GITHUB_WIKI_ACTION_SPEC,
  assemble: ({ intent, assembly }) => {
    const state = intent.state(GITHUB_WIKI_ACTION_SPEC.name);
    if (state === OFF) return;
    assembly.bind({
      id: "github-wiki",
      plugin: "action:github-wiki",
      stage: "document",
      state,
      run: runGitHubWiki,
    });
  },
};
