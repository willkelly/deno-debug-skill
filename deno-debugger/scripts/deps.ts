/**
 * Centralized dependency imports for the Deno debugger skill.
 * Using Deno standard library - no external dependencies needed.
 */

// Standard library assertions for testing
export { assertEquals, assertExists, assertRejects } from "jsr:@std/assert@1";

// Command line argument parsing
export { parseArgs } from "jsr:@std/cli@1/parse-args";
