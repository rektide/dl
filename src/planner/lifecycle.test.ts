import { describe, expect, test } from "vitest";
import { flowLifecycleRecords } from "./lifecycle.ts";
import { REPO_STATE, type Repo } from "../flow/types.ts";
import type { FlowHandoff } from "../plugin/flow.ts";

function createRepo(): Repo {
  return {
    id: "github:org/repo",
    input: "https://github.com/org/repo",
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

describe("flowLifecycleRecords", () => {
  test("creates redirect handoff records for the current repo input", () => {
    const handoffs: Array<FlowHandoff> = [
      {
        fromInput: "crates.io/crates/serde",
        fromUrl: "https://github.com/serde-rs/serde",
        fromProvider: "crates-io",
        toInput: "https://github.com/serde-rs/serde",
        toHost: "github.com",
      },
      {
        fromInput: "npm/react",
        fromUrl: "https://github.com/org/repo",
        fromProvider: "npmx-dev",
        toInput: "https://github.com/org/repo",
        toHost: "github.com",
      },
    ];

    expect(flowLifecycleRecords(createRepo(), handoffs)).toEqual([
      {
        step: "flow",
        source: "npmx-dev -> flow.push",
        status: "ok",
        transition: "redirect-handoff",
        details: {
          fromInput: "npm/react",
          fromUrl: "https://github.com/org/repo",
          toInput: "https://github.com/org/repo",
          toHost: "github.com",
        },
      },
    ]);
  });
});
