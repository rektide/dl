import { ENSURE, OFF } from "../action/state.ts";
import type {
  Action,
  ActionResult,
  ActionSpec,
  RepoExecution,
} from "../planner/types.ts";
import { join } from "node:path";

const WIKI_STATES = [ENSURE, OFF] as const;

export const WIKI_ACTION_SPEC: ActionSpec = {
  name: "wiki",
  description: "Wiki (dexport) sync action",
  role: "effect",
  defaultParticipation: "default",
  suppressesDefaultsWhenExplicit: true,
  defaultState: ENSURE,
  states: WIKI_STATES,
  optionKey: "wikiState",
};

export const WIKI_ACTION_FLAG_OPTION = {
  type: "boolean",
  default: false,
  description: "Wiki sync action (bare --wiki uses default state 'ensure')",
} as const;

export const WIKI_ACTION_STATE_OPTION = {
  type: "enum",
  choices: WIKI_STATES,
  description: "Wiki sync action state (ensure|off)",
} as const;

function wikiUrl(repoUrl: URL): URL | null {
  if (repoUrl.host !== "github.com") return null;
  return new URL(`https://deepwiki.com${repoUrl.pathname}`);
}

async function runWiki(ctx: RepoExecution): Promise<ActionResult> {
  if (ctx.state === OFF) {
    ctx.report.skipped({ step: "wiki", source: "wiki", event: "off" });
    return { hadError: false };
  }

  const pathname = ctx.repo.url.pathname.replace(/^\//, "");
  const wikiDestination = join(ctx.services.roots.wikiRoot, pathname);
  const resolvedWikiUrl = wikiUrl(ctx.repo.url);
  if (resolvedWikiUrl) ctx.facts.set("wiki.url", resolvedWikiUrl);

  const report = await ctx.services.dexportOps.sync({
    wikiUrl: resolvedWikiUrl,
    roots: ctx.services.roots,
    options: ctx.services.options,
    wikiDestination,
    log: ctx.services.log,
  });

  if (report.status === "failed") {
    ctx.report.failed({
      step: "wiki",
      source: "wiki -> dexportOps.sync",
      event: report.status,
      details: { plan: report.plan, reason: report.reason, destination: wikiDestination },
    });
    return { hadError: true };
  }

  if (report.status === "skipped") {
    ctx.report.skipped({
      step: "wiki",
      source: "wiki -> dexportOps.sync",
      event: report.status,
      details: { plan: report.plan, reason: report.reason, destination: wikiDestination },
    });
    return { hadError: false };
  }

  ctx.report.ok({
    step: "wiki",
    source: "wiki -> dexportOps.sync",
    event: report.status,
    details: { plan: report.plan, reason: report.reason, destination: wikiDestination },
  });
  return { hadError: false };
}

export const wikiAction: Action = {
  spec: WIKI_ACTION_SPEC,
  assemble: ({ intent, assembly }) => {
    const state = intent.state(WIKI_ACTION_SPEC.name);
    if (state === OFF) return;
    assembly.bind({
      id: "wiki",
      plugin: "action:wiki",
      stage: "document",
      state,
      run: runWiki,
    });
  },
};
