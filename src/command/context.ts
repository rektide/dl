import { DEXPORT_PLUGIN_ID, type DexportExtension } from "../plugin/dexport.ts";
import { GIT_PLUGIN_ID, type GitExtension } from "../plugin/git.ts";
import {
  CLIPBOARD_INPUT_PLUGIN_ID,
  type ClipboardInputExtension,
} from "../plugin/input-clipboard.ts";
import {
  POSITIONAL_INPUT_PLUGIN_ID,
  type PositionalInputExtension,
} from "../plugin/input-positional.ts";
import { WATCH_INPUT_PLUGIN_ID, type WatchInputExtension } from "../plugin/input-watch.ts";
import { LOG_PLUGIN_ID, type LogExtension } from "../plugin/log.ts";
import { FLOW_PLUGIN_ID, type FlowExtension } from "../plugin/flow.ts";
import { ROOTS_PLUGIN_ID, type RootsExtension } from "../plugin/roots.ts";
import { PLANNER_PLUGIN_ID } from "../planner/plugin.ts";
import type { PlannerExtension } from "../planner/types.ts";

export interface CommandExtensions extends Record<string, unknown> {
  [PLANNER_PLUGIN_ID]: PlannerExtension;
  [ROOTS_PLUGIN_ID]: RootsExtension;
  [FLOW_PLUGIN_ID]: FlowExtension;
  [POSITIONAL_INPUT_PLUGIN_ID]: PositionalInputExtension;
  [WATCH_INPUT_PLUGIN_ID]: WatchInputExtension;
  [CLIPBOARD_INPUT_PLUGIN_ID]: ClipboardInputExtension;
  [GIT_PLUGIN_ID]: GitExtension;
  [DEXPORT_PLUGIN_ID]: DexportExtension;
  [LOG_PLUGIN_ID]: LogExtension;
}

export type CommandParams = { extensions: CommandExtensions };

export function requireExtensions(extensions: CommandExtensions) {
  const planner = extensions[PLANNER_PLUGIN_ID];
  const log = extensions[LOG_PLUGIN_ID];
  const roots = extensions[ROOTS_PLUGIN_ID];
  if (!planner) throw new Error("planner plugin extension is not available");
  if (!log) throw new Error("dl: log plugin extension is not available");
  if (!roots) throw new Error("dl: roots plugin extension is not available");
  return { planner, log, roots };
}
