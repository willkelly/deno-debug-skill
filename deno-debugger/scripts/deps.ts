/**
 * Centralized dependency imports for the Deno debugger skill.
 * Using Deno standard library.
 */

// Standard library assertions for testing
export {
  assertEquals,
  assertExists,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// Command line argument parsing
export { parseArgs } from "https://deno.land/std@0.224.0/cli/parse_args.ts";
