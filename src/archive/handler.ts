import { ENSURE, OFF } from "../action/state.ts";
import type {
  ActionCapability,
  ActionExecutionContext,
  ActionResult,
  ActionSpec,
} from "../planner/types.ts";
import { syncArchive } from "./sync.ts";

const ARCHIVE_STATES = [ENSURE, OFF] as const;

export const ARCHIVE_ACTION_SPEC: ActionSpec = {
  name: "archive",
  description: "Archive checkout action",
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

async function runArchive(ctx: ActionExecutionContext): Promise<ActionResult> {
  if (ctx.state === OFF) {
    ctx.report.skipped({ step: "archive", source: "archive", transition: "off" });
    ctx.report.skipped({ step: "archive-jj", source: "archive", transition: "off" });
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
      transition: report.archiveStatus,
      details: { destination: report.destination },
    });
    ctx.report.ok({
      step: "archive-jj",
      source: "archive -> ensureJjInitialized",
      transition: report.jjStatus,
      details: { destination: report.destination },
    });
    return { hadError: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.report.failed({
      step: "archive",
      source: "archive",
      transition: "error",
      details: { message },
    });
    ctx.report.failed({
      step: "archive-jj",
      source: "archive",
      transition: "blocked",
      details: { message: "archive sync failed before jj initialization" },
    });
    return { hadError: true };
  }
}

export const archiveAction: ActionCapability = {
  spec: ARCHIVE_ACTION_SPEC,
  assemble: ({ args, assembly }) => {
    const state = args.actionState(ARCHIVE_ACTION_SPEC);
    if (state === OFF) return;
    assembly.bind({
      id: "archive",
      kind: "action",
      plugin: "action:archive",
      stage: "materialize",
      state,
      run: runArchive,
    });
  },
};
