import { plugin } from "gunshi/plugin";
import { defaultGitOps } from "../git/default.ts";
import type { GitOps } from "../git/types.ts";

export const GIT_PLUGIN_ID = "git" as const;

export interface GitExtension extends GitOps {}

export const gitPlugin = plugin({
  id: GIT_PLUGIN_ID,
  name: "Git",
  extension: (): GitExtension => defaultGitOps,
});
