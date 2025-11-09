---
name: deno-debugger
description: Interactive debugger for Deno/TypeScript applications using the V8 Inspector Protocol. This skill should be used when investigating issues in Deno applications, including memory leaks, performance bottlenecks, race conditions, crashes, or any runtime behavior that requires step-by-step debugging, heap analysis, or CPU profiling. Provides CDP client tools, heap/CPU analyzers, and investigation tracking.
---

# Deno Debugger Skill

Debug Deno/TypeScript applications using the V8 Inspector Protocol with pre-written TypeScript helper scripts.

## When to Use This Skill

- User reports memory leaks in their Deno application
- API endpoints are slow and need profiling
- Async operations complete in the wrong order (race conditions)
- Application crashes or throws unexpected exceptions
- User wants to understand memory usage or CPU hotspots

## ⚠️ CRITICAL: Use Pre-written Scripts

**DO NOT write your own CDP client, heap analyzer, or profiler code.**

All infrastructure is already implemented in `./scripts/`:
- `cdp_client.ts` - Complete CDP WebSocket client
- `heap_analyzer.ts` - Heap snapshot parsing and analysis
- `cpu_profiler.ts` - CPU profiling and hot path detection
- `breadcrumbs.ts` - Investigation state tracking (use sparingly, see below)
- `report_gen.ts` - Markdown report generation

Your job is to **use these scripts** to investigate, not rewrite them.

## Breadcrumb Usage Guidelines

**Purpose of Breadcrumbs:**

Breadcrumbs create a timeline of your investigative *reasoning*, not just your actions. They answer:
- "What did I think was wrong, and why?"
- "What evidence changed my thinking?"
- "Why did I focus on X instead of Y?"
- "How did I arrive at this conclusion?"

This is valuable because:
1. **Review and learning** - Later, you or others can understand the investigation process
2. **Debugging the debugging** - If the conclusion was wrong, see where reasoning went off track
3. **Knowledge transfer** - Team members can learn investigation techniques
4. **Complex investigations** - When exploring multiple hypotheses, breadcrumbs prevent getting lost

**Use breadcrumbs to track your investigation state, NOT as a log of every action.**

Use breadcrumbs for:
- ✅ Initial hypothesis about the problem
- ✅ Major decision points (e.g., "focusing on heap analysis vs CPU profiling")
- ✅ Key findings that change your understanding
- ✅ Final conclusion

Do NOT use breadcrumbs for:
- ❌ Every file read or code inspection
- ❌ Routine actions like "connecting to inspector"
- ❌ Small intermediate steps
- ❌ Things already visible in the final report

**Example of good breadcrumb use:**
```typescript
const bc = new Breadcrumbs();

// High-level hypothesis
bc.addHypothesis(
  "Memory leak caused by retained event listeners",
  "User reports memory grows when users navigate between pages"
);

// Major finding that changes direction
bc.addFinding(
  "Found 500+ DOM nodes retained after page navigation",
  { node_count: 523, size_mb: 12.4 },
  "critical"
);

// Final decision
bc.addDecision(
  "Root cause: event listeners not cleaned up in destroy()",
  "Heap snapshot shows references from global event bus"
);
```

The breadcrumb timeline is for YOU to track your thinking, not a transcript of every action.

## Prerequisites

The user must start their Deno app with inspector enabled:
```bash
deno run --inspect=127.0.0.1:9229 --allow-net --allow-read app.ts
```

Or to pause at startup:
```bash
deno run --inspect-brk=127.0.0.1:9229 --allow-net app.ts
```

## Workflow

Make a todo list for all tasks in this workflow and work through them one at a time.

### 1. Setup and Connect

**Import the pre-written helper scripts:**

```typescript
import { CDPClient } from "./scripts/cdp_client.ts";
import { Breadcrumbs } from "./scripts/breadcrumbs.ts";

async function investigate() {
  // Initialize investigation tracking (optional for complex cases)
  const bc = new Breadcrumbs();

  // Connect to Deno inspector
  const client = new CDPClient("127.0.0.1", 9229);
  await client.connect();

  // Enable debugging
  await client.enableDebugger();

  // Your investigation continues...
}
```

**DO NOT write a custom CDP client. Use the CDPClient class.**

### 2. Form Hypothesis

