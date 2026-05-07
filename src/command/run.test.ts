import { describe, expect, test } from "vitest";
import { processRepoContext, runFlowCommand } from "./run.ts";
import type { DlContext, DlOptions } from "../action/types.ts";
import type { GitOps } from "../git/types.ts";
import { ENSURE, OFF } from "../action/state.ts";
import { LOG_PLUGIN_ID, type LogEvent, type LogExtension } from "../plugin/log.ts";
import type { RepoContext } from "../repo/context.ts";
import { archiveHandler } from "../archive/handler.ts";
import { wikiHandler } from "../wiki/handler.ts";
import { deepwikiHandler } from "../deepwiki/handler.ts";
import { archlistHandler } from "../archlist/handler.ts";
import { symlinkHandler } from "../symlink/handler.ts";
import type { DexportOps } from "../dexport/types.ts";
import type { ActionHandler } from "../action/handler.ts";
import { DL_ACTIONS_PLUGIN_ID, type DlActionsExtension } from "../plugin/dl-actions.ts";
import { DEXPORT_PLUGIN_ID } from "../plugin/dexport.ts";
import {
  FLOW_PLUGIN_ID,
  type FlowExtension,
  type FlowObserver,
  type FlowPlan,
  type FlowHandoff,
  type FlowResolveOptions,
  type FlowSessionSnapshot,
} from "../plugin/flow.ts";
import { GIT_PLUGIN_ID } from "../plugin/git.ts";
import { CLIPBOARD_INPUT_PLUGIN_ID } from "../plugin/input-clipboard.ts";
import { POSITIONAL_INPUT_PLUGIN_ID } from "../plugin/input-positional.ts";
import { WATCH_INPUT_PLUGIN_ID } from "../plugin/input-watch.ts";
import { ROOTS_PLUGIN_ID } from "../plugin/roots.ts";
import type { DlExtensions } from "./context.ts";
import {
  REPO_STATE,
  type FlowCheckpoint,
  type FlowInput,
  type FlowInputMetadata,
  type Repo,
} from "../flow/types.ts";

function createLog(): { events: Array<LogEvent>; log: LogExtension } {
  const events: Array<LogEvent> = [];
  const push = (event: LogEvent) => {
    events.push(event);
  };

  return {
    events,
    log: {
      log: push,
      debug: (stage, event, data = {}) => push({ level: "debug", stage, event, data }),
      info: (stage, event, data = {}) => push({ level: "info", stage, event, data }),
      warn: (stage, event, data = {}) => push({ level: "warn", stage, event, data }),
      error: (stage, event, data = {}) => push({ level: "error", stage, event, data }),
      formatEvent: () => "",
      getOutputStdout: () => "ignore",
      getOutputStderr: () => "ignore",
    },
  };
}

function createOptions(overrides?: Partial<DlOptions>): DlOptions {
  return {
    consumeDexportOutput: false,
    noLogCache: false,
    reportLifecycle: true,
    archiveState: ENSURE,
    wikiState: OFF,
    deepwikiState: OFF,
    archlistState: OFF,
    symlinkState: OFF,
    anycase: false,
    verified: false,
    dryRun: false,
    ...overrides,
  };
}

function createResolved(): RepoContext {
  return {
    input: "org/repo",
    source: { provider: "github" },
    url: new URL("https://github.com/org/repo"),
    verified: true,
    wikiDeepUrl: new URL("https://deepwiki.com/org/repo"),
    wikiRepoUrl: new URL("https://github.com/org/repo.wiki.git"),
    project: "repo",
    org: "org",
  };
}

async function* inputs(...values: ReadonlyArray<string>): AsyncGenerator<string> {
  for (const value of values) {
    yield value;
  }
}

function createRepo(overrides?: Partial<Repo>): Repo {
  return {
    id: "github:org/repo",
    input: "org/repo",
    url: new URL("https://github.com/org/repo"),
    inputUrl: null,
    host: "github.com",
    org: "org",
    project: "repo",
    state: REPO_STATE.verified,
    producedBy: "github",
    verifiedBy: new Set(["github"]),
    ...overrides,
  };
}

function createSnapshot(handoffs: ReadonlyArray<FlowHandoff>): FlowSessionSnapshot {
  return {
    phase: "completed",
    queuedCount: 0,
    observers: { proposed: 0, verified: 0 },
    startedAt: null,
    endedAt: null,
    lastError: null,
    emittedProposed: 0,
    emittedVerified: 0,
    handoffCount: handoffs.length,
    handoffs,
  };
}

