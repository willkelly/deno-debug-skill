# Deno Debugger Skill for Claude

**Transform Claude into an interactive debugger for Deno/TypeScript applications.**

This skill enables Claude to act as a debugging assistant that connects to Deno via the V8 Inspector Protocol, conducts systematic investigations, and generates comprehensive Markdown reports with evidence-based analysis.

## 🎯 What This Skill Does

Claude becomes your debugging partner that:

1. **Connects** to your Deno app via Chrome DevTools Protocol
2. **Investigates** using breakpoints, heap snapshots, and CPU profiling
3. **Tracks** investigation reasoning with breadcrumbs (for complex cases)
4. **Analyzes** data with native TypeScript (no external dependencies)
5. **Reports** findings in clear Markdown with specific recommendations

## 🚀 Quick Start

### 1. Install the Skill

```bash
# Copy to Claude's skills directory
cp -r deno-debugger/ ~/.claude/skills/

# That's it! No dependencies to install - uses Deno stdlib only
```

### 2. Launch Your Deno App with Inspector

```bash
# Start with --inspect (attaches on port 9229)
deno run --inspect --allow-net --allow-read your-app.ts

# Or use --inspect-brk to pause at start
deno run --inspect-brk --allow-net --allow-read your-app.ts
```

### 3. Ask Claude to Debug

```
You: "My Deno app is leaking memory when processing file uploads. Can you investigate?"

Claude: *connects via CDP, systematically investigates, generates REPORT.md*
```

## 📖 Usage Examples

### Memory Leak Investigation

```
You: "Memory grows with each upload and never gets released"

Claude will:
1. Connect to your Deno process (port 9229)
2. Capture baseline heap snapshot
3. Trigger the leak (asks you or does it programmatically)
4. Capture comparison snapshot
5. Calculate growth rate and project OOM timeline
6. Examine source code for retention patterns
7. Generate REPORT.md with:
   - Root cause analysis
   - Code snippets showing the bug
   - Named anti-pattern (e.g., "retain-and-forget")
   - Production impact ("OOM after 22,543 uploads")
   - Specific fix with reasoning
```

### Performance Bottleneck

```
You: "My API responses are slow, can you profile it?"

Claude will:
1. Start CPU profiling
2. Exercise the slow endpoint
3. Identify hot functions
4. Analyze algorithm complexity
5. Generate REPORT.md with:
   - Performance measurements (2.5s → 0.02s)
   - Hot path analysis
   - Algorithm complexity comparison (O(n²) → O(n log n))
   - Optimized implementation
   - Speedup projection (~100x)
```

### Race Condition / Async Bug

```
You: "Sometimes my async operations complete in wrong order"

Claude will:
1. Set breakpoints at async boundaries
2. Trace execution flow
3. Check for missing awaits
4. Identify the race condition
5. Generate REPORT.md with fix and synchronization strategy
```

## 📊 Output Artifacts

Every investigation generates:

- **`investigation_output/REPORT.md`** - Main report (Markdown)
- **`investigation_output/baseline.heapsnapshot`** - Heap before (for memory issues)
- **`investigation_output/after.heapsnapshot`** - Heap after (for memory issues)
- **`investigation_output/investigation.json`** - Breadcrumb timeline (if used)

### Example Report Structure

```markdown
# Investigation Report

**Date**: 2025-11-08
**Issue**: Memory leak in file upload handler

## Summary
Upload handler retains ArrayBuffer objects in global array without cleanup.

## Root Cause
The `handleUpload()` function pushes buffers to `leakedBuffers[]` but never
removes them. Each upload adds ~47 KB that persists for the app lifetime.

## Details
[Code snippet showing the bug with context]
[Anti-pattern explanation]
[Production impact: "OOM after 22,543 uploads (~225 hours)"]

## Location
- File: `app.ts`
- Line: 22
- Function: `handleUpload()`

## Fix
[Optimized code with clear reasoning]
[Why this solution works]

## Data
- Growth: 47 KB per upload
- Projected OOM: After ~22,543 uploads
```

## 🏗️ Architecture

