// pattern: Imperative Shell

/**
 * Transitional legacy runner.
 *
 * This module bridges the new Repo-based flow output into the current
 * action pipeline, which still operates on legacy RepoContext.
 *
 * TODO: remove this bridge once actions become stage-based and consume Repo
 * directly in the main flow pipeline.
 */

import { runPipeline } from "../action/pipeline.ts"
import type { DlContext, DlOptions } from "../action/types.ts"
import type { Repo } from "../flow/types.ts"
import { FLOW_PLUGIN_ID } from "../plugin/flow.ts"
import type { RepoContext } from "../repo/context.ts"
import type { DlExtensions } from "../command/context.ts"
import { resolveDlSetup } from "../command/context.ts"

function toLegacyRepoContext(repo: Repo): RepoContext {
	const url = new URL(repo.url.toString())
	const context: RepoContext = {
		input: repo.input,
		host: repo.host ?? undefined,
		org: repo.org ?? undefined,
		project: repo.project ?? undefined,
		verified: repo.state === "verified",
		source: { provider: repo.producedBy },
		url,
		inputUrl: repo.inputUrl ? new URL(repo.inputUrl.toString()) : undefined,
	}

	// Transitional parity for wiki handler behavior from host providers.
	if (url.host === "github.com" || url.host === "gitlab.com") {
		context.wikiRepoUrl = new URL(`${url.toString()}.wiki.git`)
	}

	return context
}

export async function runLegacyActionsFromFlow(
	extensions: DlExtensions,
	options: DlOptions,
	inputs: AsyncIterable<string>,
): Promise<boolean> {
	const setup = await resolveDlSetup(extensions, options)
	const handlers = setup.actions["dl:handlers"]
	const flow = extensions[FLOW_PLUGIN_ID]
	const actionContext: DlContext = {
		roots: setup.roots,
		options,
		log: setup.log,
	}

	let hadError = false
	flow.config({ verify: true })
	flow.push(inputs)
	flow.on("verified", async (repo) => {
		const resolved = toLegacyRepoContext(repo)
		hadError =
			(await runPipeline(
				resolved,
				actionContext,
				handlers,
				actionContext.options.reportLifecycle,
				actionContext.log,
			)) || hadError
	})

	for await (const _repo of flow.execute()) {
		// consumed via on("verified") hook
	}

	return hadError
}