function createFlowExtension(
  repos: ReadonlyArray<Repo>,
  handoffs: ReadonlyArray<FlowHandoff> = [],
): FlowExtension {
  const createPlan = (): FlowPlan => {
    const observers: Record<FlowCheckpoint, Array<FlowObserver>> = {
      proposed: [],
      verified: [],
    };

    return {
      config(_options?: Partial<FlowResolveOptions>) {
        return this;
      },
      push(_input: FlowInput, _metadata?: FlowInputMetadata) {
        return this;
      },
      on(checkpoint: FlowCheckpoint, observer: FlowObserver) {
        observers[checkpoint].push(observer);
        return this;
      },
      singleton() {
        return this;
      },
      snapshot() {
        return createSnapshot(handoffs);
      },
      async *execute() {
        for (const repo of repos) {
          for (const observer of observers.proposed) {
            await observer(repo, {} as Parameters<FlowObserver>[1]);
          }
          for (const observer of observers.verified) {
            await observer(repo, {} as Parameters<FlowObserver>[1]);
          }
          yield repo;
        }
      },
    };
  };

  let plan = createPlan();
  return {
    plan: () => {
      plan = createPlan();
      return plan;
    },
    config: () => undefined,
    push: () => undefined,
    on: () => undefined,
    snapshot: () => plan.snapshot(),
    execute: () => plan.execute(),
  };
}

function createActionsExtension(handlers: ReadonlyArray<ActionHandler>): DlActionsExtension {
  return {
    "dl:actions": [],
    "dl:handlers": handlers,
    resolveActionStates: () => ({}),
    resolveActionOptions: () => ({}),
  };
}

function createExtensions(
  log: LogExtension,
  flow: FlowExtension,
  handlers: ReadonlyArray<ActionHandler> = [],
): DlExtensions {
  const gitOps: GitOps = {
    cloneOrUpdate: async () => "updated",
    ensureJjInitialized: async () => "already_initialized",
    listRemotes: async () => [],
    normalizeCloneUrl: (url) => url,
  };
  const dexportOps: DexportOps = {
    sync: async () => ({ plan: "skip-existing", status: "skipped", reason: null }),
  };

  return {
    [DL_ACTIONS_PLUGIN_ID]: createActionsExtension(handlers),
    [ROOTS_PLUGIN_ID]: {
      resolveRoots: async () => ({ archiveRoot: "/tmp/archive", wikiRoot: "/tmp/wiki" }),
    },
    [FLOW_PLUGIN_ID]: flow,
    [POSITIONAL_INPUT_PLUGIN_ID]: { source: () => inputs("org/repo") },
    [WATCH_INPUT_PLUGIN_ID]: { active: false, source: () => inputs() },
    [CLIPBOARD_INPUT_PLUGIN_ID]: { active: false, source: () => inputs() },
    [GIT_PLUGIN_ID]: gitOps,
    [DEXPORT_PLUGIN_ID]: dexportOps,
    [LOG_PLUGIN_ID]: log,
  };
}

describe("processRepoContext", () => {
  test("isolates archive failure and still emits lifecycle report", async () => {
    const { events, log } = createLog();
    const gitOps: GitOps = {
      cloneOrUpdate: async () => {
        throw new Error("archive exploded");
      },
      ensureJjInitialized: async () => "already_initialized",
      listRemotes: async () => [],
      normalizeCloneUrl: (url) => url,
    };

    const dexportOps: DexportOps = {
      sync: async () => ({ plan: "run", status: "ran", reason: null }),
    };

    const ctx: DlContext = {
      roots: { archiveRoot: "/tmp/archive", wikiRoot: "/tmp/wiki" },
      options: createOptions({ deepwikiState: ENSURE }),
      log,
      gitOps,
      dexportOps,
    };

    const handlers = [
      archlistHandler,
      archiveHandler,
      symlinkHandler,
      deepwikiHandler,
      wikiHandler,
    ];
    const hadError = await processRepoContext(createResolved(), ctx, handlers);
    expect(hadError).toBe(true);

    const reportEvent = events.find((event) => event.event === "lifecycle_report");
    expect(reportEvent).toBeDefined();
    expect(reportEvent?.data.hadError).toBe(true);

    const records = (reportEvent?.data.records ?? []) as Array<{ step: string; status: string }>;
    expect(records.some((record) => record.step === "archive" && record.status === "failed")).toBe(
      true,
    );
  });

  test("treats wiki soft failures as non-fatal while recording failure status", async () => {
    const { events, log } = createLog();
    const gitOps: GitOps = {
      cloneOrUpdate: async () => "updated",
      ensureJjInitialized: async () => "already_initialized",
      listRemotes: async () => [],
      normalizeCloneUrl: (url) => url,
    };

    const dexportOps: DexportOps = {
      sync: async () => ({ plan: "run", status: "failed", reason: "dexport failed" }),
    };

    const ctx: DlContext = {
      roots: { archiveRoot: "/tmp/archive", wikiRoot: "/tmp/wiki" },
      options: createOptions({ archiveState: OFF, wikiState: OFF, deepwikiState: ENSURE }),
      log,
      gitOps,
      dexportOps,
    };

    const handlers = [
      archlistHandler,
      archiveHandler,
      symlinkHandler,
      deepwikiHandler,
      wikiHandler,
    ];
    const hadError = await processRepoContext(createResolved(), ctx, handlers);
    expect(hadError).toBe(true);

    const reportEvent = events.find((event) => event.event === "lifecycle_report");
    const records = (reportEvent?.data.records ?? []) as Array<{ step: string; status: string }>;
    expect(
      records.some((record) => record.step === "wiki-dexport" && record.status === "failed"),
    ).toBe(true);
  });
});