Form a clear hypothesis about what's causing the problem. You can optionally record it:

```typescript
// Optional: Track your initial hypothesis
bc.addHypothesis(
  "Memory leak in upload handler due to retained buffers",
  "User reports memory grows after each file upload"
);
```

**Note**: Only use breadcrumbs if the investigation is complex enough to warrant tracking your thought process. For simple investigations, skip breadcrumbs entirely.

### 3. Choose Investigation Pattern

Based on the problem type, follow one of these patterns:

#### Pattern A: Memory Leak

**IMPORTANT: For large heaps (>100MB), use the FAST comparison mode to avoid 3+ hour waits!**

```typescript
import { compareSnapshotsFast } from "./scripts/heap_analyzer.ts";
import type { CDPClient } from "./scripts/cdp_client.ts";

// 1. Capture baseline
console.log("Capturing baseline snapshot...");
await client.takeHeapSnapshot("investigation_output/baseline.heapsnapshot");
const baseline_size = (await Deno.stat("investigation_output/baseline.heapsnapshot")).size / (1024 * 1024);
console.log(`Baseline: ${baseline_size.toFixed(2)} MB`);

// 2. Trigger the leak (ask user or trigger programmatically)
console.log("\nTrigger the leak now...");
// User triggers leak or you make HTTP request, etc.
await new Promise(resolve => setTimeout(resolve, 5000)); // Wait

// 3. Capture comparison
console.log("Capturing comparison snapshot...");
await client.takeHeapSnapshot("investigation_output/after.heapsnapshot");
const after_size = (await Deno.stat("investigation_output/after.heapsnapshot")).size / (1024 * 1024);

// 4. Analyze growth
const growth_mb = after_size - baseline_size;
console.log(`After: ${after_size.toFixed(2)} MB (grew ${growth_mb.toFixed(2)} MB)`);

// 5. FAST: Compare snapshots using summary-only mode
// This skips edges and retention paths (10-50x faster for large heaps)
const comparison = await compareSnapshotsFast(
  "investigation_output/baseline.heapsnapshot",
  "investigation_output/after.heapsnapshot"
);

console.log("\nTop 10 growing objects:");
console.table(comparison.slice(0, 10).map(row => ({
  Type: row.nodeType,
  Name: row.name.substring(0, 40),
  "Count Δ": row.countDelta,
  "Size Δ (MB)": (row.sizeDelta / (1024 * 1024)).toFixed(2),
})));

// 6. If you need retaining paths for specific objects, load with full mode:
// (Only do this if compareSnapshotsFast wasn't enough)
/*
import { loadSnapshot } from "./scripts/heap_analyzer.ts";

const afterSnapshot = await loadSnapshot("investigation_output/after.heapsnapshot");
const suspiciousNode = afterSnapshot.nodes.find(n => n.name === "LeakyObject");
if (suspiciousNode) {
  const path = afterSnapshot.findRetainingPath(suspiciousNode.id);
  console.log("Why is this object retained?", path);
}
*/

// 7. Examine code to find the cause
const sourceCode = await Deno.readTextFile("path/to/app.ts");
// [Your code inspection here]
```

**Performance Guide:**

| Heap Size | compareSnapshotsFast() | loadSnapshot() + compareSnapshots() |
|-----------|------------------------|-------------------------------------|
| <10 MB | ~2 seconds | ~5 seconds |
| 100 MB | ~8 seconds | ~2 minutes |
| 900 MB | ~20 seconds | ~3 hours ❌ |

**When to use full mode:**
- ✅ Use `compareSnapshotsFast()` FIRST (always!)
- ✅ Only load full snapshots if you need retaining paths
- ✅ Narrow down to specific objects before loading full snapshots

#### Pattern B: Performance Bottleneck

```typescript
import { startProfiling, stopProfiling, analyzeHotPaths } from "./scripts/cpu_profiler.ts";

// 1. Start profiling
await startProfiling(client);
console.log("Profiling started");

// 2. Trigger slow operation
console.log("Trigger the slow operation now...");
// User triggers slow code or you make request
await new Promise(resolve => setTimeout(resolve, 2000)); // Let it run

// 3. Stop and analyze
const profile = await stopProfiling(client, "investigation_output/profile.cpuprofile");

// 4. Find hot functions
const hotFunctions = profile.getHotFunctions();
console.log("\nHot functions:");
for (const func of hotFunctions.slice(0, 5)) {
  console.log(`  ${func.functionName}: ${func.totalPct.toFixed(1)}% total, ${func.selfPct.toFixed(1)}% self`);
}

// 5. Analyze hot paths
const hotPaths = analyzeHotPaths(profile);
console.table(hotPaths.slice(0, 5));

// 6. Examine the slow code to understand why it's expensive
const sourceCode = await Deno.readTextFile("path/to/slow_file.ts");
// [Your code inspection here]
```

