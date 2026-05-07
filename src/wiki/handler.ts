import { ENSURE, OFF } from "../action/state.ts";
import type {
  ActionCapability,
  ActionExecutionContext,
  ActionResult,
  ActionSpec,
} from "../planner/types.ts";
import { syncGitWiki } from "./sync.ts";
import { join } from "node:path";

const WIKI_STATES = [ENSURE, OFF] as const;

export const WIKI_ACTION_SPEC: ActionSpec = {
  name: "wiki",
  description: "Wiki git checkout action",
  defaultState: ENSURE,
  states: WIKI_STATES,
  optionKey: "wikiState",
};

export const WIKI_ACTION_FLAG_OPTION = {
  type: "boolean",
  default: false,
  description: "Wiki git checkout action (bare --wiki uses default state 'ensure')",
} as const;

export const WIKI_ACTION_STATE_OPTION = {
  type: "enum",
  choices: WIKI_STATES,
  description: "Wiki git checkout action state (ensure|off)",
} as const;

function gitWikiUrl(repoUrl: URL): URL | null {
  if (repoUrl.host !== "github.com" && repoUrl.host !== "gitlab.com") return null;
  return new URL(`${repoUrl.toString()}.wiki.git`);
}

async function runWiki(ctx: ActionExecutionContext): Promise<ActionResult> {
  if (ctx.state === OFF) {
    ctx.report.skipped({ step: "wiki-git", source: "wiki", transition: "off" });
    return { hadError: false };
  }

  const wikiRepoUrl = gitWikiUrl(ctx.repo.url);
  if (!wikiRepoUrl) {
    ctx.report.skipped({
      step: "wiki-git",
      source: "wiki",
      transition: "not-applicable",
      details: { reason: "no wiki repository URL for this host" },
    });
    return { hadError: false };
  }

  ctx.facts.set("wiki.repoUrl", wikiRepoUrl);
  const pathname = ctx.repo.url.pathname.replace(/^\//, "");
  const wikiDestination = join(ctx.services.roots.wikiRoot, pathname);
  ctx.services.log.info("sync", "wiki", { destination: wikiDestination });

  try {
    const report = await syncGitWiki(
      wikiRepoUrl,
      wikiDestination,
      ctx.services.gitOps,
      ctx.services.log,
    );
    if (report.status === "failed") {
      ctx.report.failed({
        step: "wiki-git",
        source: "wiki -> syncGitWiki",
        transition: "failed",
        details: { message: report.message, destination: wikiDestination },
      });
      return { hadError: true };
    }
    ctx.report.ok({
      step: "wiki-git",
      source: "wiki -> syncGitWiki",
      transition: report.status,
      details: { destination: wikiDestination },
    });
    return { hadError: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.report.failed({
      step: "wiki-git",
      source: "wiki",
      transition: "error",
      details: { message },
    });
    return { hadError: true };
  }
}

export const wikiAction: ActionCapability = {
  spec: WIKI_ACTION_SPEC,
  assemble: ({ args, assembly }) => {
    const state = args.actionState(WIKI_ACTION_SPEC);
    if (state === OFF) return;
    assembly.bind({
      id: "wiki",
      kind: "action",
      plugin: "action:wiki",
      stage: "document",
      state,
      run: runWiki,
    });
  },
};
