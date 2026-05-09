// pattern: Functional Core

import { OFF, STAGE, type Action, type Args, type Binding, type StageName } from "./types.ts";

export const ACTION_STAGE_ORDER: ReadonlyArray<StageName> = [
  STAGE.verified,
  STAGE.catalog,
  STAGE.materialize,
  STAGE.document,
  STAGE.link,
  STAGE.report,
];

export type BindingGroup = Readonly<{
  stage: StageName;
  bindings: ReadonlyArray<Binding>;
}>;

export type BindingPlan = Readonly<{
  bindings: ReadonlyArray<Binding>;
  proposedBindings: ReadonlyArray<Binding>;
  verifiedStages: ReadonlyArray<BindingGroup>;
  shouldVerify: boolean;
}>;

type CreateBindingPlanOptions = Readonly<{
  actions: ReadonlyArray<Action>;
  args: Args;
  initialBindings?: ReadonlyArray<Binding>;
}>;

function bindingsForStage(bindings: ReadonlyArray<Binding>, stage: StageName): Array<Binding> {
  return bindings.filter((binding) => binding.stage === stage);
}

function createVerifiedStageGroups(bindings: ReadonlyArray<Binding>): Array<BindingGroup> {
  const groups: Array<BindingGroup> = [];
  for (const stage of ACTION_STAGE_ORDER) {
    const stageBindings = bindingsForStage(bindings, stage);
    if (stageBindings.length === 0) continue;
    groups.push({ stage, bindings: stageBindings });
  }
  return groups;
}

export function createBindingPlan(options: CreateBindingPlanOptions): BindingPlan {
  const bindings: Array<Binding> = [...(options.initialBindings ?? [])];
  const assembly = {
    bind(binding: Binding): void {
      bindings.push(binding);
    },
  };

  for (const action of options.actions) {
    action.assemble({ args: options.args, intent: options.args.intent, assembly });
  }

  const proposedBindings = bindingsForStage(bindings, STAGE.proposed);
  const verifiedStages = createVerifiedStageGroups(bindings);
  const shouldVerify = bindings.some(
    (binding) => binding.stage !== STAGE.proposed && binding.state !== OFF,
  );

  return {
    bindings,
    proposedBindings,
    verifiedStages,
    shouldVerify,
  };
}
