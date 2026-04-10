import { c12 } from "gunshi-c12"
import { createDexportPlugin } from "./dexport.ts"
import { createGitPlugin } from "./git.ts"
import { createLogPlugin } from "./log.ts"
import { createRepoPlugin } from "./repo.ts"
import { createRootsPlugin } from "./roots.ts"

export function createDlPlugins() {
	return [
		c12({ name: "rekon" }),
		createLogPlugin(),
		createRootsPlugin(),
		createRepoPlugin(),
		createGitPlugin(),
		createDexportPlugin(),
	]
}
