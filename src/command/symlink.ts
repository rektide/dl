import { defineWithTypes } from "gunshi";
import { SYMLINK_ACTION_SPEC } from "../symlink/handler.ts";
import { buildSubcommandOptions, runFlowCommand } from "./run.ts";
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts";
import type { DlCommandParams } from "./context.ts";

export default defineWithTypes<DlCommandParams>()({
  name: "symlink",
  description: "Create simplified symlinks for org/repo names",
  args: {
    state: {
      type: "enum",
      choices: [...SYMLINK_ACTION_SPEC.states],
      default: SYMLINK_ACTION_SPEC.defaultState,
      description: "Symlink state (ensure|off)",
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
      SYMLINK_ACTION_SPEC,
      ctx.values.state,
    );
    options.anycase = !!ctx.values.anycase;
    const result = await runFlowCommand({
      extensions: ctx.extensions,
      options,
      inputs,
      runActions: true,
    });
    if (result.hadError) process.exit(1);
  },
});
