import { FORCE, OFF, ENSURE } from "../action/state.ts";
import type {
  Action,
  ActionResult,
  ActionSpec,
  RepoExecution,
} from "../planner/types.ts";
import { syncArchlist } from "./sync.ts";

const ARCHLIST_STATES = [FORCE, ENSURE, OFF] as const;

export const ARCHLIST_ACTION_SPEC: ActionSpec = {
  name: "archlist",
  description: "Archlist update action",
  role: "effect",
  defaultParticipation: "default",
  suppressesDefaultsWhenExplicit: true,
  defaultState: FORCE,
  states: ARCHLIST_STATES,
  optionKey: "archlistState",
};

export const ARCHLIST_ACTION_FLAG_OPTION = {
  type: "boolean",
  default: false,
  description: "Archlist update action (bare --archlist uses default state 'force')",
} as const;

export const ARCHLIST_ACTION_STATE_OPTION = {
  type: "enum",
  choices: ARCHLIST_STATES,
  description: "Archlist update action state (force|ensure|off)",
} as const;

async function runArchlist(ctx: RepoExecution): Promise<ActionResult> {
  return syncArchlist(ctx.repo.url.toString(), ctx.state, ctx.report, ctx.services.log);
}

export const archlistAction: Action = {
  spec: ARCHLIST_ACTION_SPEC,
  assemble: ({ intent, assembly }) => {
    const state = intent.state(ARCHLIST_ACTION_SPEC.name);
    if (state === OFF) return;
    assembly.bind({
      id: "archlist",
      kind: "action",
      plugin: "action:archlist",
      stage: "catalog",
      state,
      run: runArchlist,
    });
  },
};
