import { FORCE, OFF, ENSURE } from "../action/state.ts";
import type {
  ActionCapability,
  ActionExecutionContext,
  ActionResult,
  ActionSpec,
} from "../planner/types.ts";
import { syncArchlist } from "./sync.ts";

const ARCHLIST_STATES = [FORCE, ENSURE, OFF] as const;

export const ARCHLIST_ACTION_SPEC: ActionSpec = {
  name: "archlist",
  description: "Archlist update action",
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

async function runArchlist(ctx: ActionExecutionContext): Promise<ActionResult> {
  return syncArchlist(ctx.repo.url.toString(), ctx.state, ctx.report, ctx.services.log);
}

export const archlistAction: ActionCapability = {
  spec: ARCHLIST_ACTION_SPEC,
  assemble: ({ args, assembly }) => {
    const state = args.actionState(ARCHLIST_ACTION_SPEC);
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
