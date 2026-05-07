import { defineWithTypes } from "gunshi";
import { WIKI_ACTION_SPEC } from "../wiki/handler.ts";
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts";
import { requireExtensions, type CommandParams } from "./context.ts";

export default defineWithTypes<CommandParams>()({
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
    const { planner } = requireExtensions(ctx.extensions);
    const result = await planner.run({
      inputs,
      actionOverride: { name: WIKI_ACTION_SPEC.name, state: String(ctx.values.state) },
    });
    if (result.hadError) process.exit(1);
  },
});
