// pattern: Imperative Shell

import { CANDIDATES_FOUND_RECORD, VERIFIED_FOUND_RECORD } from "../view/handler.ts";
import type { FlowExtension } from "../plugin/flow.ts";
import type { LogExtension } from "../plugin/log.ts";
import { createActionRunState } from "./run-state.ts";
import { createBindingStage } from "./stages.ts";
import type { Args, PlannerRunResult, Services } from "./types.ts";
import type { BindingGroup, BindingPlan } from "./plan.ts";

type ExecuteBindingPlanOptions = Readonly<{
  pluginId: string;
  bindingPlan: BindingPlan;
  args: Args;
  services: Services;
  flow: FlowExtension;
  log: LogExtension;
  inputs: AsyncIterable<string>;
}>;

function attachBindingGroups(options: {
  readonly groups: ReadonlyArray<BindingGroup>;
  readonly plan: ReturnType<FlowExtension["plan"]>;
  readonly run: ReturnType<typeof createActionRunState>;
  readonly services: Services;
  readonly args: Args;
}): void {
  for (const group of options.groups) {
    options.plan.verified(
      createBindingStage({
        bindings: group.bindings,
        run: options.run,
        services: options.services,
        args: options.args,
      }),
    );
  }
}

export async function executeBindingPlan(
  options: ExecuteBindingPlanOptions,
): Promise<PlannerRunResult> {
  const run = createActionRunState();
  const plan = options.flow.plan().singleton().config({ verify: options.bindingPlan.shouldVerify });

  if (options.bindingPlan.proposedBindings.length > 0) {
    plan.proposed(
      createBindingStage({
        bindings: options.bindingPlan.proposedBindings,
        run,
        services: options.services,
        args: options.args,
      }),
    );
  }

  attachBindingGroups({
    groups: options.bindingPlan.verifiedStages,
    plan,
    run,
    services: options.services,
    args: options.args,
  });

  plan.push(options.inputs);
  for await (const _repo of plan.execute()) {
  }

  return {
    hadError: run.hadError(),
    candidateFound: run.recorded(CANDIDATES_FOUND_RECORD),
    verifiedFound: run.recorded(VERIFIED_FOUND_RECORD),
    bindings: options.bindingPlan.bindings,
  };
}
