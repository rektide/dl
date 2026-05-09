import { ENSURE, OFF } from "../action/state.ts";
import type {
  Action,
  ActionResult,
  ActionSpec,
  RepoExecution,
} from "../planner/types.ts";
import { join } from "node:path";

const DEEPWIKI_STATES = [ENSURE, OFF] as const;

export const DEEPWIKI_ACTION_SPEC: ActionSpec = {
  name: "deepwiki",
  description: "Deepwiki (dexport) sync action",
  role: "effect",
  defaultParticipation: "default",
  suppressesDefaultsWhenExplicit: true,
  defaultState: ENSURE,
  states: DEEPWIKI_STATES,
  optionKey: "deepwikiState",
};

export const DEEPWIKI_ACTION_FLAG_OPTION = {
  type: "boolean",
  default: false,
  description: "Deepwiki sync action (bare --deepwiki uses default state 'ensure')",
} as const;

export const DEEPWIKI_ACTION_STATE_OPTION = {
  type: "enum",
  choices: DEEPWIKI_STATES,
  description: "Deepwiki sync action state (ensure|off)",
} as const;

function deepwikiUrl(repoUrl: URL): URL | null {
  if (repoUrl.host !== "github.com") return null;
  return new URL(`https://deepwiki.com${repoUrl.pathname}`);
}

async function runDeepwiki(ctx: RepoExecution): Promise<ActionResult> {
  if (ctx.state === OFF) {
    ctx.report.skipped({ step: "wiki-dexport", source: "deepwiki", transition: "off" });
    return { hadError: false };
  }

  const pathname = ctx.repo.url.pathname.replace(/^\//, "");
  const wikiDestination = join(ctx.services.roots.wikiRoot, pathname);
  const wikiDeepUrl = deepwikiUrl(ctx.repo.url);
  if (wikiDeepUrl) ctx.facts.set("wiki.deepUrl", wikiDeepUrl);

  const report = await ctx.services.dexportOps.sync({
    wikiDeepUrl,
    roots: ctx.services.roots,
    options: ctx.services.options,
    wikiDestination,
    log: ctx.services.log,
  });

  if (report.status === "failed") {
    ctx.report.failed({
      step: "wiki-dexport",
      source: "deepwiki -> dexportOps.sync",
      transition: report.status,
      details: { plan: report.plan, reason: report.reason, destination: wikiDestination },
    });
    return { hadError: true };
  }

  if (report.status === "skipped") {
    ctx.report.skipped({
      step: "wiki-dexport",
      source: "deepwiki -> dexportOps.sync",
      transition: report.status,
      details: { plan: report.plan, reason: report.reason, destination: wikiDestination },
    });
    return { hadError: false };
  }

  ctx.report.ok({
    step: "wiki-dexport",
    source: "deepwiki -> dexportOps.sync",
    transition: report.status,
    details: { plan: report.plan, reason: report.reason, destination: wikiDestination },
  });
  return { hadError: false };
}

export const deepwikiAction: Action = {
  spec: DEEPWIKI_ACTION_SPEC,
  assemble: ({ intent, assembly }) => {
    const state = intent.state(DEEPWIKI_ACTION_SPEC.name);
    if (state === OFF) return;
    assembly.bind({
      id: "deepwiki",
      kind: "action",
      plugin: "action:deepwiki",
      stage: "document",
      state,
      run: runDeepwiki,
    });
  },
};
