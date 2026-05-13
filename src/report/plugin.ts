// pattern: Imperative Shell

import { plugin } from "gunshi/plugin";
import type { ActionPluginExtension } from "../planner/types.ts";
import { lifecycleReportAction } from "./lifecycle.ts";
import { createStdioReportSink } from "./output.ts";
import { createReportService } from "./reporter.ts";
import type { OutputValue, ReportService } from "./types.ts";

export const REPORT_PLUGIN_ID = "report" as const;

type ReportPluginValues = Readonly<{
  json?: boolean;
  childOutput?: OutputValue;
  childOutputStdout?: OutputValue;
  childOutputStderr?: OutputValue;
}>;

export type ReportExtension = ReportService & ActionPluginExtension;

export const reportPlugin = plugin({
  id: REPORT_PLUGIN_ID,
  name: "Report",
  setup: (ctx) => {
    ctx.addGlobalOption(lifecycleReportAction.spec.name, {
      type: "boolean",
      default: false,
      description: lifecycleReportAction.spec.description,
    });
    ctx.addGlobalOption("child-output", {
      type: "string",
      description:
        "Default child process output (true|false|stdout|stderr). true=inherit, false=ignore, stdout/stderr=redirect",
    });
    ctx.addGlobalOption("child-output-stdout", {
      type: "string",
      description:
        "Child stdout handling (true|false|stdout|stderr). Overrides --child-output for stdout",
    });
    ctx.addGlobalOption("child-output-stderr", {
      type: "string",
      description:
        "Child stderr handling (true|false|stdout|stderr). Overrides --child-output for stderr",
    });
  },
  extension: (core): ReportExtension => {
    const values = core.values as ReportPluginValues;
    return {
      ...createReportService({
        sink: createStdioReportSink({ json: values.json ?? false }),
        output: values.childOutput,
        outputStdout: values.childOutputStdout,
        outputStderr: values.childOutputStderr,
      }),
      actions: [lifecycleReportAction],
    };
  },
});
