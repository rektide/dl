import type { FlowContext, Repo } from "../flow/types.ts";
import type { DexportOps } from "../dexport/types.ts";
import type { GitOps } from "../git/types.ts";
import type { LogExtension } from "../plugin/log.ts";
import type { Reporter, ReportService } from "../report/types.ts";
import type { Stage } from "../execute/stage.ts";

export const OFF = "off" as const;

export const STAGE = {
  proposed: "proposed",
  verified: "verified",
  catalog: "catalog",
  materialize: "materialize",
  document: "document",
  link: "link",
  report: "report",
} as const;

export type StageName = (typeof STAGE)[keyof typeof STAGE];

export type ActionRole = "effect" | "view" | "report" | "mode";

export type ActionSpec = Readonly<{
  name: string;
  description: string;
  role: ActionRole;
  defaultParticipation?: "default" | "explicit-only";
  suppressesDefaultsWhenExplicit?: boolean;
  defaultState: string;
  states: ReadonlyArray<string>;
  optionKey?: string;
}>;

export type ActionToken = Readonly<{
  kind?: string;
  name?: string;
  value?: string;
  inlineValue?: boolean;
}>;

export type SubcommandSelection = Readonly<{
  name: string;
  state: string;
}>;

export type InvocationIntent = Readonly<{
  selected: ReadonlySet<string>;
  explicit: ReadonlySet<string>;
  suppressedDefaults: boolean;
  subcommand: SubcommandSelection | null;
  state(name: string): string;
  enabled(name: string): boolean;
}>;

export type Args = Readonly<{
  intent: InvocationIntent;
  value(name: string): unknown;
  explicit(name: string): boolean;
  inlineValue(name: string): string | null;
}>;

export type RunOptions = Readonly<{
  consumeDexportOutput: boolean;
  noLogCache: boolean;
  reportLifecycle: boolean;
  anycase: boolean;
  dryRun: boolean;
}>;

export type Services = Readonly<{
  roots: { archiveRoot: string; wikiRoot: string; githubWikiRoot: string };
  options: RunOptions;
  log: LogExtension;
  report: ReportService;
  gitOps: GitOps;
  dexportOps: DexportOps;
}>;

export type RepoFacts = Readonly<{
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
}>;

export type ActionRunState = Readonly<{
  hadError(): boolean;
  hadErrorFor(repo: Repo): boolean;
  markError(repo: Repo, bindingId: string, error?: unknown): void;
  record(key: string): void;
  recorded(key: string): boolean;
  factsFor(repo: Repo): RepoFacts;
}>;

export type ActionResult = Readonly<{
  hadError: boolean;
}>;

export type RepoExecution = Readonly<{
  repo: Repo;
  flow: FlowContext;
  binding: Binding;
  stage: StageName;
  state: string;
  args: Args;
  services: Services;
  facts: RepoFacts;
  report: Reporter;
  hadError(): boolean;
  markError(error?: unknown): void;
  record(key: string): void;
}>;

/** @deprecated Use RepoExecution */
export type ActionExecutionContext = RepoExecution;

export type Binding = Readonly<{
  id: string;
  plugin: string;
  stage: StageName;
  state: string;
  run(ctx: RepoExecution): Promise<ActionResult | void>;
}>;

export type Assembly = Readonly<{
  bind(binding: Binding): void;
}>;

export type ActionAssemblyContext = Readonly<{
  intent: InvocationIntent;
  args: Args;
  assembly: Assembly;
}>;

export type Action = Readonly<{
  spec: ActionSpec;
  assemble(ctx: ActionAssemblyContext): void;
}>;

/** @deprecated Use Action */
export type ActionCapability = Action;

export type ActionPluginExtension = Readonly<{
  actions: ReadonlyArray<Action>;
}>;

export type PlannerRunOptions = Readonly<{
  inputs: AsyncIterable<string>;
  subcommand?: SubcommandSelection;
}>;

export type PlannerRunResult = Readonly<{
  hadError: boolean;
  candidateFound: boolean;
  verifiedFound: boolean;
  bindings: ReadonlyArray<Binding>;
}>;

export type PlannerExtension = Readonly<{
  run(options: PlannerRunOptions): Promise<PlannerRunResult>;
}>;

export type BoundStageOptions = Readonly<{
  bindings: ReadonlyArray<Binding>;
  run: ActionRunState;
  services: Services;
  args: Args;
}>;

export type StageBinding = Readonly<{
  stage: StageName;
  bindings: ReadonlyArray<Binding>;
  streamStage: Stage<Repo, FlowContext>;
}>;
