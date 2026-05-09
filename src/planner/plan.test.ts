import { describe, expect, test } from "vitest";
import { createArgs } from "./args.ts";
import { createBindingPlan } from "./plan.ts";
import type { Action, Binding } from "./types.ts";

const viewAction: Action = {
  spec: {
    name: "candidates",
    description: "Candidate repo view",
    role: "view",
    defaultParticipation: "explicit-only",
    suppressesDefaultsWhenExplicit: true,
    defaultState: "enabled",
    states: ["enabled", "off"],
  },
  assemble: ({ intent, assembly }) => {
    if (!intent.enabled("candidates")) return;
    assembly.bind({
      id: "candidates",
      kind: "view",
      plugin: "view:candidates",
      stage: "proposed",
      state: intent.state("candidates"),
      run: async () => {},
    });
  },
};

const effectAction: Action = {
  spec: {
    name: "archive",
    description: "Archive checkout action",
    role: "effect",
    defaultParticipation: "default",
    suppressesDefaultsWhenExplicit: true,
    defaultState: "ensure",
    states: ["ensure", "off"],
  },
  assemble: ({ intent, assembly }) => {
    if (!intent.enabled("archive")) return;
    assembly.bind({
      id: "archive",
      kind: "action",
      plugin: "action:archive",
      stage: "materialize",
      state: intent.state("archive"),
      run: async () => {},
    });
  },
};

describe("createBindingPlan", () => {
  test("assembles selected actions without hardcoding action ids", () => {
    const actions = [viewAction, effectAction];
    const args = createArgs({
      specs: actions.map((action) => action.spec),
      values: { candidates: true },
      explicit: { candidates: true },
      tokens: [],
    });

    const plan = createBindingPlan({ actions, args });

    expect(plan.bindings.map((binding) => binding.id)).toEqual(["candidates"]);
    expect(plan.shouldVerify).toBe(false);
  });

  test("groups non-proposed bindings in lifecycle order", () => {
    const bindings: Array<Binding> = [
      {
        id: "link",
        kind: "action",
        plugin: "test",
        stage: "link",
        state: "enabled",
        run: async () => {},
      },
      {
        id: "catalog",
        kind: "action",
        plugin: "test",
        stage: "catalog",
        state: "enabled",
        run: async () => {},
      },
    ];

    const plan = createBindingPlan({ actions: [], args: {} as never, initialBindings: bindings });

    expect(plan.verifiedStages.map((stage) => stage.stage)).toEqual(["catalog", "link"]);
    expect(plan.shouldVerify).toBe(true);
  });
});
