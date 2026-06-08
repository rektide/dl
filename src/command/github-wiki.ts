import { defineWithTypes } from "gunshi";
import { GITHUB_WIKI_ACTION_SPEC } from "../github-wiki/handler.ts";
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts";
import { requireExtensions, type CommandParams } from "./context.ts";

export default defineWithTypes<CommandParams>()({
  name: "github-wiki",
  description: "Clone or update GitHub wiki checkout for repositories",
  args: {
    state: {
      type: "enum",
      choices: [...GITHUB_WIKI_ACTION_SPEC.states],
      default: GITHUB_WIKI_ACTION_SPEC.defaultState,
      description: "GitHub Wiki state (ensure|off)",
    },
  },
  async run(ctx) {
    const positional = ctx.extensions[POSITIONAL_INPUT_PLUGIN_ID];
    const inputs = positional.source(ctx.values.org as string | undefined, ctx.positionals);
    const { planner } = requireExtensions(ctx.extensions);
    const result = await planner.run({
      inputs,
      subcommand: { name: GITHUB_WIKI_ACTION_SPEC.name, state: String(ctx.values.state) },
    });
    if (result.hadError) process.exit(1);
  },
});
