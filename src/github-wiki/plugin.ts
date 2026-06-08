import { plugin } from "gunshi/plugin";
import {
  GITHUB_WIKI_ACTION_FLAG_OPTION,
  GITHUB_WIKI_ACTION_SPEC,
  GITHUB_WIKI_ACTION_STATE_OPTION,
  githubWikiAction,
} from "./handler.ts";

export const GITHUB_WIKI_ACTION_PLUGIN_ID = "action:github-wiki" as const;

export const dlGitHubWikiActionPlugin = plugin({
  id: GITHUB_WIKI_ACTION_PLUGIN_ID,
  name: "DL GitHub Wiki Action",
  setup: (ctx) => {
    ctx.addGlobalOption(GITHUB_WIKI_ACTION_SPEC.name, GITHUB_WIKI_ACTION_FLAG_OPTION);
    ctx.addGlobalOption(`${GITHUB_WIKI_ACTION_SPEC.name}-state`, GITHUB_WIKI_ACTION_STATE_OPTION);
  },
  extension: () => ({
    actions: [githubWikiAction],
  }),
});
