import { plugin } from "gunshi/plugin";
import {
  CANDIDATES_VIEW_OPTION,
  CANDIDATES_VIEW_SPEC,
  VERIFIED_VIEW_OPTION,
  VERIFIED_VIEW_SPEC,
  candidatesViewAction,
  verifiedViewAction,
} from "./handler.ts";

export const VIEW_ACTION_PLUGIN_ID = "view" as const;

export const viewActionPlugin = plugin({
  id: VIEW_ACTION_PLUGIN_ID,
  name: "View Actions",
  setup: (ctx) => {
    ctx.addGlobalOption(CANDIDATES_VIEW_SPEC.name, CANDIDATES_VIEW_OPTION);
    ctx.addGlobalOption(VERIFIED_VIEW_SPEC.name, VERIFIED_VIEW_OPTION);
  },
  extension: () => ({
    actions: [candidatesViewAction, verifiedViewAction],
  }),
});
