import { plugin } from "gunshi/plugin";
import {
  WIKI_ACTION_FLAG_OPTION,
  WIKI_ACTION_SPEC,
  WIKI_ACTION_STATE_OPTION,
  wikiAction,
} from "./handler.ts";

export const WIKI_ACTION_PLUGIN_ID = "action:wiki" as const;

export const dlWikiActionPlugin = plugin({
  id: WIKI_ACTION_PLUGIN_ID,
  name: "DL Wiki Action",
  setup: (ctx) => {
    ctx.addGlobalOption(WIKI_ACTION_SPEC.name, WIKI_ACTION_FLAG_OPTION);
    ctx.addGlobalOption(`${WIKI_ACTION_SPEC.name}-state`, WIKI_ACTION_STATE_OPTION);
  },
  extension: () => ({
    actions: [wikiAction],
  }),
});
