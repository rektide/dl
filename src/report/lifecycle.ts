// pattern: Imperative Shell

import type { LifecycleRecord } from "../action/lifecycle.ts";
import type { Repo } from "../flow/types.ts";
import { FLOW_PLUGIN_ID, type FlowExtension, type FlowHandoff } from "../plugin/flow.ts";
import { OFF, STAGE, type Action } from "../planner/types.ts";

export function flowLifecycleRecords(
  repo: Repo,
  handoffs: ReadonlyArray<FlowHandoff>,
): Array<LifecycleRecord> {
  return handoffs
    .filter((handoff) => handoff.toInput === repo.input)
    .map((handoff) => ({
      step: "flow",
      source: `${handoff.fromProvider} -> flow.push`,
      status: "ok",
      transition: "redirect-handoff",
      details: {
        fromInput: handoff.fromInput,
        fromUrl: handoff.fromUrl,
        toInput: handoff.toInput,
        toHost: handoff.toHost,
      },
    }));
}

export const lifecycleReportAction: Action = {
  spec: {
    name: "report-lifecycle",
    description: "Emit structured lifecycle summary per resolved repository",
    role: "report",
    defaultParticipation: "explicit-only",
    suppressesDefaultsWhenExplicit: false,
    defaultState: "enabled",
    states: ["enabled", OFF],
  },
  assemble: ({ intent, assembly }) => {
    if (!intent.enabled("report-lifecycle")) return;
    assembly.bind({
      id: "report-lifecycle:flow",
      plugin: "report:lifecycle",
      stage: STAGE.verified,
      state: intent.state("report-lifecycle"),
      run: async (ctx) => {
        const flowExtension = ctx.flow.plugins[FLOW_PLUGIN_ID] as FlowExtension | undefined;
        const handoffs = flowExtension?.snapshot().handoffs ?? [];
        for (const record of flowLifecycleRecords(ctx.repo, handoffs)) {
          ctx.report.ok({
            step: record.step,
            source: record.source,
            event: record.transition,
            details: record.details,
          });
        }
      },
    });
    assembly.bind({
      id: "report-lifecycle:summary",
      plugin: "report:lifecycle",
      stage: STAGE.report,
      state: intent.state("report-lifecycle"),
      run: async (ctx) => {
        ctx.services.report.writeSummary(ctx.report.summary(ctx.hadError()));
      },
    });
  },
};
