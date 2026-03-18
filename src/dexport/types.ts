import type {
	DestinationRoots,
	ProcessInputOptions,
} from "../dl/types.ts"
import type { RepoContext } from "../repo/context.ts"

export interface DexportOps {
	sync: (
		resolved: RepoContext,
		roots: DestinationRoots,
		options: ProcessInputOptions,
		wikiDestination: string,
	) => Promise<void>
}