describe("runFlowCommand", () => {
  test("emits candidate and verified logs in one flow run", async () => {
    const { events, log } = createLog();
    const extensions = createExtensions(log, createFlowExtension([createRepo()]));

    const result = await runFlowCommand({
      extensions,
      options: createOptions(),
      inputs: inputs("org/repo"),
      showCandidates: true,
      showVerified: true,
    });

    expect(result).toEqual({
      hadError: false,
      candidateFound: true,
      verifiedFound: true,
    });
    expect(events.some((event) => event.stage === "candidates" && event.event === "expanded")).toBe(
      true,
    );
    expect(events.some((event) => event.stage === "verified" && event.event === "resolved")).toBe(
      true,
    );
  });

  test("composes candidate logging with action execution", async () => {
    const { events, log } = createLog();
    const handled: Array<string | null> = [];
    const handler: ActionHandler = {
      id: "pipeline",
      run: async (resolved, _ctx, lifecycle) => {
        handled.push(resolved.url?.toString() ?? null);
        lifecycle.ok({ step: "pipeline", source: "test", transition: "handled" });
        return { hadError: false };
      },
    };
    const extensions = createExtensions(log, createFlowExtension([createRepo()]), [handler]);

    const result = await runFlowCommand({
      extensions,
      options: createOptions({ reportLifecycle: true }),
      inputs: inputs("org/repo"),
      showCandidates: true,
      runActions: true,
    });

    expect(result.hadError).toBe(false);
    expect(result.candidateFound).toBe(true);
    expect(result.verifiedFound).toBe(true);
    expect(handled).toEqual(["https://github.com/org/repo"]);
    expect(events.some((event) => event.stage === "candidates" && event.event === "expanded")).toBe(
      true,
    );
    expect(
      events.some((event) => event.stage === "sync" && event.event === "lifecycle_report"),
    ).toBe(true);
  });

  test("returns hadError from awaited action results", async () => {
    const { log } = createLog();
    const handler: ActionHandler = {
      id: "pipeline",
      run: async () => {
        await Promise.resolve();
        return { hadError: true };
      },
    };
    const extensions = createExtensions(log, createFlowExtension([createRepo()]), [handler]);

    const result = await runFlowCommand({
      extensions,
      options: createOptions(),
      inputs: inputs("org/repo"),
      runActions: true,
    });

    expect(result.hadError).toBe(true);
  });

  test("includes redirect handoff records in action lifecycle reports", async () => {
    const { events, log } = createLog();
    const handoffs: Array<FlowHandoff> = [
      {
        fromInput: "https://short.example/repo",
        fromUrl: "https://short.example/repo",
        fromProvider: "redirector",
        toInput: "org/repo",
        toHost: "github.com",
      },
    ];
    const handler: ActionHandler = {
      id: "pipeline",
      run: async (_resolved, _ctx, lifecycle) => {
        lifecycle.ok({ step: "pipeline", source: "test", transition: "handled" });
        return { hadError: false };
      },
    };
    const extensions = createExtensions(log, createFlowExtension([createRepo()], handoffs), [
      handler,
    ]);

    await runFlowCommand({
      extensions,
      options: createOptions({ reportLifecycle: true }),
      inputs: inputs("https://short.example/repo"),
      runActions: true,
    });

    const reportEvent = events.find((event) => event.event === "lifecycle_report");
    const records = (reportEvent?.data.records ?? []) as Array<{
      step: string;
      transition: string;
    }>;
    expect(
      records.some((record) => record.step === "flow" && record.transition === "redirect-handoff"),
    ).toBe(true);
  });
});
