import { describe, expect, test } from "vitest";
import { createLifecycleReporter } from "./lifecycle.ts";
describe("createLifecycleReporter", () => {
  test("records normalized step events", () => {
    const reporter = createLifecycleReporter("https://github.com/org/repo");

    reporter.ok({
      step: "archive",
      source: "syncArchive -> git.cloneOrUpdate",
      transition: "updated",
      details: { destination: "/tmp/archive/org/repo" },
    });
    reporter.skipped({
      step: "github-wiki",
      source: "syncGitHubWiki",
      transition: "not-applicable",
    });

    const summary = reporter.summary(false);

    expect(summary.repoUrl).toBe("https://github.com/org/repo");
    expect(summary.hadError).toBe(false);
    expect(summary.records).toEqual([
      {
        step: "archive",
        source: "syncArchive -> git.cloneOrUpdate",
        status: "ok",
        transition: "updated",
        details: { destination: "/tmp/archive/org/repo" },
      },
      {
        step: "github-wiki",
        source: "syncGitHubWiki",
        status: "skipped",
        transition: "not-applicable",
        details: {},
      },
    ]);
  });

  test("stores null repo URL when unresolved", () => {
    const reporter = createLifecycleReporter(null);

    reporter.failed({
      step: "pipeline",
      source: "processRepoContext",
      transition: "error",
      details: { message: "explode" },
    });

    const summary = reporter.summary(true);
    expect(summary.repoUrl).toBeNull();
    expect(summary.hadError).toBe(true);
    expect(summary.records).toHaveLength(1);
    expect(summary.records[0]?.status).toBe("failed");
  });
});
