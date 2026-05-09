import { describe, expect, test } from "vitest";
import { REPO_STATE, type FlowContext, type Repo } from "../flow/types.ts";
import type { Binding } from "./types.ts";
import { createActionRunState } from "./run-state.ts";
import { createBindingStage } from "./stages.ts";

function createRepo(): Repo {
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
  };
}

async function* oneRepo(repo: Repo): AsyncGenerator<Repo> {
  yield repo;
}

describe("planner binding stages", () => {
  test("runs bindings with per-repo facts and records errors without dropping repos", async () => {
    const repo = createRepo();
    const run = createActionRunState({ reportLifecycle: false, log: null });
    const seen: Array<string | null> = [];
    const bindings: Array<Binding> = [
      {
        id: "remember",
        kind: "action",
        plugin: "test",
        stage: "materialize",
        state: "ensure",
        run: async (ctx) => {
          ctx.facts.set("destination", "/tmp/archive/org/repo");
        },
      },
      {
        id: "read",
        kind: "action",
        plugin: "test",
        stage: "link",
        state: "ensure",
        run: async (ctx) => {
          seen.push(ctx.facts.get<string>("destination") ?? null);
          ctx.markError(new Error("expected failure"));
        },
      },
    ];

    const stage = createBindingStage({
      bindings,
      run,
      services: {} as never,
      args: { intent: { enabled: () => false, state: () => "off" } } as never,
    });
    const output = [];
    for await (const item of stage(oneRepo(repo), { plugins: {} } as FlowContext)) {
      output.push(item);
    }

    expect(output).toEqual([repo]);
    expect(seen).toEqual(["/tmp/archive/org/repo"]);
    expect(run.hadError()).toBe(true);
  });
});
