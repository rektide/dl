import { ENSURE, OFF } from "../action/state.ts";
import type {
  Action,
  ActionResult,
  ActionSpec,
  RepoExecution,
} from "../planner/types.ts";
import { syncSimplify } from "./sync.ts";

const SYMLINK_STATES = [ENSURE, OFF] as const;

export const SYMLINK_ACTION_SPEC: ActionSpec = {
  name: "symlink",
  description: "Symlink creation action",
  role: "effect",
  defaultParticipation: "default",
  suppressesDefaultsWhenExplicit: true,
  defaultState: ENSURE,
  states: SYMLINK_STATES,
  optionKey: "symlinkState",
};

export const SYMLINK_ACTION_FLAG_OPTION = {
  type: "boolean",
  default: false,
  description: "Symlink creation action (bare --symlink uses default state 'ensure')",
} as const;

export const SYMLINK_ACTION_STATE_OPTION = {
  type: "enum",
  choices: SYMLINK_STATES,
  description: "Symlink creation action state (ensure|off)",
} as const;

export async function runSymlink(ctx: RepoExecution): Promise<ActionResult> {
  if (ctx.state === OFF) {
    ctx.report.skipped({ step: "symlink-org", source: "symlink", transition: "off" });
    ctx.report.skipped({ step: "symlink-repo", source: "symlink", transition: "off" });
    return { hadError: false };
  }

  const simplifyReport = await syncSimplify(
    ctx.repo,
    ctx.services.roots,
    ctx.services.options,
    ctx.services.log,
  );

  if (simplifyReport.orgStatus === "skipped") {
    ctx.report.skipped({
      step: "symlink-org",
      source: "symlink",
      transition: simplifyReport.orgStatus,
    });
  } else {
    ctx.report.ok({
      step: "symlink-org",
      source: "symlink -> ensureSymlink",
      transition: simplifyReport.orgStatus,
      details: { org: simplifyReport.org },
    });
  }

  if (simplifyReport.projectStatus === "skipped") {
    ctx.report.skipped({
      step: "symlink-repo",
      source: "symlink",
      transition: simplifyReport.projectStatus,
    });
  } else {
    ctx.report.ok({
      step: "symlink-repo",
      source: "symlink -> ensureSymlink",
      transition: simplifyReport.projectStatus,
      details: { org: simplifyReport.org, project: simplifyReport.project },
    });
  }

  return { hadError: false };
}

export const symlinkAction: Action = {
  spec: SYMLINK_ACTION_SPEC,
  assemble: ({ intent, assembly }) => {
    const state = intent.state(SYMLINK_ACTION_SPEC.name);
    if (state === OFF) return;
    assembly.bind({
      id: "symlink",
      kind: "action",
      plugin: "action:symlink",
      stage: "link",
      state,
      run: runSymlink,
    });
  },
};
