import { describe, expect, test } from "vitest";
import { createReportService, createReporter } from "./reporter.ts";
import type { ReportRecord, ReportSummary } from "./types.ts";

const NOW = "2026-05-07T00:00:00.000Z";

describe("createReporter", () => {
  test("accumulates per-subject records with status helpers", () => {
    const reporter = createReporter("https://github.com/org/repo", [], { now: () => NOW });

    reporter.ok({
      step: "archive",
      source: "syncArchive -> git.cloneOrUpdate",
      event: "updated",
      details: { destination: "/tmp/archive/org/repo" },
    });
    reporter.needsAttention({
      step: "github-wiki",
      source: "syncGitHubWiki",
      event: "missing-remote",
    });

    expect(reporter.records()).toEqual([
      {
        subject: "https://github.com/org/repo",
        step: "archive",
        source: "syncArchive -> git.cloneOrUpdate",
        status: "ok",
        event: "updated",
        details: { destination: "/tmp/archive/org/repo" },
        timestamp: NOW,
      },
      {
        subject: "https://github.com/org/repo",
        step: "github-wiki",
        source: "syncGitHubWiki",
        status: "needs-attention",
        event: "missing-remote",
        details: {},
        timestamp: NOW,
      },
    ]);
  });

  test("includes accumulated records in summaries", () => {
    const reporter = createReporter(null, [], { now: () => NOW });

    reporter.failed({
      step: "pipeline",
      source: "processRepoContext",
      event: "error",
      details: { message: "explode" },
    });

    expect(reporter.summary(true)).toEqual({
      subject: null,
      hadError: true,
      records: [
        {
          subject: null,
          step: "pipeline",
          source: "processRepoContext",
          status: "failed",
          event: "error",
          details: { message: "explode" },
          timestamp: NOW,
        },
      ],
    });
  });
});

describe("createReportService", () => {
  test("returns stable reporters for the same subject", () => {
    const service = createReportService({ now: () => NOW });
    const first = service.forSubject("https://github.com/org/repo");
    const second = service.forSubject("https://github.com/org/repo");

    first.info({ step: "verified", source: "view", event: "resolved" });

    expect(second.records()).toHaveLength(1);
    expect(second.records()[0]?.event).toBe("resolved");
  });

  test("does not write accumulated records until explicitly flushed", () => {
    const records: Array<ReportRecord> = [];
    const summaries: Array<ReportSummary> = [];
    const service = createReportService({
      now: () => NOW,
      sink: {
        write: (record) => records.push(record),
        writeSummary: (summary) => summaries.push(summary),
      },
    });

    const reporter = service.forSubject("https://github.com/org/repo");
    reporter.ok({ step: "archive", source: "syncArchive", event: "updated" });

    expect(records).toEqual([]);
    expect(summaries).toEqual([]);

    const summary = reporter.summary(false);
    const record = reporter.records().at(0);
    if (!record) throw new Error("expected accumulated report record");
    service.writeRecord(record);
    service.writeSummary(summary);

    expect(records).toHaveLength(1);
    expect(summaries).toEqual([summary]);
  });

  test("emits immediate records without accumulating them into subject summaries", () => {
    const records: Array<ReportRecord> = [];
    const service = createReportService({
      now: () => NOW,
      sink: {
        write: (record) => records.push(record),
        writeSummary: () => {},
      },
    });

    service.emit({
      subject: null,
      step: "input",
      source: "watch",
      status: "info",
      event: "received",
      details: { input: "github.com/org/repo" },
    });

    expect(records).toEqual([
      {
        subject: null,
        step: "input",
        source: "watch",
        status: "info",
        event: "received",
        details: { input: "github.com/org/repo" },
        timestamp: NOW,
      },
    ]);
    expect(service.forSubject(null).records()).toEqual([]);
  });

  test("resolves string boolean child output modes from CLI values", () => {
    const service = createReportService({
      output: "false",
      outputStdout: "stdout",
      outputStderr: "true",
    });

    expect(service.getOutputStdout()).toBe(1);
    expect(service.getOutputStderr()).toBe("inherit");
  });
});
