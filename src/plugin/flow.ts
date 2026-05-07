import { plugin } from "gunshi/plugin";
import {
  FLOW_CHECKPOINT,
  FLOW_INPUT_ORIGIN,
  FLOW_GOAL,
  type FlowCheckpoint,
  type FlowContext,
  type FlowGoal,
  type FlowInput,
  type FlowInputMetadata,
  type Repo,
} from "../flow/types.ts";
import {
  createBufferedAsyncQueue,
  type BufferedAsyncQueue,
} from "../execute/buffered-async-queue.ts";
import { createInputFlowExecutor } from "../execute/executor.ts";
import { fanIn } from "../execute/fan-in.ts";
import type { Stage } from "../execute/stage.ts";
import { RESOLVE_TIMEOUT } from "../repo/util.ts";
import { createProviderRegistry } from "../provider/registry.ts";
import { githubProvider } from "../provider/github.ts";
import { gitlabProvider } from "../provider/gitlab.ts";
import { tangledProvider } from "../provider/tangled.ts";
import { cratesIoProvider } from "../provider/crates-io.ts";
import { docsRsProvider } from "../provider/docs-rs.ts";
import { npmxDevProvider } from "../provider/npmx-dev.ts";
import { githubioProvider } from "../provider/githubio.ts";
import { genericProvider } from "../provider/generic.ts";

export const FLOW_PLUGIN_ID = "rekon:flow" as const;

export type FlowResolveOptionsShape = {
  verify: boolean;
  goal: FlowGoal;
  continueOnError: boolean;
  timeoutMs: number;
};

export type FlowResolveOptions = Readonly<FlowResolveOptionsShape>;

export type FlowObserver = (repo: Repo, context: FlowContext) => void | Promise<void>;

export type FlowObserverMapShape = {
  proposed: Array<FlowObserver>;
  verified: Array<FlowObserver>;
};

export type FlowObserverMap = FlowObserverMapShape;

export type FlowHandoffShape = {
  fromInput: string;
  fromUrl: string;
  fromProvider: string;
  toInput: string;
  toHost: string;
};

export type FlowHandoff = Readonly<FlowHandoffShape>;

export const FLOW_SESSION_PHASE = {
  idle: "idle",
  configured: "configured",
  executing: "executing",
  draining: "draining",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
} as const;

export type FlowSessionPhase = (typeof FLOW_SESSION_PHASE)[keyof typeof FLOW_SESSION_PHASE];

export type FlowSessionShape = {
  phase: FlowSessionPhase;
  options: FlowResolveOptions;
  queue: BufferedAsyncQueue<AsyncIterable<QueuedFlowInput>>;
  observers: FlowObserverMap;
  startedAt: Date | null;
  endedAt: Date | null;
  lastError: Error | null;
  emittedProposed: number;
  emittedVerified: number;
  handoffCount: number;
  seenInputs: Set<string>;
  handoffs: Array<FlowHandoff>;
};

export type FlowSession = FlowSessionShape;

export type FlowSessionSnapshotShape = {
  phase: FlowSessionPhase;
  queuedCount: number;
  observers: Readonly<Record<FlowCheckpoint, number>>;
  startedAt: Date | null;
  endedAt: Date | null;
  lastError: Error | null;
  emittedProposed: number;
  emittedVerified: number;
  handoffCount: number;
  handoffs: ReadonlyArray<FlowHandoff>;
};

export type FlowSessionSnapshot = Readonly<FlowSessionSnapshotShape>;

export interface FlowPlan {
  config(options?: Partial<FlowResolveOptions>): FlowPlan;
  push(input: FlowInput, metadata?: FlowInputMetadata): FlowPlan;
  on(checkpoint: FlowCheckpoint, observer: FlowObserver): FlowPlan;
  singleton(): FlowPlan;
  snapshot(): FlowSessionSnapshot;
  execute(): AsyncGenerator<Repo>;
}

export interface FlowExtension {
  plan(): FlowPlan;
  config(options?: Partial<FlowResolveOptions>): void;
  push(input: FlowInput, metadata?: FlowInputMetadata): void;
  on(checkpoint: FlowCheckpoint, observer: FlowObserver): void;
  snapshot(): FlowSessionSnapshot;
  execute(): AsyncGenerator<Repo>;
}

type QueuedFlowInput = Readonly<{
  value: string | URL;
  metadata?: FlowInputMetadata;
}>;

function defaultResolveOptions(): FlowResolveOptions {
  return {
    verify: true,
    goal: FLOW_GOAL.firstSuccess,
    continueOnError: true,
    timeoutMs: RESOLVE_TIMEOUT,
  };
}

