export type ReportStatus = "info" | "ok" | "skipped" | "failed" | "needs-attention";

export type StdioMode = "inherit" | "ignore" | "pipe";

export type OutputValue = true | false | "true" | "false" | "stdout" | "stderr";

export type ReportRecord = Readonly<{
  subject: string | null;
  step: string;
  source: string;
  status: ReportStatus;
  event: string;
  details: Readonly<Record<string, unknown>>;
  timestamp: string;
}>;

export type ReportInput = Readonly<{
  step: string;
  source: string;
  event: string;
  details?: Readonly<Record<string, unknown>>;
}>;

export type ReportEmitInput = ReportInput &
  Readonly<{
    subject?: string | null;
    status?: ReportStatus;
  }>;

export type ReportSummary = Readonly<{
  subject: string | null;
  hadError: boolean;
  records: ReadonlyArray<ReportRecord>;
}>;

export type Reporter = Readonly<{
  info(input: ReportInput): void;
  ok(input: ReportInput): void;
  skipped(input: ReportInput): void;
  failed(input: ReportInput): void;
  needsAttention(input: ReportInput): void;
  records(): ReadonlyArray<ReportRecord>;
  summary(hadError: boolean): ReportSummary;
}>;

export type ReportSink = Readonly<{
  write(record: ReportRecord): void;
  writeSummary(summary: ReportSummary): void;
}>;

export type ReportService = Readonly<{
  forSubject(subject: string | null, initial?: ReadonlyArray<ReportRecord>): Reporter;
  emit(input: ReportEmitInput): void;
  writeRecord(record: ReportRecord): void;
  writeSummary(summary: ReportSummary): void;
  getOutputStdout(): StdioMode | number;
  getOutputStderr(): StdioMode | number;
}>;
