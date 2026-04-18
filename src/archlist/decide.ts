import { OFF } from "../action/state.ts"
import type { StepState } from "../action/state.ts"

export type ArchlistDecision =
	| { action: "append" }
	| { action: "already_present" }
	| { action: "skip" }

export function decideArchlist(
	archlistState: StepState,
	url: string,
	fileContent: string | null,
): ArchlistDecision {
	if (archlistState === OFF) return { action: "skip" }

	if (archlistState === "ensure") {
		if (fileContent !== null) {
			const lines = fileContent.split("\n")
			if (lines.includes(url)) {
				return { action: "already_present" }
			}
		}
	}

	return { action: "append" }
}
