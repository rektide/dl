import { plugin } from "gunshi/plugin";
import {
  SYMLINK_ACTION_FLAG_OPTION,
  SYMLINK_ACTION_SPEC,
  SYMLINK_ACTION_STATE_OPTION,
  symlinkAction,
} from "./handler.ts";

export const SYMLINK_ACTION_PLUGIN_ID = "action:symlink" as const;

export const dlSymlinkActionPlugin = plugin({
  id: SYMLINK_ACTION_PLUGIN_ID,
  name: "DL Symlink Action",
  setup: (ctx) => {
    ctx.addGlobalOption(SYMLINK_ACTION_SPEC.name, SYMLINK_ACTION_FLAG_OPTION);
    ctx.addGlobalOption(`${SYMLINK_ACTION_SPEC.name}-state`, SYMLINK_ACTION_STATE_OPTION);
    ctx.addGlobalOption("anycase", {
      type: "boolean",
      default: false,
      description: "Also create symlinks for pure case differences (e.g. Rust→rust)",
    });
  },
  extension: () => ({
    actions: [symlinkAction],
  }),
});
