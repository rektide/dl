import { plugin } from "gunshi/plugin";
import {
  ARCHIVE_ACTION_FLAG_OPTION,
  ARCHIVE_ACTION_SPEC,
  ARCHIVE_ACTION_STATE_OPTION,
  archiveAction,
} from "./handler.ts";

export const ARCHIVE_ACTION_PLUGIN_ID = "action:archive" as const;

export const dlArchiveActionPlugin = plugin({
  id: ARCHIVE_ACTION_PLUGIN_ID,
  name: "DL Archive Action",
  setup: (ctx) => {
    ctx.addGlobalOption(ARCHIVE_ACTION_SPEC.name, ARCHIVE_ACTION_FLAG_OPTION);
    ctx.addGlobalOption(`${ARCHIVE_ACTION_SPEC.name}-state`, ARCHIVE_ACTION_STATE_OPTION);
  },
  extension: () => ({
    actions: [archiveAction],
  }),
});
