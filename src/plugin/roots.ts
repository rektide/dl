import { homedir } from "node:os";
import { join } from "node:path";
import { plugin } from "gunshi/plugin";

export const ROOTS_PLUGIN_ID = "roots" as const;

interface DlDirectoryConfig {
  ARCHIVE_DIR?: unknown;
  WIKI_DIR?: unknown;
}

interface C12ConfigLoader {
  loadConfig: () => Promise<{ config?: DlDirectoryConfig }>;
}

export interface RootsExtension {
  resolveRoots: () => Promise<{ archiveRoot: string; wikiRoot: string }>;
}

function configuredDirectory(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function resolveDestinationRoots(ctx?: {
  extensions?: { c12?: C12ConfigLoader };
}): Promise<{ archiveRoot: string; wikiRoot: string }> {
  const defaultArchiveRoot = join(homedir(), "archive");
  const defaultWikiRoot = join(homedir(), "github-wiki");

  const envArchiveRoot = configuredDirectory(process.env.ARCHIVE_DIR);
  const envWikiRoot = configuredDirectory(process.env.WIKI_DIR);
  const defaults = {
    archiveRoot: envArchiveRoot ?? defaultArchiveRoot,
    wikiRoot: envWikiRoot ?? defaultWikiRoot,
  };

  const configLoader = ctx?.extensions?.c12;
  if (!configLoader) {
    return defaults;
  }

  const loaded = await configLoader.loadConfig();
  const configArchiveRoot = configuredDirectory(loaded.config?.ARCHIVE_DIR);
  const configWikiRoot = configuredDirectory(loaded.config?.WIKI_DIR);

  return {
    archiveRoot: configArchiveRoot ?? defaults.archiveRoot,
    wikiRoot: configWikiRoot ?? defaults.wikiRoot,
  };
}

export const rootsPlugin = plugin({
  id: ROOTS_PLUGIN_ID,
  name: "Roots",
  extension: (ctx): RootsExtension => ({
    resolveRoots: () => resolveDestinationRoots(ctx),
  }),
});
