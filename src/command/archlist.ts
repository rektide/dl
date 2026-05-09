import { defineWithTypes } from "gunshi";
import { ARCHLIST_ACTION_SPEC } from "../archlist/handler.ts";
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts";
import { requireExtensions, type CommandParams } from "./context.ts";

export default defineWithTypes<CommandParams>()({
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
    const { planner } = requireExtensions(ctx.extensions);
    const result = await planner.run({
      inputs,
      subcommand: { name: ARCHLIST_ACTION_SPEC.name, state: String(ctx.values.state) },
    });
    if (result.hadError) process.exit(1);
  },
});
