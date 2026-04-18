import { c12 } from "gunshi-c12"
import { dlArchlistActionPlugin } from "../archlist/plugin.ts"
import { dlArchiveActionPlugin } from "../archive/plugin.ts"
import { dlDeepwikiActionPlugin } from "../deepwiki/plugin.ts"
import { dlSymlinkActionPlugin } from "../symlink/plugin.ts"
import { dlWikiActionPlugin } from "../wiki/plugin.ts"
import { dlActionsPlugin } from "./dl-actions.ts"
import { dexportPlugin } from "./dexport.ts"
import { gitPlugin } from "./git.ts"
import { logPlugin } from "./log.ts"
import { repoPlugin } from "./repo.ts"
import { rootsPlugin } from "./roots.ts"

export const dlPlugins = [
	c12({ name: "rekon" }),
	logPlugin,
	rootsPlugin,
	repoPlugin,
	gitPlugin,
	dexportPlugin,
	dlArchiveActionPlugin,
	dlWikiActionPlugin,
	dlDeepwikiActionPlugin,
	dlArchlistActionPlugin,
	dlSymlinkActionPlugin,
	dlActionsPlugin,
]
