#!/usr/bin/env node
import { realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { defineWithTypes, cli, type CommandContext } from "gunshi";
import { processCandidates, processVerified, buildMainOptions } from "./run.ts";
import { runLegacyActionsFromFlow } from "../legacy/run.ts";
import { OFF } from "../action/state.ts";
import { dlPlugins } from "../plugin/index.ts";
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts";
import { WATCH_INPUT_PLUGIN_ID } from "../plugin/input-watch.ts";
import { CLIPBOARD_INPUT_PLUGIN_ID } from "../plugin/input-clipboard.ts";
import { requireExtensions, type DlCommandParams, type DlExtensions } from "./context.ts";
import { collectRepos } from "./browse.ts";
import archlistSubcommand from "./archlist.ts";
import archiveSubcommand from "./archive.ts";
import deepwikiSubcommand from "./deepwiki.ts";
import symlinkSubcommand from "./symlink.ts";
import wikiSubcommand from "./wiki.ts";

const dlArgs = {
  noop: {
    type: "boolean",
    default: false,
    description: "Do nothing — exit immediately without resolving or syncing",
  },
  pick: {
    type: "boolean",
    short: "p",
    default: false,
    description: "Interactively browse and select repos from an org to download",
  },
} as const;

type DlArgs = typeof dlArgs;

async function run(ctx: CommandContext<{ args: DlArgs; extensions: DlExtensions }>) {
  try {
    const positional = ctx.extensions[POSITIONAL_INPUT_PLUGIN_ID];
    const watch = ctx.extensions[WATCH_INPUT_PLUGIN_ID];
    const clipboard = ctx.extensions[CLIPBOARD_INPUT_PLUGIN_ID];
    const hasInputs = ctx.positionals.length > 0;

    if (!hasInputs && !watch.active && !clipboard.active && !ctx.values.pick) {
      console.error(
        "usage: rekon dl [--watch] [--clipboard] [--pick] [--org <org>] <repo-url|org/repo> [repo-url|org/repo ...]",
      );
      process.exit(1);
    }

    if (ctx.values.noop) return;

    const ext = requireExtensions(ctx.extensions);
    const options = buildMainOptions(ctx.extensions, ctx.values, ctx.explicit, ctx.tokens);

    if (watch.active && options.archlistState !== OFF) {
      ext.log.warn("sync", "archlist_disabled", { reason: "watch mode feedback loop" });
      options.archlistState = OFF;
    }

    if (ctx.values.pick) {
      const orgInput = hasInputs ? ctx.positionals[0]! : (ctx.values.org as string | undefined);
      if (!orgInput) {
        console.error("--pick requires an org (positional arg or --org)");
        process.exit(1);
      }
      const controller = new AbortController();
      const selected = await collectRepos(orgInput, controller.signal);
      if (selected.length === 0) return;

      const pickInputs = (async function* () {
        for (const url of selected) yield url;
      })();

      const hadError = await runLegacyActionsFromFlow(ctx.extensions, options, pickInputs);
      if (hadError) process.exit(1);
      return;
    }

    const inputs = positional.source(ctx.values.org as string | undefined, ctx.positionals); // gunshi: plugin-registered global

    if (ctx.values.candidates) {
      await processCandidates(ctx.extensions, inputs, options.reportLifecycle);
      return;
    }

    if (options.verified) {
      await processVerified(ctx.extensions, inputs, options.reportLifecycle);
      return;
    }

    const sources: AsyncIterable<string>[] = [inputs];
    if (watch.active) sources.push(watch.source());
    if (clipboard.active) sources.push(clipboard.source());

    const hadError = await runLegacyActionsFromFlow(
      ctx.extensions,
      options,
      mergeConcurrent(sources),
    );
    if (hadError) {
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`sync failed: ${message}`);
    process.exit(1);
  }
}

async function* mergeConcurrent(sources: AsyncIterable<string>[]): AsyncGenerator<string> {
  for (const source of sources) {
    yield* source;
  }
}

const dlCommand = defineWithTypes<DlCommandParams & { args: DlArgs }>()({
  name: "dl",
  description: "Fetch repository checkout and wiki checkout",
  args: dlArgs,
  run,
});

export default dlCommand;

function main() {
  cli(process.argv.slice(2), dlCommand, {
    name: "dl",
    plugins: dlPlugins,
    subCommands: {
      archive: archiveSubcommand,
      archlist: archlistSubcommand,
      deepwiki: deepwikiSubcommand,
      symlink: symlinkSubcommand,
      wiki: wikiSubcommand,
    },
    fallbackToEntry: true,
  });
}

realpath(process.argv[1]).then((mainPath) => {
  if (pathToFileURL(mainPath).href === import.meta.url) main();
});
