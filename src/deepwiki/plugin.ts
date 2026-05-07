import { plugin } from "gunshi/plugin";
import {
  DEEPWIKI_ACTION_FLAG_OPTION,
  DEEPWIKI_ACTION_SPEC,
  DEEPWIKI_ACTION_STATE_OPTION,
  deepwikiAction,
} from "./handler.ts";

export const DEEPWIKI_ACTION_PLUGIN_ID = "action:deepwiki" as const;

export const dlDeepwikiActionPlugin = plugin({
  id: DEEPWIKI_ACTION_PLUGIN_ID,
  name: "DL Deepwiki Action",
  setup: (ctx) => {
    ctx.addGlobalOption(DEEPWIKI_ACTION_SPEC.name, DEEPWIKI_ACTION_FLAG_OPTION);
    ctx.addGlobalOption(`${DEEPWIKI_ACTION_SPEC.name}-state`, DEEPWIKI_ACTION_STATE_OPTION);
  },
  extension: () => ({
    actions: [deepwikiAction],
  }),
});
