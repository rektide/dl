import { describe, expect, test } from "vitest";
import {
  formatReportRecordJson,
  formatReportRecordText,
  formatReportSummaryJson,
  formatReportSummaryText,
} from "./format.ts";
import type { ReportRecord, ReportSummary } from "./types.ts";

const record: ReportRecord = {
  subject: "https://github.com/org/repo",
  step: "archive",
  source: "syncArchive -> git.cloneOrUpdate",
  status: "ok",
  event: "updated",
  details: { destination: "/tmp/archive/org/repo" },
  timestamp: "2026-05-07T00:00:00.000Z",
};

const summary: ReportSummary = {
  subject: "https://github.com/org/repo",
  hadError: false,
  records: [record],
};

describe("report formatters", () => {
  test("formats records as compact text", () => {
    expect(formatReportRecordText(record)).toBe(
      '[2026-05-07T00:00:00.000Z] [ok] [archive] updated https://github.com/org/repo: {"destination":"/tmp/archive/org/repo"}',
    );
  });

  test("formats records as JSON lines", () => {
    expect(formatReportRecordJson(record)).toBe(JSON.stringify(record));
  });

  test("formats summaries as compact text", () => {
    expect(formatReportSummaryText(summary)).toBe(
      "report https://github.com/org/repo: ok, 1 record",
    );
  });

  test("formats summaries as JSON lines", () => {
    expect(formatReportSummaryJson(summary)).toBe(JSON.stringify(summary));
  });
});
