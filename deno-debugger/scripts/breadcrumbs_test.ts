/**
 * Tests for breadcrumbs tracking system
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Breadcrumbs } from "./breadcrumbs.ts";

Deno.test("Breadcrumbs - constructor creates instance", () => {
  const bc = new Breadcrumbs("test_investigation");
  assertExists(bc);
  assertEquals(bc.investigationName, "test_investigation");
  assertEquals(bc.breadcrumbs.length, 0);
});

Deno.test("Breadcrumbs - addHypothesis adds hypothesis breadcrumb", () => {
  const bc = new Breadcrumbs();
  bc.addHypothesis("Test hypothesis", "Test rationale");
  assertEquals(bc.breadcrumbs.length, 1);
  assertEquals(bc.breadcrumbs[0].type, "hypothesis");
  assertEquals(bc.breadcrumbs[0].description, "Test hypothesis");
});

Deno.test("Breadcrumbs - addFinding adds finding breadcrumb", () => {
  const bc = new Breadcrumbs();
  bc.addFinding("Test finding", { value: 42 }, "critical");
  assertEquals(bc.breadcrumbs.length, 1);
  assertEquals(bc.breadcrumbs[0].type, "finding");
  assertEquals(bc.breadcrumbs[0].data?.severity, "critical");
});

Deno.test("Breadcrumbs - addDecision adds decision breadcrumb", () => {
  const bc = new Breadcrumbs();
  bc.addDecision("Test decision", "Test rationale", ["alt1", "alt2"]);
  assertEquals(bc.breadcrumbs.length, 1);
  assertEquals(bc.breadcrumbs[0].type, "decision");
});

Deno.test("Breadcrumbs - getByType filters correctly", () => {
  const bc = new Breadcrumbs();
  bc.addHypothesis("H1");
  bc.addFinding("F1");
  bc.addHypothesis("H2");

  const hypotheses = bc.getByType("hypothesis");
  assertEquals(hypotheses.length, 2);
  assertEquals(hypotheses[0].description, "H1");
  assertEquals(hypotheses[1].description, "H2");
});

Deno.test("Breadcrumbs - getSummary returns correct summary", () => {
  const bc = new Breadcrumbs("test");
  bc.addHypothesis("H1");
  bc.addTest("T1", "Test 1");
  bc.addFinding("F1");
  bc.addDecision("D1", "Rationale");

  const summary = bc.getSummary();
  assertEquals(summary.investigationName, "test");
  assertEquals(summary.breadcrumbCount, 4);
  assertEquals(summary.typeCounts.hypothesis, 1);
  assertEquals(summary.typeCounts.test, 1);
  assertEquals(summary.typeCounts.finding, 1);
  assertEquals(summary.typeCounts.decision, 1);
});

Deno.test("Breadcrumbs - toMarkdownTimeline generates markdown", () => {
  const bc = new Breadcrumbs("test");
  bc.addHypothesis("Test hypothesis");

  const markdown = bc.toMarkdownTimeline();
  assertExists(markdown);
  assertEquals(markdown.includes("# Investigation Timeline: test"), true);
  assertEquals(markdown.includes("Test hypothesis"), true);
});

Deno.test("Breadcrumbs - save and load work correctly", async () => {
  const tempFile = await Deno.makeTempFile({ suffix: ".json" });

  try {
    const bc = new Breadcrumbs("save_test");
    bc.addHypothesis("H1", "R1");
    bc.addFinding("F1", { data: 123 });

    await bc.save(tempFile);

    const loaded = await Breadcrumbs.load(tempFile);
    assertEquals(loaded.investigationName, "save_test");
    assertEquals(loaded.breadcrumbs.length, 2);
    assertEquals(loaded.breadcrumbs[0].description, "H1");
    assertEquals(loaded.breadcrumbs[1].description, "F1");
  } finally {
    await Deno.remove(tempFile);
  }
});
