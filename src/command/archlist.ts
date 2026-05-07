import { defineWithTypes } from "gunshi";
import { ARCHLIST_ACTION_SPEC } from "../archlist/handler.ts";
import { buildSubcommandOptions, runFlowCommand } from "./run.ts";
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts";
import type { DlCommandParams } from "./context.ts";

export default defineWithTypes<DlCommandParams>()({
  name: "archlist",
  description: "Append resolved repository URLs to ~/archlist",
  args: {
    state: {
      type: "enum",
      choices: [...ARCHLIST_ACTION_SPEC.states],
      default: ARCHLIST_ACTION_SPEC.defaultState,
      description: "Archlist state (force|ensure|off)",
    },
  },
  async run(ctx) {
    const positional = ctx.extensions[POSITIONAL_INPUT_PLUGIN_ID];
    const inputs = positional.source(ctx.values.org as string | undefined, ctx.positionals); // gunshi: plugin-registered global
    const options = buildSubcommandOptions(
      ctx.extensions,
      ctx.values,
      ctx.explicit,
      ctx.tokens,
      ARCHLIST_ACTION_SPEC,
      ctx.values.state,
    );
    const result = await runFlowCommand({
      extensions: ctx.extensions,
      options,
      inputs,
      runActions: true,
    });
    if (result.hadError) process.exit(1);
  },
});
