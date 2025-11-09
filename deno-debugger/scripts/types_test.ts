/**
 * Tests for type definitions
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Breadcrumb, BreadcrumbType } from "./types.ts";

Deno.test("Types - BreadcrumbType is defined", () => {
  const types: BreadcrumbType[] = ["hypothesis", "test", "finding", "decision"];
  assertEquals(types.length, 4);
});

Deno.test("Types - Breadcrumb interface is usable", () => {
  const breadcrumb: Breadcrumb = {
    timestamp: new Date().toISOString(),
    type: "hypothesis",
    description: "Test breadcrumb",
    data: { key: "value" },
    tags: ["test"],
  };

  assertExists(breadcrumb);
  assertEquals(breadcrumb.type, "hypothesis");
  assertEquals(breadcrumb.description, "Test breadcrumb");
});
