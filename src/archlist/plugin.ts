import { plugin } from "gunshi/plugin";
import {
  ARCHLIST_ACTION_FLAG_OPTION,
  ARCHLIST_ACTION_SPEC,
  ARCHLIST_ACTION_STATE_OPTION,
  archlistAction,
} from "./handler.ts";

export const ARCHLIST_ACTION_PLUGIN_ID = "action:archlist" as const;

export const dlArchlistActionPlugin = plugin({
  id: ARCHLIST_ACTION_PLUGIN_ID,
  name: "DL Archlist Action",
  setup: (ctx) => {
    ctx.addGlobalOption(ARCHLIST_ACTION_SPEC.name, ARCHLIST_ACTION_FLAG_OPTION);
    ctx.addGlobalOption(`${ARCHLIST_ACTION_SPEC.name}-state`, ARCHLIST_ACTION_STATE_OPTION);
  },
  extension: () => ({
    actions: [archlistAction],
  }),
});
