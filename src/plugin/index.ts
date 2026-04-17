import { c12 } from "gunshi-c12"
import { dlArchlistActionPlugin } from "./action/archlist.ts"
import { dlArchiveActionPlugin } from "./action/archive.ts"
import { dlSymlinkActionPlugin } from "./action/symlink.ts"
import { dlWikiActionPlugin } from "./action/wiki.ts"
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
	dlArchlistActionPlugin,
	dlSymlinkActionPlugin,
	dlActionsPlugin,
]
