import { syncDexportWiki } from "./sync.ts"
import type { DexportOps } from "./types.ts"

export const defaultDexportOps: DexportOps = {
	sync: syncDexportWiki,
}
