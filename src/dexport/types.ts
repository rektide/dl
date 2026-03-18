import type { DlOptions } from "../dl/types.ts"
import type { RepoContext } from "../repo/context.ts"
import type { LogExtension } from "../plugin/log.ts"

export interface DexportOps {
	sync: (
		resolved: RepoContext,
		roots: { archiveRoot: string; wikiRoot: string },
		options: DlOptions,
		wikiDestination: string,
		log: LogExtension,
	) => Promise<void>
}
