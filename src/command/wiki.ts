import { defineWithTypes } from "gunshi";
import { WIKI_ACTION_SPEC } from "../wiki/handler.ts";
import { buildSubcommandOptions, runFlowCommand } from "./run.ts";
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts";
import type { DlCommandParams } from "./context.ts";

export default defineWithTypes<DlCommandParams>()({
  name: "wiki",
  description: "Clone or update git wiki checkout for repositories",
  args: {
    state: {
      type: "enum",
      choices: [...WIKI_ACTION_SPEC.states],
      default: WIKI_ACTION_SPEC.defaultState,
      description: "Wiki state (ensure|off)",
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
      WIKI_ACTION_SPEC,
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
