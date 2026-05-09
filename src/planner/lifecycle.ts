// pattern: Imperative Shell

import type { Repo } from "../flow/types.ts";
import type { FlowHandoff } from "../plugin/flow.ts";
import type { LifecycleRecord } from "../action/lifecycle.ts";
import type { LogExtension } from "../plugin/log.ts";
import type { ActionRunState } from "./types.ts";
import { STAGE, type Binding } from "./types.ts";

export function flowLifecycleRecords(
  repo: Repo,
  handoffs: ReadonlyArray<FlowHandoff>,
): Array<LifecycleRecord> {
  return handoffs
    .filter((handoff) => handoff.toInput === repo.input)
    .map((handoff) => ({
      step: "flow" as const,
      source: `${handoff.fromProvider} -> flow.push`,
      status: "ok" as const,
      transition: "redirect-handoff",
      details: {
        fromInput: handoff.fromInput,
        fromUrl: handoff.fromUrl,
        toInput: handoff.toInput,
        toHost: handoff.toHost,
      },
    }));
}

type CreateLifecycleBindingsOptions = Readonly<{
  pluginId: string;
  shouldVerify: boolean;
  reportLifecycle: boolean;
  run: ActionRunState;
  log: LogExtension;
}>;

export function createLifecycleBindings(options: CreateLifecycleBindingsOptions): Array<Binding> {
  const bindings: Array<Binding> = [];

  if (!options.reportLifecycle || !options.shouldVerify) return bindings;

  bindings.push({
    id: "flow:lifecycle",
    kind: "view",
    plugin: options.pluginId,
    stage: STAGE.verified,
    state: "enabled",
    run: async (ctx) => {
      const { FLOW_PLUGIN_ID } = await import("../plugin/flow.ts");
      const flowExtension = ctx.flow.plugins[FLOW_PLUGIN_ID] as
        | import("../plugin/flow.ts").FlowExtension
        | undefined;
      options.run.reporterFor(
        ctx.repo,
        flowLifecycleRecords(ctx.repo, flowExtension?.snapshot().handoffs ?? []),
      );
    },
  });

  bindings.push({
    id: "lifecycle:report",
    kind: "view",
    plugin: options.pluginId,
    stage: STAGE.report,
    state: "enabled",
    run: async (ctx) => {
      options.log.info("sync", "lifecycle_report", ctx.report.summary(options.run.hadErrorFor(ctx.repo)));
    },
  });

  return bindings;
}
