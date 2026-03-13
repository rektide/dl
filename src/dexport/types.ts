import type {
	DestinationRoots,
	ProcessInputOptions,
	RepoContext,
} from "../dl/types.ts"

export interface DexportOps {
	sync: (
		resolved: RepoContext,
		roots: DestinationRoots,
		options: ProcessInputOptions,
		wikiDestination: string,
	) => Promise<void>
}