#### Pattern C: Race Condition / Concurrency Bug

**Key Challenge:** Race conditions are timing-dependent and hard to reproduce consistently.

**Strategy:** Use conditional breakpoints to catch the race only when it occurs.

```typescript
// 1. Set CONDITIONAL breakpoints to catch specific states
// Break only when lock is already claimed (race condition!)
await client.setBreakpointByUrl(
  "file:///app.ts",
  130,  // Line where we check lock state
  0,
  "lock.state !== 'available'"  // ← CONDITION: Only break if lock not available
);

// Break when version increments unexpectedly (indicates concurrent modification)
await client.setBreakpointByUrl(
  "file:///app.ts",
  167,
  0,
  "lock.version > expectedVersion"  // ← CONDITION: Version jumped
);

console.log("✓ Conditional breakpoints set for race detection");

// 2. Set pause on exceptions (catches errors from race)
await client.setPauseOnExceptions("all");

// 3. Generate concurrent requests to trigger the race
// Need many concurrent attempts to hit the timing window
console.log("Generating 100 concurrent requests to trigger race...");

const requests = [];
for (let i = 0; i < 100; i++) {
  requests.push(
    fetch("http://localhost:8081/acquire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lockId: "test-lock",
        clientId: `client-${i}`,
      }),
    })
  );
}

// Fire all requests concurrently
const responses = await Promise.all(requests);

// 4. If race occurs, breakpoint will trigger
// When paused, inspect the state
const frames = client.getCallFrames();
if (frames.length > 0) {
  const variables = await client.getScopeVariables(frames[0].callFrameId);
  console.log(`🔴 Breakpoint hit!`);
  console.log(`Location: ${frames[0].functionName} line ${frames[0].location.lineNumber}`);
  console.log(`Variables:`, variables);

  // Evaluate lock state
  const lockState = await client.evaluate("lock.state");
  const lockOwner = await client.evaluate("lock.owner");
  const lockVersion = await client.evaluate("lock.version");

  console.log(`Lock state: ${lockState}`);
  console.log(`Lock owner: ${lockOwner}`);
  console.log(`Lock version: ${lockVersion}`);
}

// 5. Check results for race condition evidence
const successes = responses.filter(r => r.ok);
const results = await Promise.all(successes.map(r => r.json()));
const acquiredCount = results.filter(r => r.success).length;

console.log(`\n📊 Results:`);
console.log(`  Total requests: ${responses.length}`);
console.log(`  Successful acquires: ${acquiredCount}`);
console.log(`  Expected: 1`);
console.log(`  Race detected: ${acquiredCount > 1 ? '❌ YES' : '✅ NO'}`);

// 6. Examine code to understand the race window
const sourceCode = await Deno.readTextFile("path/to/async_file.ts");
// Look for:
// - Check-then-act patterns (TOCTOU)
// - Async gaps between read and write
// - Missing atomic operations
```

**Race Condition Debugging Tips:**

1. **Conditional breakpoints are essential** - Don't waste time on non-race executions
2. **Run many concurrent requests** - Races have low probability (1-5%)
3. **Watch for version/state changes** - Indicates concurrent modification
4. **Look for async gaps** - Time between check and update is the race window
5. **Check timing** - Use `Date.now()` to measure gaps between operations

**Common Race Patterns:**

```typescript
// BAD: Check-then-act with async gap
if (lock.state === "available") {  // ← Check
  await someAsyncOperation();      // ← GAP (race window!)
  lock.state = "acquired";         // ← Act
}

// GOOD: Atomic check-and-act
const wasAvailable = lock.state === "available";
lock.state = wasAvailable ? "acquired" : lock.state;
if (!wasAvailable) throw new Error("Lock unavailable");
```

### 4. Examine Code

