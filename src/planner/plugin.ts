// pattern: Imperative Shell

import { plugin } from "gunshi/plugin";
import type { Repo } from "../flow/types.ts";
import { FLOW_PLUGIN_ID, type FlowExtension, type FlowHandoff } from "../plugin/flow.ts";
import { DEXPORT_PLUGIN_ID, type DexportExtension } from "../plugin/dexport.ts";
import { GIT_PLUGIN_ID, type GitExtension } from "../plugin/git.ts";
import { LOG_PLUGIN_ID, type LogExtension } from "../plugin/log.ts";
import { ROOTS_PLUGIN_ID, type RootsExtension } from "../plugin/roots.ts";
import { createArgs } from "./args.ts";
import { createActionRunState } from "./run-state.ts";
import { createBindingStage } from "./stages.ts";
import {
  OFF,
  STAGE,
  type ActionCapability,
  type ActionPluginExtension,
  type Binding,
  type PlannerExtension,
  type RunOptions,
  type Services,
  type StageName,
} from "./types.ts";

export const PLANNER_PLUGIN_ID = "planner" as const;

type PlannerPluginExtensions = Record<string, unknown> & {
  [FLOW_PLUGIN_ID]: FlowExtension;
  [ROOTS_PLUGIN_ID]: RootsExtension;
  [LOG_PLUGIN_ID]: LogExtension;
  [GIT_PLUGIN_ID]: GitExtension;
  [DEXPORT_PLUGIN_ID]: DexportExtension;
};

type CoreContext = Readonly<{
  values?: Record<string, unknown>;
  explicit?: Record<string, boolean | undefined>;
  tokens?: ReadonlyArray<{ kind?: string; name?: string; value?: string; inlineValue?: boolean }>;
  extensions: PlannerPluginExtensions;
}>;

const ACTION_STAGE_ORDER: ReadonlyArray<StageName> = [
  STAGE.verified,
  STAGE.catalog,
  STAGE.materialize,
  STAGE.document,
  STAGE.link,
  STAGE.report,
];

function isActionPluginExtension(value: unknown): value is ActionPluginExtension {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { actions?: unknown };
  return Array.isArray(candidate.actions);
}

function collectActionCapabilities(extensions: Record<string, unknown>): Array<ActionCapability> {
  const capabilities: Array<ActionCapability> = [];
  for (const extension of Object.values(extensions)) {
    if (!isActionPluginExtension(extension)) continue;
    capabilities.push(...extension.actions);
  }
  return capabilities;
}

function runOptionsFromValues(values: Readonly<Record<string, unknown>>): RunOptions {
  return {
    consumeDexportOutput: values["consume-dexport-output"] === true,
    noLogCache: values["no-log-cache"] === true,
    reportLifecycle: values["report-lifecycle"] === true,
    anycase: values.anycase === true,
    dryRun: values["dry-run"] === true,
  };
}

function logCandidate(repo: Repo, log: LogExtension): void {
  log.info("candidates", "expanded", {
    input: repo.input,
    url: repo.url.toString(),
    org: repo.org,
    project: repo.project,
    provider: repo.producedBy,
    verified: repo.state === "verified",
  });
}

function logVerified(repo: Repo, log: LogExtension): void {
  log.info("verified", "resolved", {
    input: repo.input,
    url: repo.url.toString(),
    pathname: repo.url.pathname,
    source: {
      producedBy: repo.producedBy,
      verifiedBy: Array.from(repo.verifiedBy),
    },
  });
}