```
deno-debugger/
├── SKILL.md              # Instructions Claude reads (workflow + patterns)
├── README.md             # Installation guide (for users)
├── deno.json             # Deno configuration with tasks
└── scripts/              # Pre-written debugging infrastructure (TypeScript)
    ├── cdp_client.ts     # Chrome DevTools Protocol client
    ├── heap_analyzer.ts  # Heap snapshot parsing
    ├── cpu_profiler.ts   # CPU profile analysis
    ├── breadcrumbs.ts    # Investigation tracking (optional)
    ├── report_gen.ts     # Markdown report generation
    ├── types.ts          # V8 and CDP type definitions
    └── deps.ts           # Deno stdlib dependencies
```

## 🔧 Core Components

### CDP Client (`cdp_client.ts`)

Handles all communication with Deno's V8 Inspector:

```typescript
import { CDPClient } from "./scripts/cdp_client.ts";

const client = new CDPClient("127.0.0.1", 9229);
await client.connect();
await client.enableDebugger();

// Set breakpoint
await client.setBreakpointByUrl("file:///app.ts", 42);

// Resume execution
await client.resume();

// When paused, inspect
const frames = client.getCallFrames();
const vars = await client.getScopeVariables(frames[0].callFrameId);
```

**Features:**
- Native WebSocket API (no external dependencies)
- Deno/Node runtime detection
- Type-safe async/await API
- Heap snapshot capture
- CPU profiling
- Breakpoint management

### Heap Analyzer (`heap_analyzer.ts`)

Parse and analyze V8 heap snapshots:

```typescript
import { loadSnapshot, compareSnapshots } from "./scripts/heap_analyzer.ts";

const snapshot = await loadSnapshot("heap.heapsnapshot");
const summary = snapshot.getNodeSizeSummary();
const nodes = snapshot.getNodesByType("Array");

// Compare two snapshots
const comparison = compareSnapshots(before, after);
console.table(comparison.slice(0, 10));
```

**Features:**
- Native Map/Array data structures (no pandas needed)
- Fast node indexing and lookup
- Retaining path analysis
- Growth comparison

### CPU Profiler (`cpu_profiler.ts`)

Profile CPU usage and find bottlenecks:

```typescript
import { loadProfile, analyzeHotPaths } from "./scripts/cpu_profiler.ts";

const profile = await loadProfile("profile.cpuprofile");
const hotFunctions = profile.getHotFunctions();
const asyncIssues = detectAsyncIssues(profile);
const hotPaths = analyzeHotPaths(profile);
```

**Features:**
- Hot function detection
- Call tree analysis
- Async/await pattern detection
- Optimization issue identification

### Breadcrumbs (`breadcrumbs.ts`)

Track investigation reasoning (optional, for complex investigations):

```typescript
import { Breadcrumbs } from "./scripts/breadcrumbs.ts";

const bc = new Breadcrumbs();

// Track major milestones only
bc.addHypothesis("Memory leak in upload handler",
                 "User reports growth after uploads");

bc.addFinding("ArrayBuffer retention at line 22",
              { growth_mb: 0.05 },
              "critical");

bc.addDecision("Root cause identified",
               "Code shows missing cleanup");

await bc.save("investigation.json");
```

**Use sparingly**: Breadcrumbs track investigative *reasoning*, not every action. See SKILL.md for guidelines.

### Report Generator (`report_gen.ts`)

Generate comprehensive Markdown reports:

```typescript
import { MarkdownReport } from "./scripts/report_gen.ts";

const report = new MarkdownReport("Memory Leak Investigation", bc);

report.addSummary("Upload handler retains ArrayBuffer objects...");
report.addProblem("Memory grows continuously...");
report.addFinding({
  description: "ArrayBuffer objects not being released",
  severity: "critical",
  evidence: ["Heap snapshot shows 500+ retained ArrayBuffers"]
});
report.addRootCause("Global array retains all buffers", "...");
report.addFix("Remove the global array entirely", codeSnippet);

await report.save("REPORT.md");
```

## 🎓 Investigation Patterns

The skill includes three pre-defined patterns in SKILL.md:

### Pattern A: Memory Leak
1. Capture baseline heap
2. Trigger leak
3. Capture comparison
4. Analyze growth
5. Examine code
6. Generate report

