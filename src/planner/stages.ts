// pattern: Imperative Shell

import type { FlowContext, Repo } from "../flow/types.ts";
import type { Stage } from "../execute/stage.ts";
import type { BoundStageOptions } from "./types.ts";

export function createBindingStage(options: BoundStageOptions): Stage<Repo, FlowContext> {
  return async function* runBindingStage(input, flow): AsyncGenerator<Repo> {
    for await (const repo of input) {
      for (const binding of options.bindings) {
        const facts = options.run.factsFor(repo);
        const report = options.run.reporterFor(repo);
        try {
          const result = await binding.run({
            repo,
            flow,
            binding,
            stage: binding.stage,
            state: binding.state,
            args: options.args,
            services: options.services,
            facts,
            report,
            markError: (error) => options.run.markError(repo, binding.id, error),
          });
          if (result?.hadError) options.run.markError(repo, binding.id);
        } catch (error) {
          options.run.markError(repo, binding.id, error);
        }
      }
      yield repo;
    }
  };
}
