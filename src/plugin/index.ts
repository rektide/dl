import { c12 } from "gunshi-c12";
import { dlArchlistActionPlugin } from "../archlist/plugin.ts";
import { dlArchiveActionPlugin } from "../archive/plugin.ts";
import { dlDeepwikiActionPlugin } from "../deepwiki/plugin.ts";
import { dlSymlinkActionPlugin } from "../symlink/plugin.ts";
import { dlWikiActionPlugin } from "../wiki/plugin.ts";
import { plannerPlugin } from "../planner/plugin.ts";
import { dexportPlugin } from "./dexport.ts";
import { gitPlugin } from "./git.ts";
import { flowPlugin } from "./flow.ts";
import { clipboardInputPlugin } from "./input-clipboard.ts";
import { positionalInputPlugin } from "./input-positional.ts";
import { watchInputPlugin } from "./input-watch.ts";
import { logPlugin } from "./log.ts";
import { rootsPlugin } from "./roots.ts";

export const dlPlugins = [
  c12({ name: "rekon" }),
  logPlugin,
  rootsPlugin,
  flowPlugin,
  positionalInputPlugin,
  watchInputPlugin,
  clipboardInputPlugin,
  gitPlugin,
  dexportPlugin,
  dlArchiveActionPlugin,
  dlWikiActionPlugin,
  dlDeepwikiActionPlugin,
  dlArchlistActionPlugin,
  dlSymlinkActionPlugin,
  plannerPlugin,
];