### Pattern B: Performance Bottleneck
1. Start CPU profiling
2. Trigger slow operation
3. Analyze hot functions
4. Examine slow code
5. Generate report with optimizations

### Pattern C: Race Condition
1. Set breakpoints at async boundaries
2. Set pause on exceptions
3. Trigger race
4. Inspect state when paused
5. Examine code for missing awaits

## 🎯 What Makes This Unique?

### Pre-written Infrastructure
- Robust CDP client, heap analyzer, profiler already implemented
- Claude uses existing scripts, doesn't write custom debugging code
- Focus on investigation logic, not protocol details

### TypeScript/Deno Native
- Zero external dependencies (Deno stdlib only)
- Type-safe V8 data structures
- Same runtime as apps being debugged
- Simpler installation (no pip, no virtualenv)

### Evidence-Based Reports
- Every claim backed by data
- Code snippets with line numbers
- Production impact calculations (e.g., "OOM after 22,543 uploads")
- Named anti-patterns (e.g., "brute-force", "retain-and-forget")

### Confident Recommendations
- Shows THE best solution (not "Option 1 vs Option 2")
- Explains WHY the fix works
- Includes complexity analysis for performance fixes

### Quality Guidelines
SKILL.md enforces report quality:
- Each section answers a different question (no repetition)
- Specific metrics, not vague terms ("0.24s" not "slow")
- Show the work (code snippets, calculations, reasoning)

## 🧪 Testing

### Try the Skill with Scenarios

Test the skill with realistic debugging scenarios:

```bash
# Run a complete scenario
cd examples/scenarios/1_memory_leak/
./run.sh

# The script will:
# 1. Start a buggy Deno app with --inspect
# 2. Show you a prompt to give Claude
# 3. Let Claude investigate the bug end-to-end
```

**Available scenarios:**
- **1_memory_leak/** - ArrayBuffer accumulation in upload handler
- **2_performance/** - Inefficient algorithms needing optimization

See [examples/scenarios/README.md](examples/scenarios/README.md) for details.

### Run Automated Tests

```bash
# Run all tests with Deno
cd deno-debugger
deno task test

# Or run specific tests
deno test scripts/heap_analyzer_test.ts -v
```

**Test coverage:**
- ✅ CDP connection
- ✅ Heap snapshot parsing
- ✅ CPU profiling
- ✅ Breadcrumb tracking
- ✅ All analysis functions

## 🛠️ Advanced Usage

### Custom Conditional Breakpoints

```typescript
// Break only when condition is true
await client.setBreakpointByUrl("file:///app.ts", 42, 0, "fileSize > 1000000");
```

### Watch Expressions

```typescript
// Monitor value changes
while (!done) {
  const value = await client.evaluate("myVariable");
  console.log("Variable value:", value);
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

### Manual Investigation

You can use the scripts directly for custom investigations:

```typescript
import { CDPClient } from "./deno-debugger/scripts/cdp_client.ts";

async function investigate() {
  const client = new CDPClient("127.0.0.1", 9229);
  await client.connect();
  await client.enableDebugger();

  // Your custom investigation logic here

  await client.close();
}

await investigate();
```

## 📚 Documentation

- **`deno-debugger/SKILL.md`** - Complete workflow and patterns Claude follows
- **`deno-debugger/README.md`** - Installation and usage guide
- **`examples/scenarios/README.md`** - Interactive scenario guide
- **`TESTING.md`** - Test suite documentation
- **`CONTRIBUTING.md`** - Contribution guidelines

## 🤝 Contributing

Contributions welcome! You can:

- Add new analysis functions to `heap_analyzer.ts` or `cpu_profiler.ts`
- Create new investigation patterns in `SKILL.md`
- Add more test scenarios to `examples/scenarios/`
- Improve report quality guidelines
- Add Deno tests for uncovered code paths

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📄 License

MIT License - use freely for your debugging needs!

## 🎯 Next Steps

1. **Install the skill:** Copy `deno-debugger/` to `~/.claude/skills/`
2. **No dependencies needed:** Pure TypeScript using Deno stdlib
3. **Try a scenario:** Run `examples/scenarios/1_memory_leak/run.sh`
4. **Debug your app:** Start with `--inspect` and ask Claude!

**Happy Debugging! 🐛🔍**
