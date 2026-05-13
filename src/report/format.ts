// pattern: Functional Core

import type { ReportRecord, ReportSummary } from "./types.ts";

function formatSubject(subject: string | null): string {
  return subject ?? "<none>";
}

function formatRecordCount(count: number): string {
  return `${count} ${count === 1 ? "record" : "records"}`;
}

export function formatReportRecordText(record: Readonly<ReportRecord>): string {
  return `[${record.timestamp}] [${record.status}] [${record.step}] ${record.event} ${formatSubject(record.subject)}: ${JSON.stringify(record.details)}`;
}

export function formatReportRecordJson(record: Readonly<ReportRecord>): string {
  return JSON.stringify(record);
}

export function formatReportSummaryText(summary: Readonly<ReportSummary>): string {
  const status = summary.hadError ? "failed" : "ok";
  return `report ${formatSubject(summary.subject)}: ${status}, ${formatRecordCount(summary.records.length)}`;
}

export function formatReportSummaryJson(summary: Readonly<ReportSummary>): string {
  return JSON.stringify(summary);
}
