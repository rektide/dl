import { c12 } from "gunshi-c12";
import { dlArchlistActionPlugin } from "../archlist/plugin.ts";
import { dlArchiveActionPlugin } from "../archive/plugin.ts";
import { dlSymlinkActionPlugin } from "../symlink/plugin.ts";
import { dlWikiActionPlugin } from "../wiki/plugin.ts";
import { dlGitHubWikiActionPlugin } from "../github-wiki/plugin.ts";
import { plannerPlugin } from "../planner/plugin.ts";
import { dexportPlugin } from "./dexport.ts";
import { gitPlugin } from "./git.ts";
import { flowPlugin } from "./flow.ts";
import { clipboardInputPlugin } from "./input-clipboard.ts";
import { positionalInputPlugin } from "./input-positional.ts";
import { watchInputPlugin } from "./input-watch.ts";
import { logPlugin } from "./log.ts";
import { reportPlugin } from "../report/plugin.ts";
import { rootsPlugin } from "./roots.ts";
import { viewActionPlugin } from "../view/plugin.ts";

export const dlPlugins = [
  c12({ name: "rekon" }),
  logPlugin,
  reportPlugin,
  rootsPlugin,
  flowPlugin,
  positionalInputPlugin,
  watchInputPlugin,
  clipboardInputPlugin,
  gitPlugin,
  dexportPlugin,
  viewActionPlugin,
  dlArchiveActionPlugin,
  dlGitHubWikiActionPlugin,
  dlWikiActionPlugin,
  dlArchlistActionPlugin,
  dlSymlinkActionPlugin,
  plannerPlugin,
];
