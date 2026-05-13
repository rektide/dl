// pattern: Imperative Shell

import {
  formatReportRecordJson,
  formatReportRecordText,
  formatReportSummaryJson,
  formatReportSummaryText,
} from "./format.ts";
import type { ReportRecord, ReportSink, ReportSummary } from "./types.ts";

type CreateStdioReportSinkOptions = Readonly<{
  json?: boolean;
}>;

export function createStdioReportSink(options: CreateStdioReportSinkOptions = {}): ReportSink {
  const formatRecord = options.json ? formatReportRecordJson : formatReportRecordText;
  const formatSummary = options.json ? formatReportSummaryJson : formatReportSummaryText;

  return {
    write(record: ReportRecord): void {
      process.stderr.write(`${formatRecord(record)}\n`);
    },
    writeSummary(summary: ReportSummary): void {
      process.stderr.write(`${formatSummary(summary)}\n`);
    },
  };
}
