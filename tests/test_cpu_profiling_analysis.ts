/**
 * Test CPU Profiling Analysis on Hard Breakfix Scenario
 * Demonstrates flamegraph generation and O(n²) complexity detection
 */

import { CDPClient } from "../deno-debugger/scripts/cdp_client.ts";
import {
  analyzeComplexity,
  analyzeProfile,
  printComplexityAnalysis,
  saveFlamegraphHTML,
} from "../deno-debugger/scripts/cpu_profiler.ts";

async function testCPUProfiling() {
  console.log("=== CPU Profiling Analysis Test ===");
  console.log("Testing on Hard Breakfix: Media Processing Service\n");

  // Connect to inspector
  console.log("Connecting to Deno inspector...");
  const client = new CDPClient("127.0.0.1", 9229);
  await client.connect();
  await client.enableDebugger();
  await client.enableProfiler();
  console.log("✓ Connected\n");

  // Test: Profile the O(n²) endpoint
  console.log("Test: Profiling /process endpoint with 100 images");
  console.log("─".repeat(60));

  console.log("\nStarting CPU profiler...");
  await client.startProfiling();
  console.log("✓ Profiler started");

  console.log("\nTriggering workload: POST /process with 100 images...");
  const startTime = Date.now();

  try {
    const response = await fetch("http://localhost:8083/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: Array.from({ length: 100 }, (_, i) => ({
          id: `img-${i}`,
          url: `http://example.com/image${i}.jpg`,
          format: "jpeg",
        })),
      }),
    });

    const result = await response.json();
    const duration = Date.now() - startTime;

    console.log(`✓ Request completed in ${duration}ms`);
    console.log(`  Processed ${result.results.length} images`);
  } catch (error) {
    console.log(`⚠️  Request failed: ${error}`);
    console.log("  (This is expected if app not running)");
  }

  console.log("\nStopping profiler and collecting data...");
  const profile = await client.stopProfiling();
  console.log("✓ Profile collected");

  // Analyze profile
  console.log("\n" + "=".repeat(60));
  console.log("STANDARD PROFILE ANALYSIS");
  console.log("=".repeat(60));

  const analysis = analyzeProfile(profile);

  console.log("\nTop 10 Functions by Total Time:");
  console.log("─".repeat(60));
  for (let i = 0; i < Math.min(10, analysis.hotFunctions.length); i++) {
    const func = analysis.hotFunctions[i];
    const pct = (func.totalTime / analysis.totalDuration * 100).toFixed(1);
    console.log(`${i + 1}. ${func.functionName}`);
    console.log(`   Total: ${func.totalTime.toFixed(1)}ms (${pct}%)`);
    console.log(`   Self:  ${func.selfTime.toFixed(1)}ms`);
    console.log(`   Calls: ${func.hitCount}`);
  }

  // NEW: Complexity Analysis
  console.log("\n" + "=".repeat(60));
  console.log("ALGORITHMIC COMPLEXITY ANALYSIS");
  console.log("=".repeat(60));

  const complexityIssues = analyzeComplexity(profile);
  printComplexityAnalysis(complexityIssues);

  // Verify O(n²) detection
  const criticalIssues = complexityIssues.filter((i) => i.severity === "critical");
  const hasChecksumIssue = criticalIssues.some((i) =>
    i.functionName.includes("calculateChecksum") ||
    i.functionName.includes("checksum")
  );

  console.log("\n" + "=".repeat(60));
  console.log("VERIFICATION");
  console.log("=".repeat(60));
  console.log(`Critical issues found:     ${criticalIssues.length}`);
  console.log(`Checksum O(n²) detected:   ${hasChecksumIssue ? "✅ YES" : "❌ NO"}`);

  if (hasChecksumIssue) {
    console.log("\n✅ Successfully detected O(n²) checksum bottleneck!");
  } else {
    console.log("\n⚠️  Expected to find calculateChecksum() as critical issue");
    console.log("    This may indicate the function was optimized or not exercised");
  }

  // NEW: Flamegraph Generation
  console.log("\n" + "=".repeat(60));
  console.log("FLAMEGRAPH GENERATION");
  console.log("=".repeat(60));

  const flamegraphPath = "./hard_breakfix_flamegraph.html";
  await saveFlamegraphHTML(profile, flamegraphPath);
  console.log(`✅ Flamegraph saved to: ${flamegraphPath}`);
  console.log("\nTo view:");
  console.log(`  1. Open ${flamegraphPath} in your browser`);
  console.log("  2. Upload to https://speedscope.app");
  console.log("  3. Look for wide bars (high total time) and tall stacks (deep calls)");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEBUGGING SUMMARY");
  console.log("=".repeat(60));
  console.log(`Profile duration:        ${analysis.totalDuration.toFixed(0)}ms`);
  console.log(`Hot functions found:     ${analysis.hotFunctions.length}`);
  console.log(`Complexity issues:       ${complexityIssues.length}`);
  console.log(
    `  - Critical:            ${complexityIssues.filter((i) => i.severity === "critical").length}`,
  );
  console.log(
    `  - Warning:             ${complexityIssues.filter((i) => i.severity === "warning").length}`,
  );
  console.log(
    `  - Info:                ${complexityIssues.filter((i) => i.severity === "info").length}`,
  );
  console.log("");
  console.log("Tools used:");
  console.log("  ✓ CPU profiler with sampling");
  console.log("  ✓ Automatic O(n²) detection");
  console.log("  ✓ Flamegraph visualization");
  console.log("  ✓ Hot function analysis");
  console.log("=".repeat(60));

  await client.close();
  console.log("\n✓ Test complete");
}

if (import.meta.main) {
  testCPUProfiling().catch(console.error);
}
