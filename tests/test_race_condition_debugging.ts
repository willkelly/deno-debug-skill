/**
 * Test Race Condition Debugging on Medium Breakfix Scenario
 * Demonstrates conditional breakpoints and concurrent request analysis
 */

import { CDPClient } from "./deno-debugger/scripts/cdp_client.ts";
import {
  generateConcurrentRequests,
  analyzeForRace,
  printRaceAnalysis,
} from "./deno-debugger/scripts/concurrent_helper.ts";

async function testRaceDebugging() {
  console.log("=== Race Condition Debugging Test ===");
  console.log("Testing on Medium Breakfix: Distributed Lock Manager\n");

  // Connect to inspector
  console.log("Connecting to Deno inspector...");
  const client = new CDPClient("127.0.0.1", 9229);
  await client.connect();
  await client.enableDebugger();
  console.log("✓ Connected\n");

  // Test 1: Verify race exists without debugger
  console.log("Test 1: Detecting race condition with concurrent requests");
  console.log("─".repeat(60));

  const results = await generateConcurrentRequests({
    url: "http://localhost:8081/acquire",
    method: "POST",
    body: {
      lockId: "test-lock",
      clientId: "test-client",
      ttl: 5000,
    },
    count: 100,
  });

  const analysis = analyzeForRace(
    results,
    (r) => r.body?.success === true,
    1  // Only 1 should succeed for a lock
  );

  printRaceAnalysis(analysis);

  if (!analysis.raceDetected) {
    console.log("\n⚠️  Race not reproduced in this run. Try again or increase request count.");
    console.log("   Race conditions are probabilistic (~1-5% occurrence).");
  }

  // Test 2: Set conditional breakpoints
  console.log("\n\nTest 2: Setting conditional breakpoints for race detection");
  console.log("─".repeat(60));

  try {
    // Get the script URL
    console.log("Finding script ID for medium/app.ts...");

    // Conditional breakpoint: Break when lock state isn't available
    // (This indicates a race - someone else already claimed it)
    const bp1 = await client.setBreakpointByUrl(
      "file:///.*medium/app.ts",
      130,  // Line: if (lock.state !== "available")
      0,
      'lock.state !== "available" && lock.owner !== clientId'
    );
    console.log(`✓ Conditional breakpoint #1: Break when lock already claimed`);
    console.log(`  Breakpoint ID: ${bp1}`);

    // Conditional breakpoint: Break on version jump (concurrent modification)
    const bp2 = await client.setBreakpointByUrl(
      "file:///.*medium/app.ts",
      167,  // Line: lock.version++
      0,
      "lock.version > 2"  // Suspicious if version jumps quickly
    );
    console.log(`✓ Conditional breakpoint #2: Break on version jump`);
    console.log(`  Breakpoint ID: ${bp2}`);

    console.log("\nConditional breakpoints are now active.");
    console.log("They will ONLY trigger when the race condition occurs.");

  } catch (error) {
    console.log(`Note: Breakpoints may not resolve (app not running or different path)`);
    console.log(`Error: ${error}`);
  }

  // Test 3: Demonstrate race pattern analysis
  console.log("\n\nTest 3: Analyzing race pattern from results");
  console.log("─".repeat(60));

  const winners = results.filter(r => r.body?.success === true);

  if (winners.length > 1) {
    console.log("\n🔍 Race Condition Confirmed!\n");
    console.log("Winners (requests that successfully acquired the lock):");

    for (const winner of winners) {
      console.log(`  Request ${winner.index}:`);
      console.log(`    Start time: ${winner.startTime}`);
      console.log(`    End time:   ${winner.endTime}`);
      console.log(`    Duration:   ${winner.duration}ms`);
      console.log(`    Lock data:  ${JSON.stringify(winner.body?.lock)}`);
    }

    // Calculate timing overlap
    console.log("\nTiming Analysis:");
    for (let i = 0; i < winners.length - 1; i++) {
      const w1 = winners[i];
      const w2 = winners[i + 1];
      const gap = w2.startTime - w1.startTime;
      const overlap = Math.min(w1.endTime, w2.endTime) - Math.max(w1.startTime, w2.startTime);

      console.log(`  Winners ${i} and ${i+1}:`);
      console.log(`    Start gap:      ${gap}ms`);
      console.log(`    Execution overlap: ${overlap > 0 ? overlap + 'ms' : 'none'}`);
      console.log(`    ⚠️  ${overlap > 0 ? 'CONCURRENT EXECUTION DETECTED' : 'Sequential'}`);
    }
  } else {
    console.log("\nNo race detected in this run.");
    console.log("This is expected - races are probabilistic.");
  }

  // Test 4: Show the race pattern
  console.log("\n\nTest 4: Understanding the TOCTOU race pattern");
  console.log("─".repeat(60));

  console.log(`
Race Window in medium/app.ts:

┌─ Request A ─────────────────────────┐  ┌─ Request B ─────────────────────────┐
│                                     │  │                                     │
│ Line 130: Check lock.state          │  │                                     │
│   → state === "available" ✓         │  │                                     │
│                                     │  │ Line 130: Check lock.state          │
│                                     │  │   → state === "available" ✓         │
│                                     │  │                                     │
│ Line 150: await simulateDelay()     │  │ Line 150: await simulateDelay()     │
│   ← GAP (race window!) ─────────────┼──┼─ GAP (race window!)                │
│                                     │  │                                     │
│ Line 157: lock.state = "acquiring"  │  │ Line 157: lock.state = "acquiring"  │
│ Line 163: lock.owner = clientId     │  │ Line 163: lock.owner = clientId     │
│   ❌ BOTH SUCCEED!                  │  │   ❌ BOTH SUCCEED!                  │
└─────────────────────────────────────┘  └─────────────────────────────────────┘

The bug: Between checking lock.state (line 130) and updating it (line 157),
another request can also pass the check. Both proceed to acquire the lock.

Fix: Make check and update atomic (no async gap between them).
`);

  console.log("\n" + "=".repeat(60));
  console.log("DEBUGGING SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total requests sent:     ${results.length}`);
  console.log(`Successful acquires:     ${winners.length}`);
  console.log(`Expected:                1`);
  console.log(`Race detected:           ${winners.length > 1 ? "❌ YES" : "✅ NO"}`);
  console.log("");
  console.log("Tools used:");
  console.log("  ✓ Concurrent request generator");
  console.log("  ✓ Race condition analyzer");
  console.log("  ✓ Conditional breakpoints (when race occurs)");
  console.log("  ✓ Timing overlap analysis");
  console.log("=".repeat(60));

  await client.close();
  console.log("\n✓ Test complete");
}

if (import.meta.main) {
  testRaceDebugging().catch(console.error);
}
