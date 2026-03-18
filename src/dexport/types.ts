import type {
	DestinationRoots,
	ProcessInputOptions,
} from "../dl/types.ts"
import type { RepoContext } from "../repo/context.ts"
import type { LogExtension } from "../plugin/log.ts"

export interface DexportOps {
	sync: (
		resolved: RepoContext,
		roots: DestinationRoots,
		options: ProcessInputOptions,
		wikiDestination: string,
		log: LogExtension,
	) => Promise<void>
}