Read the relevant source files to understand the bug:

```typescript
// Read the problematic file
const code = await Deno.readTextFile("path/to/app.ts");
const lines = code.split("\n");

// Find the problematic pattern
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("problematic_pattern")) {
    bc.addFinding(
      `Found issue at line ${i + 1}`,
      { line: i + 1, code: lines[i].trim() },
      "critical"
    );
  }
}
```

### 5. Analyze and Conclude

Based on your investigation data, determine the root cause. You can optionally record your conclusion:

```typescript
// Optional: Record your conclusion if using breadcrumbs
bc.addDecision(
  "Root cause identified",
  "Heap snapshot shows ArrayBuffer retention, code shows missing cleanup"
);
```

Most importantly: **Understand the problem well enough to explain it clearly to the user.**

### 6. Save Artifacts

```typescript
import { MarkdownReport } from "./scripts/report_gen.ts";

// Create output directory
await Deno.mkdir("investigation_output", { recursive: true });

// Generate comprehensive markdown report
const report = new MarkdownReport("Memory Leak Investigation", bc);

// Add summary
report.addSummary(
  "Upload handler retains ArrayBuffer objects in global array without cleanup."
);

// Add problem description
report.addProblem(
  "Memory usage grows continuously with each file upload and never stabilizes."
);

// Add findings
report.addFinding({
  description: "ArrayBuffer objects not being released",
  severity: "critical",
  details: `Heap grew ${growth_mb.toFixed(2)} MB after single upload. ` +
           `At this rate, production would hit OOM after ~${Math.floor(1024 / growth_mb)} uploads.`,
  evidence: [
    "Heap snapshot shows 500+ retained ArrayBuffers",
    `Global array 'leakedBuffers' grows by ~${(growth_mb * 1024).toFixed(0)} KB per upload`,
    "No cleanup code in success or error paths"
  ]
});

// Add code snippet showing the bug
report.addCodeSnippet(
  "typescript",
  `// Line 22-23 in app.ts:
const leakedBuffers: ArrayBuffer[] = [];  // Global array
leakedBuffers.push(buffer);  // Never cleared`,
  "Problematic code",
  "app.ts:22"
);

// Add root cause explanation
report.addRootCause(
  "Event listeners not cleaned up in destroy()",
  "The handleUpload() function pushes buffers to leakedBuffers[] for tracking, " +
  "but never removes them. Each upload adds ~45KB that persists for the app lifetime. " +
  "This is a 'retain-and-forget' anti-pattern."
);

// Add fix with code
report.addFix(
  "Remove the global array entirely. Process buffers immediately and discard them.",
  {
    language: "typescript",
    code: `// Remove the global array entirely
async function handleUpload(fileSize: number): Promise<string> {
  const buffer = new ArrayBuffer(fileSize);
  const result = await processBuffer(buffer);
  // Buffer goes out of scope here - eligible for GC
  return result;
}`,
    caption: "Recommended fix"
  }
);

// Add data table
report.addDataTable("Investigation Metrics", [
  { Metric: "Baseline heap", Value: `${baseline_size.toFixed(2)} MB` },
  { Metric: "After operation", Value: `${after_size.toFixed(2)} MB` },
  { Metric: "Growth", Value: `${growth_mb.toFixed(2)} MB` },
  { Metric: "Growth per upload", Value: `~${(growth_mb * 1024).toFixed(0)} KB` },
  { Metric: "Projected OOM", Value: `After ~${Math.floor(1024 / growth_mb)} uploads` }
]);

// Save report
await report.save("investigation_output/REPORT.md");

// Optionally save breadcrumbs if used
if (bc && bc.breadcrumbs.length > 0) {
  await bc.save("investigation_output/investigation.json");
}

// Close connection
await client.close();
```

### 7. Present Findings

When investigation is complete, present your findings to the user as a clear, conversational summary:

**Example:**

```
I found the memory leak! 🎯

The issue is in `app.ts` at line 22. The `handleUpload()` function creates
ArrayBuffer objects but never releases them. Each upload adds ~45KB to a global
`leakedBuffers` array that never gets cleared.

Fix:
Remove the global array entirely and process buffers immediately:

