import { describe, expect, test } from "vitest";
import { createInvocationIntent } from "./intent.ts";
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

const githubWikiSpec: ActionSpec = {
  name: "github-wiki",
  description: "GitHub Wiki checkout action",
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

const reportSpec: ActionSpec = {
  name: "report-lifecycle",
  description: "Lifecycle report output",
  role: "report",
  defaultParticipation: "explicit-only",
  suppressesDefaultsWhenExplicit: false,
  defaultState: "enabled",
  states: ["enabled", "off"],
};

const dryRunSpec: ActionSpec = {
  name: "dry-run",
  description: "Dry-run mode",
  role: "mode",
  defaultParticipation: "explicit-only",
  suppressesDefaultsWhenExplicit: false,
  defaultState: "enabled",
  states: ["enabled", "off"],
};

const specs = [archiveSpec, githubWikiSpec, candidatesSpec, reportSpec, dryRunSpec];

describe("createInvocationIntent", () => {
  test("selects default effect actions when no action is explicit", () => {
    const intent = createInvocationIntent({ specs, values: {}, explicit: {}, tokens: [] });

    expect(intent.enabled("archive")).toBe(true);
    expect(intent.enabled("github-wiki")).toBe(true);
    expect(intent.enabled("candidates")).toBe(false);
    expect(intent.enabled("report-lifecycle")).toBe(false);
    expect(intent.suppressedDefaults).toBe(false);
  });

  test("explicit suppressing view disables default effects", () => {
    const intent = createInvocationIntent({
      specs,
      values: { candidates: true },
      explicit: { candidates: true },
      tokens: [],
    });

    expect(intent.enabled("candidates")).toBe(true);
    expect(intent.enabled("archive")).toBe(false);
    expect(intent.enabled("github-wiki")).toBe(false);
    expect(intent.suppressedDefaults).toBe(true);
  });

  test("explicit mode action does not suppress default effects", () => {
    const intent = createInvocationIntent({
      specs,
      values: { "dry-run": true },
      explicit: { "dry-run": true },
      tokens: [],
    });

    expect(intent.enabled("dry-run")).toBe(true);
    expect(intent.enabled("archive")).toBe(true);
    expect(intent.enabled("github-wiki")).toBe(true);
    expect(intent.suppressedDefaults).toBe(false);
  });

  test("explicit effect selects only itself from default effects", () => {
    const intent = createInvocationIntent({
      specs,
      values: { archive: true },
      explicit: { archive: true },
      tokens: [],
    });

    expect(intent.enabled("archive")).toBe(true);
    expect(intent.enabled("github-wiki")).toBe(false);
    expect(intent.enabled("candidates")).toBe(false);
    expect(intent.suppressedDefaults).toBe(true);
  });

  test("subcommand selection selects one effect while allowing explicit reports", () => {
    const intent = createInvocationIntent({
      specs,
      values: { "report-lifecycle": true },
      explicit: { "report-lifecycle": true },
      tokens: [],
      subcommand: { name: "archive", state: "ensure" },
    });

    expect(intent.enabled("archive")).toBe(true);
    expect(intent.enabled("github-wiki")).toBe(false);
    expect(intent.enabled("report-lifecycle")).toBe(true);
    expect(intent.subcommand).toEqual({ name: "archive", state: "ensure" });
  });
});
