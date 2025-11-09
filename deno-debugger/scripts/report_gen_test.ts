/**
 * Tests for Markdown report generation
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MarkdownReport } from "./report_gen.ts";
import { Breadcrumbs } from "./breadcrumbs.ts";

Deno.test("MarkdownReport - constructor creates instance", () => {
  const report = new MarkdownReport("Test Report");
  assertExists(report);
});

Deno.test("MarkdownReport - can add summary", () => {
  const report = new MarkdownReport("Test");
  report.addSummary("This is a test summary");
  // If no errors, test passes
  assertExists(report);
});

Deno.test("MarkdownReport - can add code snippet", () => {
  const report = new MarkdownReport("Test");
  report.addCodeSnippet("typescript", "const x = 42;", "Example code");
  assertExists(report);
});

Deno.test("MarkdownReport - can add finding", () => {
  const report = new MarkdownReport("Test");
  report.addFinding({
    description: "Memory leak detected",
    severity: "critical",
    evidence: ["Heap snapshot shows growth"],
  });
  assertExists(report);
});

Deno.test("MarkdownReport - generates markdown", async () => {
  const report = new MarkdownReport("Test Investigation");
  report.addSummary("Test summary");
  report.addProblem("Test problem");

  const tempFile = await Deno.makeTempFile({ suffix: ".md" });
  try {
    await report.save(tempFile);
    const content = await Deno.readTextFile(tempFile);

    assertExists(content);
    assertEquals(content.includes("Test Investigation"), true);
    assertEquals(content.includes("Test summary"), true);
  } finally {
    await Deno.remove(tempFile);
  }
});

Deno.test("MarkdownReport - works with breadcrumbs", () => {
  const bc = new Breadcrumbs("test");
  bc.addHypothesis("Test hypothesis");

  const report = new MarkdownReport("Test", bc);
  report.addTimeline();

  assertExists(report);
});
