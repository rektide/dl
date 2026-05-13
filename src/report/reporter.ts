// pattern: Imperative Shell

import type {
  OutputValue,
  ReportEmitInput,
  Reporter,
  ReportInput,
  ReportRecord,
  ReportService,
  ReportSink,
  ReportStatus,
  StdioMode,
} from "./types.ts";

type CreateReporterOptions = Readonly<{
  now?: () => string;
}>;

type CreateReportServiceOptions = CreateReporterOptions &
  Readonly<{
    sink?: ReportSink;
    output?: OutputValue;
    outputStdout?: OutputValue;
    outputStderr?: OutputValue;
  }>;

function currentIsoTimestamp(): string {
  return new Date().toISOString();
}

function resolveStreamMode(
  specific: OutputValue | undefined,
  fallback: OutputValue | undefined,
): StdioMode | number {
  const value = specific ?? fallback ?? true;
  if (value === true || value === "true") return "inherit";
  if (value === false || value === "false") return "ignore";
  if (value === "stdout") return 1;
  if (value === "stderr") return 2;
  return "inherit";
}

function createRecord(options: {
  readonly subject: string | null;
  readonly status: ReportStatus;
  readonly input: ReportInput;
  readonly now: () => string;
}): ReportRecord {
  return {
    subject: options.subject,
    step: options.input.step,
    source: options.input.source,
    status: options.status,
    event: options.input.event,
    details: options.input.details ?? {},
    timestamp: options.now(),
  };
}

export function createReporter(
  subject: string | null,
  initialRecords: ReadonlyArray<ReportRecord> = [],
  options: CreateReporterOptions = {},
): Reporter {
  const now = options.now ?? currentIsoTimestamp;
  const records: Array<ReportRecord> = [...initialRecords];

  const record = (status: ReportStatus, input: ReportInput): void => {
    records.push(createRecord({ subject, status, input, now }));
  };

  return {
    info: (input) => record("info", input),
    ok: (input) => record("ok", input),
    skipped: (input) => record("skipped", input),
    failed: (input) => record("failed", input),
    needsAttention: (input) => record("needs-attention", input),
    records: () => records,
    summary: (hadError: boolean) => ({
      subject,
      hadError,
      records,
    }),
  };
}

export function createReportService(options: CreateReportServiceOptions = {}): ReportService {
  const now = options.now ?? currentIsoTimestamp;
  const reporters = new Map<string, Reporter>();
  const sink = options.sink;

  const keyFor = (subject: string | null): string => subject ?? "";

  return {
    forSubject: (subject, initialRecords = []) => {
      const key = keyFor(subject);
      const existing = reporters.get(key);
      if (existing) return existing;
      const reporter = createReporter(subject, initialRecords, { now });
      reporters.set(key, reporter);
      return reporter;
    },
    emit: (input: ReportEmitInput) => {
      sink?.write(
        createRecord({
          subject: input.subject ?? null,
          status: input.status ?? "info",
          input,
          now,
        }),
      );
    },
    writeRecord: (record) => {
      sink?.write(record);
    },
    writeSummary: (summary) => {
      sink?.writeSummary(summary);
    },
    getOutputStdout: () => resolveStreamMode(options.outputStdout, options.output),
    getOutputStderr: () => resolveStreamMode(options.outputStderr, options.output),
  };
}
