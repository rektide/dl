import { ENSURE, OFF } from "../action/state.ts";
import type {
  Action,
  ActionResult,
  ActionSpec,
  RepoExecution,
} from "../planner/types.ts";
import { syncArchive } from "./sync.ts";

const ARCHIVE_STATES = [ENSURE, OFF] as const;

export const ARCHIVE_ACTION_SPEC: ActionSpec = {
  name: "archive",
  description: "Archive checkout action",
  role: "effect",
  defaultParticipation: "default",
  suppressesDefaultsWhenExplicit: true,
  defaultState: ENSURE,
  states: ARCHIVE_STATES,
  optionKey: "archiveState",
};

export const ARCHIVE_ACTION_FLAG_OPTION = {
  type: "boolean",
  default: false,
  description: "Archive checkout action (bare --archive uses default state 'ensure')",
} as const;

export const ARCHIVE_ACTION_STATE_OPTION = {
  type: "enum",
  choices: ARCHIVE_STATES,
  description: "Archive checkout action state (ensure|off)",
} as const;

async function runArchive(ctx: RepoExecution): Promise<ActionResult> {
  if (ctx.state === OFF) {
    ctx.report.skipped({ step: "archive", source: "archive", event: "off" });
    ctx.report.skipped({ step: "archive-jj", source: "archive", event: "off" });
    return { hadError: false };
  }

  try {
    const report = await syncArchive(
      ctx.repo,
      ctx.services.roots,
      ctx.services.log,
      ctx.services.gitOps,
    );
    ctx.facts.set("archive.destination", report.destination);
    ctx.report.ok({
      step: "archive",
      source: "archive -> syncArchive",
      event: report.archiveStatus,
      details: { destination: report.destination },
    });
    ctx.report.ok({
      step: "archive-jj",
      source: "archive -> ensureJjInitialized",
      event: report.jjStatus,
      details: { destination: report.destination },
    });
    return { hadError: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.report.failed({
      step: "archive",
      source: "archive",
      event: "error",
      details: { message },
    });
    ctx.report.failed({
      step: "archive-jj",
      source: "archive",
      event: "blocked",
      details: { message: "archive sync failed before jj initialization" },
    });
    return { hadError: true };
  }
}

export const archiveAction: Action = {
  spec: ARCHIVE_ACTION_SPEC,
  assemble: ({ intent, assembly }) => {
    const state = intent.state(ARCHIVE_ACTION_SPEC.name);
    if (state === OFF) return;
    assembly.bind({
      id: "archive",
      plugin: "action:archive",
      stage: "materialize",
      state,
      run: runArchive,
    });
  },
};
