import { plugin } from "gunshi/plugin"
import {
	resolveDestinationRoots,
	type LinkContext,
} from "../repo/link.ts"
import type { DestinationRoots } from "../dl/types.ts"

export const ROOTS_PLUGIN_ID = "rekon:roots" as const

export interface RootsExtension {
	resolveRoots: () => Promise<DestinationRoots>
}

export function createRootsPlugin() {
	return plugin({
		id: ROOTS_PLUGIN_ID,
		name: "Rekon Roots",
		extension: (ctx): RootsExtension => ({
			resolveRoots: () => resolveDestinationRoots(ctx as LinkContext),
		}),
	})
}
