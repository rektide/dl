import type { Reporter, ReportRecord } from "../report/types.ts";
import { createReporter } from "../report/reporter.ts";

export type LifecycleStep =
  | "archlist"
  | "archive"
  | "archive-jj"
  | "symlink-org"
  | "symlink-repo"
  | "wiki-dexport"
  | "wiki-git"
  | "flow"
  | "pipeline";

export type LifecycleStatus = "ok" | "skipped" | "failed";

export type LifecycleRecord = {
  readonly step: LifecycleStep;
  readonly source: string;
  readonly status: LifecycleStatus;
  readonly transition: string;
  readonly details: Readonly<Record<string, unknown>>;
};

export type LifecycleSummary = {
  readonly repoUrl: string | null;
  readonly hadError: boolean;
  readonly records: ReadonlyArray<LifecycleRecord>;
};

type LifecycleRecordInput = {
  readonly step: LifecycleStep;
  readonly source: string;
  readonly status: LifecycleStatus;
  readonly transition: string;
  readonly details?: Readonly<Record<string, unknown>>;
};

export type LifecycleReporter = {
  ok: (input: Omit<LifecycleRecordInput, "status">) => void;
  skipped: (input: Omit<LifecycleRecordInput, "status">) => void;
  failed: (input: Omit<LifecycleRecordInput, "status">) => void;
  summary: (hadError: boolean) => LifecycleSummary;
};

function lifecycleRecordToReportRecord(
  subject: string | null,
  record: Readonly<LifecycleRecord>,
): ReportRecord {
  return {
    subject,
    step: record.step,
    source: record.source,
    status: record.status,
    event: record.transition,
    details: record.details,
    timestamp: new Date().toISOString(),
  };
}

function reportRecordToLifecycleRecord(record: Readonly<ReportRecord>): LifecycleRecord {
  return {
    step: record.step as LifecycleStep,
    source: record.source,
    status: record.status as LifecycleStatus,
    transition: record.event,
    details: record.details,
  };
}

export function createLifecycleReporter(
  subject: string | null,
  initialRecords: ReadonlyArray<LifecycleRecord> = [],
): LifecycleReporter {
  const repoUrl = subject;
  const reporter: Reporter = createReporter(
    subject,
    initialRecords.map((record) => lifecycleRecordToReportRecord(subject, record)),
  );

  const record = (input: LifecycleRecordInput): void => {
    reporter[input.status]({
      step: input.step,
      source: input.source,
      event: input.transition,
      details: input.details,
    });
  };

  return {
    ok: (input) => record({ ...input, status: "ok" }),
    skipped: (input) => record({ ...input, status: "skipped" }),
    failed: (input) => record({ ...input, status: "failed" }),
    summary: (hadError: boolean) => ({
      repoUrl,
      hadError,
      records: reporter.records().map(reportRecordToLifecycleRecord),
    }),
  };
}
