// pattern: Imperative Shell

import { plugin } from "gunshi/plugin";
import { FLOW_PLUGIN_ID, type FlowExtension } from "../plugin/flow.ts";
import { DEXPORT_PLUGIN_ID, type DexportExtension } from "../plugin/dexport.ts";
import { GIT_PLUGIN_ID, type GitExtension } from "../plugin/git.ts";
import { LOG_PLUGIN_ID, type LogExtension } from "../plugin/log.ts";
import { ROOTS_PLUGIN_ID, type RootsExtension } from "../plugin/roots.ts";
import { REPORT_PLUGIN_ID, type ReportExtension } from "../report/plugin.ts";
import { createArgs } from "./args.ts";
import { executeBindingPlan } from "./execute.ts";
import { createBindingPlan } from "./plan.ts";
import {
  type Action,
  type ActionPluginExtension,
  type PlannerExtension,
  type RunOptions,
  type Services,
} from "./types.ts";

export const PLANNER_PLUGIN_ID = "planner" as const;

type PlannerPluginExtensions = Record<string, unknown> & {
  [FLOW_PLUGIN_ID]: FlowExtension;
  [ROOTS_PLUGIN_ID]: RootsExtension;
  [LOG_PLUGIN_ID]: LogExtension;
  [REPORT_PLUGIN_ID]: ReportExtension;
  [GIT_PLUGIN_ID]: GitExtension;
  [DEXPORT_PLUGIN_ID]: DexportExtension;
};

type CoreContext = Readonly<{
  values?: Record<string, unknown>;
  explicit?: Record<string, boolean | undefined>;
  tokens?: ReadonlyArray<{ kind?: string; name?: string; value?: string; inlineValue?: boolean }>;
  extensions: PlannerPluginExtensions;
}>;

function isActionPluginExtension(value: unknown): value is ActionPluginExtension {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { actions?: unknown };
  return Array.isArray(candidate.actions);
}

function collectActions(extensions: Record<string, unknown>): Array<Action> {
  const actions: Array<Action> = [];
  for (const extension of Object.values(extensions)) {
    if (!isActionPluginExtension(extension)) continue;
    actions.push(...extension.actions);
  }
  return actions;
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

export const plannerPlugin = plugin({
  id: PLANNER_PLUGIN_ID,
  name: "Planner",
  setup: (ctx) => {
    ctx.addGlobalOption("dry-run", {
      type: "boolean",
      default: false,
      description: "Show what would be done without making changes",
    });
  },
  extension: (core: CoreContext): PlannerExtension => ({
    async run(options) {
      const values = core.values ?? {};
      const explicit = core.explicit ?? {};
      const tokens = core.tokens ?? [];
      const log = core.extensions[LOG_PLUGIN_ID];
      const actions = collectActions(core.extensions);
      const specs = actions.map((action) => action.spec);
      const args = createArgs({
        specs,
        values,
        explicit,
        tokens,
        subcommand: options.subcommand,
      });

      const bindingPlan = createBindingPlan({ actions, args });

      const services: Services = {
        roots: await core.extensions[ROOTS_PLUGIN_ID].resolveRoots(),
        options: runOptionsFromValues(values),
        log,
        report: core.extensions[REPORT_PLUGIN_ID],
        gitOps: core.extensions[GIT_PLUGIN_ID],
        dexportOps: core.extensions[DEXPORT_PLUGIN_ID],
      };

      return executeBindingPlan({
        pluginId: PLANNER_PLUGIN_ID,
        bindingPlan,
        args,
        services,
        flow: core.extensions[FLOW_PLUGIN_ID],
        log,
        inputs: options.inputs,
      });
    },
  }),
});
