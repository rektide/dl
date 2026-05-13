// pattern: Imperative Shell

import type { FlowContext, Repo } from "../flow/types.ts";
import type { Stage } from "../execute/stage.ts";
import type { BoundStageOptions } from "./types.ts";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error === undefined) return "unknown error";
  return String(error);
}

export function createBindingStage(options: BoundStageOptions): Stage<Repo, FlowContext> {
  return async function* runBindingStage(input, flow): AsyncGenerator<Repo> {
    for await (const repo of input) {
      for (const binding of options.bindings) {
        const facts = options.run.factsFor(repo);
        const report = options.services.report.forSubject(repo.url.toString());
        const markBindingError = (error?: unknown): void => {
          options.run.markError(repo, binding.id, error);
          report.failed({
            step: binding.id,
            source: binding.id,
            event: "error",
            details: { message: errorMessage(error) },
          });
        };
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
            hadError: () => options.run.hadErrorFor(repo),
            markError: markBindingError,
            record: (key) => options.run.record(key),
          });
          if (result?.hadError) markBindingError();
        } catch (error) {
          markBindingError(error);
        }
      }
      yield repo;
    }
  };
}
