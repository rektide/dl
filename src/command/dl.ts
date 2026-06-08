#!/usr/bin/env node
import { realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { defineWithTypes, cli, type CommandContext } from "gunshi";
import { dlPlugins } from "../plugin/index.ts";
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts";
import { WATCH_INPUT_PLUGIN_ID } from "../plugin/input-watch.ts";
import { CLIPBOARD_INPUT_PLUGIN_ID } from "../plugin/input-clipboard.ts";
import { requireExtensions, type CommandParams, type CommandExtensions } from "./context.ts";
import { collectRepos } from "./browse.ts";
import archlistSubcommand from "./archlist.ts";
import archiveSubcommand from "./archive.ts";
import symlinkSubcommand from "./symlink.ts";
import wikiSubcommand from "./wiki.ts";
import githubWikiSubcommand from "./github-wiki.ts";

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

async function run(ctx: CommandContext<{ args: DlArgs; extensions: CommandExtensions }>) {
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

      const result = await ext.planner.run({
        inputs: pickInputs,
      });
      const hadError = result.hadError;
      if (hadError) process.exit(1);
      return;
    }

    const inputs = positional.source(ctx.values.org as string | undefined, ctx.positionals); // gunshi: plugin-registered global

    const sources: AsyncIterable<string>[] = [inputs];
    if (watch.active) sources.push(watch.source());
    if (clipboard.active) sources.push(clipboard.source());

    const result = await ext.planner.run({
      inputs: mergeConcurrent(sources),
    });

    if (ctx.values.candidates && !result.candidateFound) {
      ext.log.warn("candidates", "no_match", {});
    }
    if (ctx.values.verified && !result.verifiedFound) {
      ext.log.warn("sync", "no_match", {});
    }

    const hadError = result.hadError;
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

const dlCommand = defineWithTypes<CommandParams & { args: DlArgs }>()({
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
      symlink: symlinkSubcommand,
      wiki: wikiSubcommand,
      "github-wiki": githubWikiSubcommand,
    },
    fallbackToEntry: true,
  });
}

realpath(process.argv[1]).then((mainPath) => {
  if (pathToFileURL(mainPath).href === import.meta.url) main();
});
