import { describe, expect, test } from "vitest";
import { REPO_STATE, type FlowContext, type Repo } from "../flow/types.ts";
import { FLOW_PLUGIN_ID, type FlowHandoff } from "../plugin/flow.ts";
import type { Binding } from "../planner/types.ts";
import { createReportService } from "./reporter.ts";
import type { ReportSummary } from "./types.ts";
import { lifecycleReportAction, flowLifecycleRecords } from "./lifecycle.ts";

function createRepo(): Repo {
  return {
    id: "github:org/repo",
    input: "https://github.com/org/repo",
    url: new URL("https://github.com/org/repo"),
    inputUrl: null,
    host: "github.com",
    org: "org",
    project: "repo",
    state: REPO_STATE.verified,
    producedBy: "github",
    verifiedBy: new Set(["github"]),
  };
}

function createHandoffs(): Array<FlowHandoff> {
  return [
    {
      fromInput: "crates.io/crates/serde",
      fromUrl: "https://github.com/serde-rs/serde",
      fromProvider: "crates-io",
      toInput: "https://github.com/serde-rs/serde",
      toHost: "github.com",
    },
    {
      fromInput: "npm/react",
      fromUrl: "https://github.com/org/repo",
      fromProvider: "npmx-dev",
      toInput: "https://github.com/org/repo",
      toHost: "github.com",
    },
  ];
}

describe("flowLifecycleRecords", () => {
  test("creates redirect handoff records for the current repo input", () => {
    expect(flowLifecycleRecords(createRepo(), createHandoffs())).toEqual([
      {
        step: "flow",
        source: "npmx-dev -> flow.push",
        status: "ok",
        transition: "redirect-handoff",
        details: {
          fromInput: "npm/react",
          fromUrl: "https://github.com/org/repo",
          toInput: "https://github.com/org/repo",
          toHost: "github.com",
        },
      },
    ]);
  });
});

describe("lifecycleReportAction", () => {
  test("records flow handoffs and emits lifecycle summaries as a report action", async () => {
    const bindings: Array<Binding> = [];
    lifecycleReportAction.assemble({
      args: {} as never,
      intent: {
        enabled: (name: string) => name === "report-lifecycle",
        state: () => "enabled",
      } as never,
      assembly: { bind: (binding) => bindings.push(binding) },
    });
    const repo = createRepo();
    const summaries: Array<ReportSummary> = [];
    const reportService = createReportService({
      sink: {
        write: () => {},
        writeSummary: (summary) => summaries.push(summary),
      },
    });
    const reporter = reportService.forSubject(repo.url.toString());
    const flow = {
      plugins: {
        [FLOW_PLUGIN_ID]: {
          snapshot: () => ({ handoffs: createHandoffs() }),
        },
      },
    } as unknown as FlowContext;
    const ctx = {
      repo,
      flow,
      report: reporter,
      services: {
        report: reportService,
      },
      hadError: () => false,
    } as never;

    const flowBinding = bindings.at(0);
    const summaryBinding = bindings.at(1);
    if (!flowBinding || !summaryBinding) throw new Error("expected lifecycle report bindings");

    await flowBinding.run(ctx);
    await summaryBinding.run(ctx);

    expect(bindings.map((binding) => binding.stage)).toEqual(["verified", "report"]);
    expect(summaries).toEqual([
      {
        subject: "https://github.com/org/repo",
        hadError: false,
        records: [
          {
            subject: "https://github.com/org/repo",
            step: "flow",
            source: "npmx-dev -> flow.push",
            status: "ok",
            event: "redirect-handoff",
            details: {
              fromInput: "npm/react",
              fromUrl: "https://github.com/org/repo",
              toInput: "https://github.com/org/repo",
              toHost: "github.com",
            },
            timestamp: expect.any(String),
          },
        ],
      },
    ]);
  });
});
