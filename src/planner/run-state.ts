// pattern: Imperative Shell

import type { LifecycleRecord, LifecycleReporter } from "../action/lifecycle.ts";
import { createLifecycleReporter } from "../action/lifecycle.ts";
import type { LogExtension } from "../plugin/log.ts";
import type { Repo } from "../flow/types.ts";
import type { ActionRunState, RepoFacts } from "./types.ts";

type CreateActionRunStateOptions = Readonly<{
  reportLifecycle: boolean;
  log: LogExtension | null;
}>;

function repoKey(repo: Repo): string {
  return repo.id || repo.url.toString();
}

function createFacts(): RepoFacts {
  const values = new Map<string, unknown>();
  return {
    get: <T>(key: string): T | null => (values.get(key) as T | undefined) ?? null,
    set: <T>(key: string, value: T): void => {
      values.set(key, value);
    },
  };
}

export function createActionRunState(_options: CreateActionRunStateOptions): ActionRunState {
  let hadError = false;
  const repoErrors = new Set<string>();
  const facts = new Map<string, RepoFacts>();
  const reporters = new Map<string, LifecycleReporter>();
  const recordedKeys = new Set<string>();

  return {
    hadError: () => hadError,
    hadErrorFor: (repo) => repoErrors.has(repoKey(repo)),
    markError: (repo, bindingId, error) => {
      hadError = true;
      repoErrors.add(repoKey(repo));
      const message =
        error instanceof Error
          ? error.message
          : error === undefined
            ? "unknown error"
            : String(error);
      reporters.get(repoKey(repo))?.failed({
        step: bindingId as never,
        source: bindingId,
        transition: "error",
        details: { message },
      });
    },
    factsFor: (repo) => {
      const key = repoKey(repo);
      const existing = facts.get(key);
      if (existing) return existing;
      const created = createFacts();
      facts.set(key, created);
      return created;
    },
    reporterFor: (repo, initialRecords: ReadonlyArray<LifecycleRecord> = []) => {
      const key = repoKey(repo);
      const existing = reporters.get(key);
      if (existing) return existing;
      const reporter = createLifecycleReporter(repo.url.toString(), initialRecords);
      reporters.set(key, reporter);
      return reporter;
    },
    record: (key: string) => {
      recordedKeys.add(key);
    },
    recorded: (key: string) => recordedKeys.has(key),
  };
}
