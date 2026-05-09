import { defineWithTypes } from "gunshi";
import { ARCHIVE_ACTION_SPEC } from "../archive/handler.ts";
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts";
import { requireExtensions, type CommandParams } from "./context.ts";

export default defineWithTypes<CommandParams>()({
  name: "archive",
  description: "Clone or update archive checkout for repositories",
  args: {
    state: {
      type: "enum",
      choices: [...ARCHIVE_ACTION_SPEC.states],
      default: ARCHIVE_ACTION_SPEC.defaultState,
      description: "Archive state (ensure|off)",
    },
  },
  async run(ctx) {
    const positional = ctx.extensions[POSITIONAL_INPUT_PLUGIN_ID];
    const inputs = positional.source(ctx.values.org as string | undefined, ctx.positionals); // gunshi: plugin-registered global
    const { planner } = requireExtensions(ctx.extensions);
    const result = await planner.run({
      inputs,
      subcommand: { name: ARCHIVE_ACTION_SPEC.name, state: String(ctx.values.state) },
    });
    if (result.hadError) process.exit(1);
  },
});
