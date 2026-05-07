import { defineWithTypes } from "gunshi";
import { DEEPWIKI_ACTION_SPEC } from "../deepwiki/handler.ts";
import { buildSubcommandOptions, runFlowCommand } from "./run.ts";
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts";
import type { DlCommandParams } from "./context.ts";

export default defineWithTypes<DlCommandParams>()({
  name: "deepwiki",
  description: "Sync deepwiki (dexport) content for repositories",
  args: {
    state: {
      type: "enum",
      choices: [...DEEPWIKI_ACTION_SPEC.states],
      default: DEEPWIKI_ACTION_SPEC.defaultState,
      description: "Deepwiki state (ensure|off)",
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
      DEEPWIKI_ACTION_SPEC,
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
