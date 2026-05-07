import { describe, expect, test } from "vitest";
import { createArgs } from "./args.ts";
import type { ActionSpec } from "./types.ts";

const archiveSpec: ActionSpec = {
  name: "archive",
  description: "Archive checkout action",
  defaultState: "ensure",
  states: ["ensure", "off"],
};

const wikiSpec: ActionSpec = {
  name: "wiki",
  description: "Wiki checkout action",
  defaultState: "ensure",
  states: ["ensure", "off"],
};

describe("createArgs", () => {
  test("turns default actions off when a view-only command is requested", () => {
    const args = createArgs({
      specs: [archiveSpec, wikiSpec],
      values: { candidates: true },
      explicit: {},
      tokens: [],
    });

    expect(args.actionState(archiveSpec)).toBe("off");
    expect(args.actionState(wikiSpec)).toBe("off");
    expect(args.hasActionIntent()).toBe(false);
    expect(args.hasViewIntent()).toBe(true);
  });

  test("runs only explicit actions when any action flag is explicit", () => {
    const args = createArgs({
      specs: [archiveSpec, wikiSpec],
      values: {},
      explicit: { wiki: true },
      tokens: [],
    });

    expect(args.actionState(archiveSpec)).toBe("off");
    expect(args.actionState(wikiSpec)).toBe("ensure");
    expect(args.hasActionIntent()).toBe(true);
  });

  test("subcommand override runs one action and disables the rest", () => {
    const args = createArgs({
      specs: [archiveSpec, wikiSpec],
      values: {},
      explicit: {},
      tokens: [],
      actionOverride: { name: "archive", state: "off" },
    });

    expect(args.actionState(archiveSpec)).toBe("off");
    expect(args.actionState(wikiSpec)).toBe("off");
    expect(args.hasActionIntent()).toBe(true);
  });
});
