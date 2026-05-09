import { describe, expect, test } from "vitest";
import { createArgs } from "./args.ts";
import type { ActionSpec } from "./types.ts";

const archiveSpec: ActionSpec = {
  name: "archive",
  description: "Archive checkout action",
  role: "effect",
  defaultParticipation: "default",
  suppressesDefaultsWhenExplicit: true,
  defaultState: "ensure",
  states: ["ensure", "off"],
};

const wikiSpec: ActionSpec = {
  name: "wiki",
  description: "Wiki checkout action",
  role: "effect",
  defaultParticipation: "default",
  suppressesDefaultsWhenExplicit: true,
  defaultState: "ensure",
  states: ["ensure", "off"],
};

const candidatesSpec: ActionSpec = {
  name: "candidates",
  description: "Candidate repo view",
  role: "view",
  defaultParticipation: "explicit-only",
  suppressesDefaultsWhenExplicit: true,
  defaultState: "enabled",
  states: ["enabled", "off"],
};

describe("createArgs", () => {
  test("delegates to intent for view-only commands", () => {
    const args = createArgs({
      specs: [archiveSpec, wikiSpec, candidatesSpec],
      values: { candidates: true },
      explicit: { candidates: true },
      tokens: [],
    });

    expect(args.intent.enabled("archive")).toBe(false);
    expect(args.intent.enabled("wiki")).toBe(false);
    expect(args.intent.suppressedDefaults).toBe(true);
  });

  test("runs only explicit actions when any action flag is explicit", () => {
    const args = createArgs({
      specs: [archiveSpec, wikiSpec],
      values: {},
      explicit: { wiki: true },
      tokens: [],
    });

    expect(args.intent.enabled("archive")).toBe(false);
    expect(args.intent.enabled("wiki")).toBe(true);
    expect(args.intent.state("wiki")).toBe("ensure");
  });

  test("subcommand selection runs one action and disables the rest", () => {
    const args = createArgs({
      specs: [archiveSpec, wikiSpec],
      values: {},
      explicit: {},
      tokens: [],
      subcommand: { name: "archive", state: "off" },
    });

    expect(args.intent.state("archive")).toBe("off");
    expect(args.intent.enabled("wiki")).toBe(false);
  });
});