async function* toInputEntries(inputs: AsyncIterable<QueuedFlowInput>) {
  for await (const input of inputs) {
    yield {
      value: input.value instanceof URL ? input.value.toString() : input.value,
      source: input.metadata?.origin ?? FLOW_INPUT_ORIGIN.input,
      metadata: input.metadata,
    };
  }
}

async function* singleInput(
  value: string | URL,
  metadata?: FlowInputMetadata,
): AsyncGenerator<QueuedFlowInput> {
  yield { value, metadata };
}

async function* toQueuedInputs(
  inputs: AsyncIterable<string | URL>,
  metadata?: FlowInputMetadata,
): AsyncGenerator<QueuedFlowInput> {
  for await (const input of inputs) {
    yield { value: input, metadata };
  }
}

function toInputStream(
  input: FlowInput,
  metadata?: FlowInputMetadata,
): AsyncIterable<QueuedFlowInput> {
  if (typeof input === "string" || input instanceof URL) {
    return singleInput(input, metadata);
  }
  return toQueuedInputs(input, metadata);
}

function identityStage(input: AsyncIterable<Repo>, _context: FlowContext): AsyncIterable<Repo> {
  return input;
}

function createObserverStage(
  checkpoint: FlowCheckpoint,
  session: FlowSession,
  observers: ReadonlyArray<FlowObserver>,
): Stage<Repo, FlowContext> {
  if (observers.length === 0) return identityStage;

  return async function* observe(input, context): AsyncGenerator<Repo> {
    for await (const repo of input) {
      if (checkpoint === FLOW_CHECKPOINT.proposed) {
        session.emittedProposed += 1;
      }
      if (checkpoint === FLOW_CHECKPOINT.verified) {
        session.emittedVerified += 1;
      }
      for (const observer of observers) {
        await observer(repo, context);
      }
      yield repo;
    }
  };
}

async function drainBufferedSources<TItem>(
  queue: BufferedAsyncQueue<TItem>,
  iterator: AsyncIterator<TItem>,
): Promise<Array<TItem>> {
  const sources: Array<TItem> = [];
  while (queue.state().buffered > 0) {
    const next = await iterator.next();
    if (next.done) break;
    sources.push(next.value);
  }
  return sources;
}

function createSession(options: FlowResolveOptions): FlowSession {
  return {
    phase: FLOW_SESSION_PHASE.idle,
    options,
    queue: createBufferedAsyncQueue(),
    observers: {
      proposed: [],
      verified: [],
    },
    startedAt: null,
    endedAt: null,
    lastError: null,
    emittedProposed: 0,
    emittedVerified: 0,
    handoffCount: 0,
    seenInputs: new Set(),
    handoffs: [],
  };
}

function snapshotSession(session: FlowSession): FlowSessionSnapshot {
  return {
    phase: session.phase,
    queuedCount: session.queue.state().buffered,
    observers: {
      proposed: session.observers.proposed.length,
      verified: session.observers.verified.length,
    },
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    lastError: session.lastError,
    emittedProposed: session.emittedProposed,
    emittedVerified: session.emittedVerified,
    handoffCount: session.handoffCount,
    handoffs: [...session.handoffs],
  };
}