function flowLifecycleRecords(
  repo: Repo,
  handoffs: ReadonlyArray<FlowHandoff>,
): Array<import("../action/lifecycle.ts").LifecycleRecord> {
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

function bindingsForStage(bindings: ReadonlyArray<Binding>, stage: StageName): Array<Binding> {
  return bindings.filter((binding) => binding.stage === stage);
}

export const plannerPlugin = plugin({
  id: PLANNER_PLUGIN_ID,
  name: "Planner",
  extension: (core: CoreContext): PlannerExtension => ({
    async run(options) {
      const values = core.values ?? {};
      const explicit = core.explicit ?? {};
      const tokens = core.tokens ?? [];
      const flow = core.extensions[FLOW_PLUGIN_ID];
      const log = core.extensions[LOG_PLUGIN_ID];
      const capabilities = collectActionCapabilities(core.extensions);
      const specs = capabilities.map((capability) => capability.spec);
      const args = createArgs({
        specs,
        values,
        explicit,
        tokens,
        actionOverride: options.actionOverride,
      });
      const bindings: Array<Binding> = [];
      let candidateFound = false;
      let verifiedFound = false;

      const assembly = {
        bind(binding: Binding): void {
          bindings.push(binding);
        },
      };

      if (values.candidates === true) {
        bindings.push({
          id: "candidates",
          kind: "view",
          plugin: PLANNER_PLUGIN_ID,
          stage: STAGE.proposed,
          state: "enabled",
          run: async (ctx) => {
            candidateFound = true;
            logCandidate(ctx.repo, log);
          },
        });
      }

      if (values.verified === true) {
        bindings.push({
          id: "verified",
          kind: "view",
          plugin: PLANNER_PLUGIN_ID,
          stage: STAGE.verified,
          state: "enabled",
          run: async (ctx) => {
            verifiedFound = true;
            logVerified(ctx.repo, log);
          },
        });
      }

      for (const capability of capabilities) {
        capability.assemble({ args, assembly });
      }

      const shouldVerify = bindings.some(
        (binding) => binding.stage !== STAGE.proposed && binding.state !== OFF,
      );
      if (shouldVerify) {
        bindings.unshift({
          id: "verified:seen",
          kind: "view",
          plugin: PLANNER_PLUGIN_ID,
          stage: STAGE.verified,
          state: "enabled",
          run: async () => {
            verifiedFound = true;
          },
        });
      }

      const services: Services = {
        roots: await core.extensions[ROOTS_PLUGIN_ID].resolveRoots(),
        options: runOptionsFromValues(values),
        log,
        gitOps: core.extensions[GIT_PLUGIN_ID],
        dexportOps: core.extensions[DEXPORT_PLUGIN_ID],
      };
      const run = createActionRunState({ reportLifecycle: services.options.reportLifecycle, log });

      if (services.options.reportLifecycle && shouldVerify) {
        bindings.push({
          id: "flow:lifecycle",
          kind: "view",
          plugin: PLANNER_PLUGIN_ID,
          stage: STAGE.verified,
          state: "enabled",
          run: async (ctx) => {
            const flowExtension = ctx.flow.plugins[FLOW_PLUGIN_ID] as FlowExtension | undefined;
            run.reporterFor(
              ctx.repo,
              flowLifecycleRecords(ctx.repo, flowExtension?.snapshot().handoffs ?? []),
            );
          },
        });
        bindings.push({
          id: "lifecycle:report",
          kind: "view",
          plugin: PLANNER_PLUGIN_ID,
          stage: STAGE.report,
          state: "enabled",
          run: async (ctx) => {
            log.info("sync", "lifecycle_report", ctx.report.summary(run.hadErrorFor(ctx.repo)));
          },
        });
      }

      const plan = flow.plan().singleton().config({ verify: shouldVerify });
      const proposedBindings = bindingsForStage(bindings, STAGE.proposed);
      if (proposedBindings.length > 0) {
        plan.proposed(createBindingStage({ bindings: proposedBindings, run, services, args }));
      }

      for (const stage of ACTION_STAGE_ORDER) {
        const stageBindings = bindingsForStage(bindings, stage);
        if (stageBindings.length === 0) continue;
        plan.verified(createBindingStage({ bindings: stageBindings, run, services, args }));
      }

      plan.push(options.inputs);
      for await (const _repo of plan.execute()) {
      }

      if (services.options.reportLifecycle) {
        log.info("sync", "flow_lifecycle", { handoffs: plan.snapshot().handoffs });
      }

      return {
        hadError: run.hadError(),
        candidateFound,
        verifiedFound,
        bindings,
      };
    },
  }),
});