```typescript
async function handleUpload(fileSize: number): Promise<string> {
  const buffer = new ArrayBuffer(fileSize);
  const result = await processBuffer(buffer);
  return result; // Buffer becomes eligible for GC
}
```

I've saved the investigation to investigation_output/:
- REPORT.md - Full investigation report
- baseline.heapsnapshot - Before state (8.8 MB)
- after.heapsnapshot - After state (8.9 MB)
- investigation.json - Investigation timeline
```

**Guidelines for presenting findings:**
- Be conversational and clear
- Lead with the root cause
- Explain WHY it's happening, not just WHAT
- Provide a specific, actionable fix
- Reference where artifacts are saved

**IMPORTANT**: Always save artifacts before presenting findings.

## Complete Example: Memory Leak Investigation

Here's a complete end-to-end investigation you can use as a template:

```typescript
import { CDPClient } from "./scripts/cdp_client.ts";
import { captureSnapshot, compareSnapshots } from "./scripts/heap_analyzer.ts";
import { MarkdownReport } from "./scripts/report_gen.ts";
import { Breadcrumbs } from "./scripts/breadcrumbs.ts";

async function investigateMemoryLeak() {
  console.log("Starting memory leak investigation...");

  // Optional: Track investigation reasoning
  const bc = new Breadcrumbs("memory_leak_investigation");
  bc.addHypothesis(
    "Upload handler retains file buffers",
    "User reports memory grows with each upload"
  );

  // Connect
  const client = new CDPClient("127.0.0.1", 9229);
  await client.connect();
  await client.enableDebugger();
  console.log("Connected to Deno inspector");

  // Create output directory
  await Deno.mkdir("investigation_output", { recursive: true });

  // Baseline snapshot
  console.log("\nCapturing baseline...");
  const snapshot1 = await captureSnapshot(
    client,
    "investigation_output/baseline.heapsnapshot"
  );
  const baseline_size = (await Deno.stat("investigation_output/baseline.heapsnapshot")).size / (1024 * 1024);
  console.log(`Baseline: ${baseline_size.toFixed(2)} MB`);

  // Trigger leak
  console.log("\nTrigger the leak now (waiting 5 seconds)...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Comparison snapshot
  console.log("Capturing comparison snapshot...");
  const snapshot2 = await captureSnapshot(
    client,
    "investigation_output/after.heapsnapshot"
  );
  const after_size = (await Deno.stat("investigation_output/after.heapsnapshot")).size / (1024 * 1024);

  // Analyze
  const growth_mb = after_size - baseline_size;
  console.log(`After: ${after_size.toFixed(2)} MB (grew ${growth_mb.toFixed(2)} MB)`);

  // Record finding
  bc.addFinding(
    "Heap grew significantly after upload",
    { growth_mb, baseline_size, after_size },
    "critical"
  );

  // Compare snapshots
  const comparison = compareSnapshots(snapshot1, snapshot2);
  console.log("\nTop growing objects:");
  console.table(comparison.slice(0, 10));

  // Examine source code
  console.log("\nExamining source code...");
  const appCode = await Deno.readTextFile("path/to/app.ts");
  // [Code inspection logic would go here]

  bc.addDecision(
    "Root cause: global array retains buffers",
    "Code shows leakedBuffers[] array with no cleanup"
  );

  // Generate comprehensive report
  const report = new MarkdownReport("Memory Leak Investigation", bc);

  report.addSummary(
    "Upload handler retains ArrayBuffer objects in global array without cleanup."
  );

  report.addProblem(
    "Memory grows continuously with each file upload and never stabilizes. " +
    "Production would hit OOM after ~20,000 uploads."
  );

  report.addFinding({
    description: "ArrayBuffer objects not being released",
    severity: "critical",
    details: `Heap grew ${growth_mb.toFixed(2)} MB after single upload.`,
    evidence: [
      "Heap snapshot shows retained ArrayBuffers",
      `Global array grows by ~${(growth_mb * 1024).toFixed(0)} KB per upload`,
      "No cleanup in error or success paths"
    ]
  });

  report.addCodeSnippet(
    "typescript",
    `const leakedBuffers: ArrayBuffer[] = [];
async function handleUpload(fileSize: number) {
  const buffer = new ArrayBuffer(fileSize);
  leakedBuffers.push(buffer);  // BUG: Never cleared!
  await processBuffer(buffer);
}`,
    "Problematic code",
    "app.ts:22"
  );

  report.addRootCause(
    "Global array retains all buffers indefinitely",
    "The handleUpload() function pushes buffers to leakedBuffers[] but never " +
    "removes them. This is a 'retain-and-forget' anti-pattern."
  );

  report.addFix(
    "Remove the global array entirely. Process buffers immediately and discard.",
    {
      language: "typescript",
      code: `async function handleUpload(fileSize: number): Promise<string> {
  const buffer = new ArrayBuffer(fileSize);
  const result = await processBuffer(buffer);
  return result; // Buffer becomes eligible for GC
}`,
      caption: "Recommended fix"
    }
  );

  report.addDataTable("Metrics", [
    { Metric: "Baseline heap", Value: `${baseline_size.toFixed(2)} MB` },
    { Metric: "After operation", Value: `${after_size.toFixed(2)} MB` },
    { Metric: "Growth", Value: `${growth_mb.toFixed(2)} MB` },
    { Metric: "Projected OOM", Value: `~${Math.floor(1024 / growth_mb)} uploads` }
  ]);

  await report.save("investigation_output/REPORT.md");
  await bc.save("investigation_output/investigation.json");
  await client.close();

  console.log("\n✓ Investigation complete! See investigation_output/REPORT.md");
}

// Run it
await investigateMemoryLeak();
```

## API Reference

### CDPClient Methods

```typescript
const client = new CDPClient("127.0.0.1", 9229);
await client.connect();

// Debugging
await client.enableDebugger();
await client.setBreakpointByUrl("file:///app.ts", 42);
await client.resume();
await client.stepOver();

// Inspection
const frames = client.getCallFrames();
const variables = await client.getScopeVariables(frameId);
const result = await client.evaluate("expression");

// Profiling
const snapshotJson = await client.takeHeapSnapshot();
await client.startProfiling();
const profileData = await client.stopProfiling();

await client.close();
```

### Breadcrumbs Methods (Optional)

**Only use for complex investigations where tracking your thought process adds value.**

```typescript
const bc = new Breadcrumbs();

// Track major milestones only
bc.addHypothesis(description, rationale);
bc.addFinding(description, data, severity); // severity: "info" | "warning" | "critical"
bc.addDecision(description, rationale);

// Save for later review
await bc.save("investigation.json");
```

### HeapSnapshot Methods

```typescript
import { loadSnapshot, compareSnapshots, findLargestObjects } from "./scripts/heap_analyzer.ts";

const snapshot = await loadSnapshot("heap.heapsnapshot");
const summary = snapshot.getNodeSizeSummary();
const nodes = snapshot.getNodesByType("Array");
const path = snapshot.findRetainingPath(nodeId);

// Compare two snapshots
const comparison = compareSnapshots(before, after);

// Find largest objects
const largest = findLargestObjects(snapshot);
```

### CPUProfile Methods

```typescript
import { loadProfile, analyzeHotPaths, detectAsyncIssues } from "./scripts/cpu_profiler.ts";

const profile = await loadProfile("profile.cpuprofile");
const hot = profile.getHotFunctions(); // Array of hot functions
const issues = detectAsyncIssues(profile);
const paths = analyzeHotPaths(profile);
```

## Key Principles

1. **Always use pre-written scripts** - Never write your own CDP client
2. **Use breadcrumbs sparingly** - Track major milestones, not every action
3. **Save artifacts** - Snapshots, profiles, investigation timeline
4. **Communicate clearly** - Explain what you're doing and why
5. **Be methodical** - Form hypothesis → test → analyze → conclude

## Common Mistakes to Avoid

❌ **DON'T** write a new CDP WebSocket client
❌ **DON'T** parse heap snapshots manually
❌ **DON'T** write custom profiling code
❌ **DON'T** use breadcrumbs for every small action
❌ **DON'T** forget to save artifacts

✅ **DO** use CDPClient from cdp_client.ts
✅ **DO** use HeapSnapshot from heap_analyzer.ts
✅ **DO** use CPUProfile from cpu_profiler.ts
✅ **DO** use breadcrumbs only for major milestones
✅ **DO** save snapshots and investigation timeline

---

**Remember**: All the infrastructure is already built. Your job is to use these tools to investigate methodically, track your findings, and present clear results to the user.