export const flowPlugin = plugin({
  id: FLOW_PLUGIN_ID,
  name: "Rekon Flow",
  setup: (ctx) => {
    ctx.addGlobalOption("candidates", {
      type: "boolean",
      default: false,
      description: "Print expanded candidate URLs before verification (no network calls)",
    });
    ctx.addGlobalOption("verified", {
      type: "boolean",
      default: false,
      description: "Output verified repo info without syncing",
    });
    ctx.addGlobalOption("dry-run", {
      type: "boolean",
      default: false,
      description: "Show what would be done without making changes",
    });
    ctx.addGlobalOption("report-lifecycle", {
      type: "boolean",
      default: false,
      description: "Emit structured lifecycle summary per resolved repository",
    });
  },
  extension: (core): FlowExtension => {
    const defaultOptions = defaultResolveOptions();
    const registry = createProviderRegistry([
      githubProvider,
      gitlabProvider,
      tangledProvider,
      cratesIoProvider,
      docsRsProvider,
      npmxDevProvider,
      githubioProvider,
      genericProvider,
    ]);
    const executor = createInputFlowExecutor();
    let session = createSession(defaultOptions);
    let flowExtension: FlowExtension;

    function ensureSessionStarted(target: FlowSession): void {
      if (target.phase !== FLOW_SESSION_PHASE.idle) return;
      target.phase = FLOW_SESSION_PHASE.configured;
    }

    function enqueue(
      target: FlowSession,
      flowInput: FlowInput,
      metadata?: FlowInputMetadata,
    ): void {
      if (target.phase === FLOW_SESSION_PHASE.draining) {
        throw new Error("cannot push while flow session is draining");
      }
      ensureSessionStarted(target);

      if (typeof flowInput === "string" || flowInput instanceof URL) {
        const inputKey = flowInput instanceof URL ? flowInput.toString() : flowInput;
        if (target.seenInputs.has(inputKey)) return;
        target.seenInputs.add(inputKey);

        if (metadata?.origin === FLOW_INPUT_ORIGIN.redirect) {
          target.handoffCount += 1;
          target.handoffs.push({
            fromInput: metadata.fromInput ?? inputKey,
            fromUrl: metadata.fromUrl ?? inputKey,
            fromProvider: metadata.fromProvider ?? "unknown",
            toInput: inputKey,
            toHost: new URL(inputKey).host,
          });
        }
      }

      target.queue.push(toInputStream(flowInput, metadata));
    }

    function config(overrides: Partial<FlowResolveOptions> = {}): void {
      session = createSession({
        ...defaultOptions,
        ...overrides,
      });
      session.phase = FLOW_SESSION_PHASE.configured;
    }

    function push(flowInput: FlowInput, metadata?: FlowInputMetadata): void {
      enqueue(session, flowInput, metadata);
    }

    function on(checkpoint: FlowCheckpoint, observer: FlowObserver): void {
      ensureSessionStarted(session);
      session.observers[checkpoint].push(observer);
    }

    async function* executeSession(target: FlowSession): AsyncGenerator<Repo> {
      ensureSessionStarted(target);
      if (target.phase === FLOW_SESSION_PHASE.executing) {
        throw new Error("flow session is already running");
      }

      target.phase = FLOW_SESSION_PHASE.executing;
      target.startedAt = new Date();
      target.endedAt = null;
      target.lastError = null;
      try {
        const plugins = {
          ...core.extensions,
          [FLOW_PLUGIN_ID]: flowExtension,
        };

        const queueIterator = target.queue.values()[Symbol.asyncIterator]();
        try {
          while (target.queue.state().buffered > 0) {
            const sources = await drainBufferedSources(target.queue, queueIterator);
            const merged = fanIn(sources);
            const signal = AbortSignal.timeout(target.options.timeoutMs);

            yield* executor(toInputEntries(merged), {
              registry,
              options: target.options,
              signal,
              plugins,
              providerRuntime: {
                push: (input, metadata) => enqueue(target, input, metadata),
              },
              proposedStages: [
                createObserverStage(
                  FLOW_CHECKPOINT.proposed,
                  target,
                  target.observers[FLOW_CHECKPOINT.proposed],
                ),
              ],
              verifiedStages: [
                createObserverStage(
                  FLOW_CHECKPOINT.verified,
                  target,
                  target.observers[FLOW_CHECKPOINT.verified],
                ),
              ],
            });
          }
        } finally {
          await queueIterator.return?.();
        }
        target.phase = FLOW_SESSION_PHASE.draining;
        target.phase = FLOW_SESSION_PHASE.completed;
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        target.lastError = normalized;
        target.phase = FLOW_SESSION_PHASE.failed;
        throw normalized;
      } finally {
        target.endedAt = new Date();
        target.queue.close();
        target.observers.proposed = [];
        target.observers.verified = [];
      }
    }

    function execute(): AsyncGenerator<Repo> {
      return executeSession(session);
    }

    function snapshot(): FlowSessionSnapshot {
      return snapshotSession(session);
    }

    function plan(): FlowPlan {
      const planSession = createSession(defaultOptions);
      let planApi: FlowPlan;

      planApi = {
        config(overrides: Partial<FlowResolveOptions> = {}) {
          planSession.options = {
            ...defaultOptions,
            ...overrides,
          };
          planSession.phase = FLOW_SESSION_PHASE.configured;
          return planApi;
        },
        push(flowInput: FlowInput, metadata?: FlowInputMetadata) {
          enqueue(planSession, flowInput, metadata);
          return planApi;
        },
        on(checkpoint: FlowCheckpoint, observer: FlowObserver) {
          ensureSessionStarted(planSession);
          planSession.observers[checkpoint].push(observer);
          return planApi;
        },
        singleton() {
          if (session.phase === FLOW_SESSION_PHASE.executing) {
            throw new Error("cannot replace singleton flow plan while executing");
          }
          session = planSession;
          ensureSessionStarted(session);
          return planApi;
        },
        snapshot() {
          return snapshotSession(planSession);
        },
        execute() {
          if (session !== planSession) {
            session = planSession;
          }
          return executeSession(planSession);
        },
      };

      return planApi;
    }

    flowExtension = {
      plan,
      config,
      push,
      on,
      snapshot,
      execute,
    };

    return flowExtension;
  },
});
