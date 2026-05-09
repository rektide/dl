import { defineWithTypes } from "gunshi";
import { DEEPWIKI_ACTION_SPEC } from "../deepwiki/handler.ts";
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts";
import { requireExtensions, type CommandParams } from "./context.ts";

export default defineWithTypes<CommandParams>()({
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
    const { planner } = requireExtensions(ctx.extensions);
    const result = await planner.run({
      inputs,
      subcommand: { name: DEEPWIKI_ACTION_SPEC.name, state: String(ctx.values.state) },
    });
    if (result.hadError) process.exit(1);
  },
});
