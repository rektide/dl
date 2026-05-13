import { OFF } from "../action/state.ts";
import type { Repo } from "../flow/types.ts";
import { STAGE, type Action, type ActionSpec, type RepoExecution } from "../planner/types.ts";

const VIEW_STATES = ["enabled", OFF] as const;

export const CANDIDATES_FOUND_RECORD = "view:candidates:found" as const;
export const VERIFIED_FOUND_RECORD = "view:verified:found" as const;

export const CANDIDATES_VIEW_SPEC: ActionSpec = {
  name: "candidates",
  description: "Print expanded candidate URLs before verification (no network calls)",
  role: "view",
  defaultParticipation: "explicit-only",
  suppressesDefaultsWhenExplicit: true,
  defaultState: "enabled",
  states: VIEW_STATES,
};

export const VERIFIED_VIEW_SPEC: ActionSpec = {
  name: "verified",
  description: "Output verified repo info without syncing",
  role: "view",
  defaultParticipation: "explicit-only",
  suppressesDefaultsWhenExplicit: true,
  defaultState: "enabled",
  states: VIEW_STATES,
};

export const CANDIDATES_VIEW_OPTION = {
  type: "boolean",
  default: false,
  description: CANDIDATES_VIEW_SPEC.description,
} as const;

export const VERIFIED_VIEW_OPTION = {
  type: "boolean",
  default: false,
  description: VERIFIED_VIEW_SPEC.description,
} as const;

function logCandidate(repo: Repo, ctx: RepoExecution): void {
  ctx.services.log.info("candidates", "expanded", {
    input: repo.input,
    url: repo.url.toString(),
    org: repo.org,
    project: repo.project,
    provider: repo.producedBy,
    verified: repo.state === "verified",
  });
}

function logVerified(repo: Repo, ctx: RepoExecution): void {
  ctx.services.log.info("verified", "resolved", {
    input: repo.input,
    url: repo.url.toString(),
    pathname: repo.url.pathname,
    source: {
      producedBy: repo.producedBy,
      verifiedBy: Array.from(repo.verifiedBy),
    },
  });
}

export const candidatesViewAction: Action = {
  spec: CANDIDATES_VIEW_SPEC,
  assemble: ({ intent, assembly }) => {
    if (!intent.enabled(CANDIDATES_VIEW_SPEC.name)) return;
    assembly.bind({
      id: CANDIDATES_VIEW_SPEC.name,
      plugin: "view:candidates",
      stage: STAGE.proposed,
      state: intent.state(CANDIDATES_VIEW_SPEC.name),
      run: async (ctx) => {
        ctx.record(CANDIDATES_FOUND_RECORD);
        logCandidate(ctx.repo, ctx);
      },
    });
  },
};

export const verifiedViewAction: Action = {
  spec: VERIFIED_VIEW_SPEC,
  assemble: ({ intent, assembly }) => {
    if (!intent.enabled(VERIFIED_VIEW_SPEC.name)) return;
    assembly.bind({
      id: VERIFIED_VIEW_SPEC.name,
      plugin: "view:verified",
      stage: STAGE.verified,
      state: intent.state(VERIFIED_VIEW_SPEC.name),
      run: async (ctx) => {
        ctx.record(VERIFIED_FOUND_RECORD);
        logVerified(ctx.repo, ctx);
      },
    });
  },
};
