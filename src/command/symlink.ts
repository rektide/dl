import { defineWithTypes } from "gunshi";
import { SYMLINK_ACTION_SPEC } from "../symlink/handler.ts";
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts";
import { requireExtensions, type CommandParams } from "./context.ts";

export default defineWithTypes<CommandParams>()({
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
    const { planner } = requireExtensions(ctx.extensions);
    const result = await planner.run({
      inputs,
      subcommand: { name: SYMLINK_ACTION_SPEC.name, state: String(ctx.values.state) },
    });
    if (result.hadError) process.exit(1);
  },
});
