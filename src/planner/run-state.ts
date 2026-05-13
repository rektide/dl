// pattern: Imperative Shell

import type { Repo } from "../flow/types.ts";
import type { ActionRunState, RepoFacts } from "./types.ts";

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

export function createActionRunState(): ActionRunState {
  let hadError = false;
  const repoErrors = new Set<string>();
  const facts = new Map<string, RepoFacts>();
  const recordedKeys = new Set<string>();

  return {
    hadError: () => hadError,
    hadErrorFor: (repo) => repoErrors.has(repoKey(repo)),
    markError: (repo, _bindingId, _error) => {
      hadError = true;
      repoErrors.add(repoKey(repo));
    },
    factsFor: (repo) => {
      const key = repoKey(repo);
      const existing = facts.get(key);
      if (existing) return existing;
      const created = createFacts();
      facts.set(key, created);
      return created;
    },
    record: (key: string) => {
      recordedKeys.add(key);
    },
    recorded: (key: string) => recordedKeys.has(key),
  };
}
