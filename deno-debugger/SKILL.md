---
name: deno-debugger
description: Interactive debugger for Deno/TypeScript applications using the V8 Inspector Protocol. This skill should be used when investigating issues in Deno applications, including memory leaks, performance bottlenecks, race conditions, crashes, or any runtime behavior that requires step-by-step debugging, heap analysis, or CPU profiling. Provides CDP client tools, heap/CPU analyzers, and investigation tracking.
---

# Deno Debugger Skill

Debug Deno/TypeScript applications using the V8 Inspector Protocol with pre-written helper scripts.

## When to Use This Skill

- User reports memory leaks in their Deno application
- API endpoints are slow and need profiling
- Async operations complete in the wrong order (race conditions)
- Application crashes or throws unexpected exceptions
- User wants to understand memory usage or CPU hotspots

## ⚠️ CRITICAL: Use Pre-written Scripts

**DO NOT write your own CDP client, heap analyzer, or profiler code.**

All infrastructure is already implemented in `./scripts/`:
- `cdp_client.py` - Complete CDP WebSocket client
- `heap_analyzer.py` - Heap snapshot parsing and analysis
- `cpu_profiler.py` - CPU profiling and hot path detection
- `breadcrumbs.py` - Investigation state tracking (use sparingly, see below)

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
```python
bc = Breadcrumbs()

# High-level hypothesis
bc.add_hypothesis(
    "Memory leak caused by retained event listeners",
    rationale="User reports memory grows when users navigate between pages"
)

# Major finding that changes direction
bc.add_finding(
    "Found 500+ DOM nodes retained after page navigation",
    data={'node_count': 523, 'size_mb': 12.4},
    severity='critical'
)

# Final decision
bc.add_decision(
    "Root cause: event listeners not cleaned up in destroy()",
    rationale="Heap snapshot shows references from global event bus"
)
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

```python
import asyncio
import sys
from pathlib import Path

# Add scripts to path
sys.path.insert(0, str(Path('./scripts')))

from cdp_client import CDPClient
from breadcrumbs import Breadcrumbs

async def investigate():
    # Initialize investigation tracking
    bc = Breadcrumbs()

    # Connect to Deno inspector
    client = CDPClient('127.0.0.1', 9229)
    await client.connect()

    # Enable debugging
    await client.enable_debugger()

    # Your investigation continues...
```

**DO NOT write a custom CDP client. Use the CDPClient class.**

### 2. Form Hypothesis

Form a clear hypothesis about what's causing the problem. You can optionally record it:

```python
# Optional: Track your initial hypothesis
bc.add_hypothesis(
    "Memory leak in upload handler due to retained buffers",
    rationale="User reports memory grows after each file upload"
)
```

**Note**: Only use breadcrumbs if the investigation is complex enough to warrant tracking your thought process. For simple investigations, skip breadcrumbs entirely.

### 3. Choose Investigation Pattern

Based on the problem type, follow one of these patterns:

#### Pattern A: Memory Leak

```python
import json
from heap_analyzer import HeapSnapshot

# 1. Capture baseline
snapshot1_json = await client.take_heap_snapshot(report_progress=False)
snapshot1 = json.loads(snapshot1_json)

# 2. Trigger the leak (ask user or trigger programmatically)
# ... trigger leak ...

# 3. Capture comparison
snapshot2_json = await client.take_heap_snapshot(report_progress=False)
snapshot2 = json.loads(snapshot2_json)

# 4. Analyze growth
growth = len(snapshot2_json) - len(snapshot1_json)
growth_mb = growth / (1024 * 1024)
print(f"Heap grew by {growth_mb:.2f} MB")

# 5. Analyze the snapshot (optional - may fail with Deno)
# heap = HeapSnapshot(snapshot2)
# stats = heap.get_node_size_summary()
# print(stats.head(10))  # Top object types

# 6. Examine code to find the cause
# [Your code inspection here]
```

#### Pattern B: Performance Bottleneck

```python
from cpu_profiler import CPUProfile

# 1. Start profiling
await client.start_profiling()
print("Profiling started")

# 2. Trigger slow operation
# ... trigger slow code ...
await asyncio.sleep(2)  # Let it run

# 3. Stop and analyze
profile_data = await client.stop_profiling()
profile = CPUProfile(profile_data)

# 4. Find hot functions
hot_functions = profile.get_hot_functions()
print("\nHot functions:")
for func in hot_functions[:5]:
    print(f"  {func['function_name']}: {func['self_time_percent']:.1f}%")

# 5. Examine the slow code to understand why it's expensive
# [Your code inspection here]
```

#### Pattern C: Race Condition

```python
# 1. Set breakpoints at async boundaries
await client.set_breakpoint_by_url('file:///app.ts', 42)
print("Breakpoint set at line 42")

# 2. Set pause on exceptions
await client.set_pause_on_exceptions('all')

# 3. Trigger the race
# ... trigger problematic async code ...

# 4. When paused, inspect state
frames = await client.get_call_frames()
if frames:
    variables = await client.get_scope_variables(frames[0]['callFrameId'])
    print(f"Paused at: {frames[0]['location']}")
    print(f"Variables: {variables}")

# 5. Evaluate expressions to check state
result = await client.evaluate('myVariable.status')
print(f"Variable state: {result}")

# 6. Examine code to find missing awaits or improper synchronization
# [Your code inspection here]
```

### 4. Examine Code

Read the relevant source files to understand the bug:

```python
# Read the problematic file
with open('path/to/app.ts', 'r') as f:
    lines = f.readlines()

# Find the problematic pattern
for i, line in enumerate(lines, 1):
    if 'problematic_pattern' in line:
        bc.add_finding(
            f"Found issue at line {i}",
            data={'line': i, 'code': line.strip()},
            severity='critical'
        )
```

### 5. Analyze and Conclude

Based on your investigation data, determine the root cause. You can optionally record your conclusion:

```python
# Optional: Record your conclusion if using breadcrumbs
bc.add_decision(
    "Root cause identified",
    rationale="Heap snapshot shows ArrayBuffer retention, code shows missing cleanup"
)
```

Most importantly: **Understand the problem well enough to explain it clearly to the user.**

### 6. Save Artifacts

```python
from pathlib import Path
from datetime import datetime

# Create output directory
output_dir = Path('investigation_output')
output_dir.mkdir(exist_ok=True)

# Generate markdown report
# IMPORTANT: Each section answers a DIFFERENT question. Avoid repetition.
timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
report_md = f"""# Investigation Report

**Date**: {timestamp}
**Issue**: [Type of issue - e.g., "Memory leak investigation"]

## Summary

[What's broken? One clear sentence.]
Example: "Upload handler retains ArrayBuffer objects in global array without cleanup."

## Root Cause

[WHY is it broken? Explain the mechanism.]
Example: "The handleUpload() function pushes buffers to leakedBuffers[] for tracking,
but never removes them. Each upload adds ~45KB that persists for the app lifetime."

NOT just: "Buffers accumulate" (that's restating Summary)

## Details

[What ELSE did you learn? Show your evidence.]
- Include relevant code snippets (not just line numbers)
- Explain the anti-pattern or why this is problematic
- Be specific about impact: "~45KB per upload = OOM after 20,000 requests in production"

Example:
```typescript
// Line 22-23 in app.ts:
const leakedBuffers: ArrayBuffer[] = [];  // Global array
leakedBuffers.push(buffer);  // Never cleared

// This is a "retain-and-forget" anti-pattern. The array grows indefinitely
// because buffers are added but never removed after processing completes.
```

Heap grew {growth_mb:.2f} MB in single upload test. At this rate, production
would hit OOM after ~20,000 uploads (assuming 1GB heap limit).

## Location

- File: `[filename]`
- Line: [number]
- Function: `[function_name]()`

## Fix

[What's the solution and WHY does it work?]

Show the BEST solution with clear reasoning. Only include alternatives if they have
legitimate trade-offs (e.g., performance vs simplicity). Don't show clearly inferior
options just to have "multiple choices."

```typescript
// Remove the global array entirely
// Process buffers immediately and discard them.
async function handleUpload(fileSize: number): Promise<string> {{
  const buffer = new ArrayBuffer(fileSize);
  const result = await processBuffer(buffer);
  // Buffer goes out of scope here - eligible for GC
  return result;
}}
```

This eliminates the root cause: no global array means no retention bugs. The buffer
is created, used, and immediately becomes eligible for garbage collection when it
goes out of scope.

Alternative approaches like clearing the array periodically (`leakedBuffers.length = 0`)
are inferior because they still maintain global state and risk retention if exceptions
occur before cleanup.

## Data

- Baseline heap: [X] MB
- After operation: [Y] MB
- Growth: [Z] MB ([percentage]%)
- Rate: ~[X]KB per operation
- Projected OOM: After ~[N] operations
- Snapshots saved to: investigation_output/

"""

with open(output_dir / 'REPORT.md', 'w') as f:
    f.write(report_md)

# Save snapshots (if investigating memory)
if snapshot1_json:
    with open(output_dir / 'baseline.heapsnapshot', 'w') as f:
        f.write(snapshot1_json)
    with open(output_dir / 'after.heapsnapshot', 'w') as f:
        f.write(snapshot2_json)

# Optionally save breadcrumbs if used
if bc:
    bc.save(output_dir / 'investigation.json')

# Close connection
await client.close()
```

### 7. Present Findings

When investigation is complete, present your findings to the user as a clear, conversational summary:

**Example:**

```
I found the memory leak! 🎯

The issue is in `upload_handler.ts` at line 42. The `processUpload()` function
creates ArrayBuffer objects but never releases them. Each upload adds ~50MB to
a global `pendingUploads` array that never gets cleared.

Fix:
Add this cleanup after processing:
  pendingUploads.length = 0;  // Clear after each batch

Or better yet, don't store them at all - process and discard immediately.

I've saved the investigation to investigation_output/:
- REPORT.md - Full investigation report
- baseline.heapsnapshot - Before state (8.8 MB)
- after.heapsnapshot - After state (8.9 MB)
- investigation.json - Investigation timeline (if breadcrumbs used)
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

```python
import asyncio
import json
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path('./scripts')))

from cdp_client import CDPClient

async def investigate_memory_leak():
    print("Starting memory leak investigation...")

    # Connect
    client = CDPClient('127.0.0.1', 9229)
    await client.connect()
    await client.enable_debugger()

    print("Connected to Deno inspector")

    # Baseline snapshot
    print("\nCapturing baseline...")
    snapshot1_json = await client.take_heap_snapshot()
    baseline_size = len(snapshot1_json) / (1024 * 1024)  # MB
    print(f"Baseline: {baseline_size:.2f} MB")

    # Trigger leak
    print("\nTrigger the leak now (or I'll wait 5 seconds)...")
    await asyncio.sleep(5)

    # Comparison snapshot
    print("Capturing comparison snapshot...")
    snapshot2_json = await client.take_heap_snapshot()
    after_size = len(snapshot2_json) / (1024 * 1024)  # MB

    # Analyze
    growth = len(snapshot2_json) - len(snapshot1_json)
    growth_mb = growth / (1024 * 1024)
    print(f"After: {after_size:.2f} MB (grew {growth_mb:.2f} MB)")

    # Read and examine the source code
    print("\nExamining source code...")
    # [Your code inspection logic here]

    # Save artifacts
    output_dir = Path('investigation_output')
    output_dir.mkdir(exist_ok=True)

    with open(output_dir / 'baseline.heapsnapshot', 'w') as f:
        f.write(snapshot1_json)
    with open(output_dir / 'after.heapsnapshot', 'w') as f:
        f.write(snapshot2_json)

    # Generate report (following the new guidelines)
    growth_kb = growth / 1024
    uploads_to_oom = (1024 * 1024 * 1024) / growth  # 1GB heap limit

    report = f"""# Memory Leak Investigation

**Date**: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Summary

Upload handler retains ArrayBuffer objects in global array without cleanup.

## Root Cause

The `handleUpload()` function pushes buffers to `pendingUploads[]` for tracking,
but never removes them. Each upload adds ~{growth_kb:.0f} KB that persists for
the application lifetime.

## Details

```typescript
// Line 13-22 in upload_handler.ts:
const pendingUploads: ArrayBuffer[] = [];  // Global array

async function handleUpload(fileSize: number) {{
  const buffer = new ArrayBuffer(fileSize);
  pendingUploads.push(buffer);  // BUG: Never cleared!
  await processBuffer(buffer);
}}
```

This is a "retain-and-forget" anti-pattern. The array grows indefinitely because
buffers are added but never removed after processing completes. There's no cleanup
logic in error handlers or success paths.

Heap grew {growth_mb:.2f} MB in single upload test. At this rate, production would
hit OOM after ~{uploads_to_oom:,.0f} uploads (assuming 1GB heap limit).

## Location

- File: `upload_handler.ts`
- Line: 22
- Function: `handleUpload()`

## Fix

```typescript
// Remove the global array entirely
async function handleUpload(fileSize: number): Promise<string> {{
  const buffer = new ArrayBuffer(fileSize);
  const result = await processBuffer(buffer);
  // Buffer goes out of scope here - eligible for GC
  return result;
}}
```

This eliminates the root cause: no global array means no retention bugs. The buffer
is created, used, and immediately becomes eligible for garbage collection.

Clearing the array periodically (`pendingUploads.length = 0`) would be inferior
because it maintains global state and risks retention if exceptions occur before cleanup.

## Data

- Baseline heap: {baseline_size:.2f} MB
- After operation: {after_size:.2f} MB
- Growth: {growth_mb:.2f} MB ({(growth / len(snapshot1_json)) * 100:.2f}%)
- Rate: ~{growth_kb:.0f} KB per upload
- Projected OOM: After ~{uploads_to_oom:,.0f} uploads
- Snapshots saved to: investigation_output/
"""

    with open(output_dir / 'REPORT.md', 'w') as f:
        f.write(report)

    await client.close()

    print(f"\n✓ Investigation complete! See {output_dir}/REPORT.md")

# Run it
asyncio.run(investigate_memory_leak())
```

## API Reference

### CDPClient Methods

```python
client = CDPClient('127.0.0.1', 9229)
await client.connect()

# Debugging
await client.enable_debugger()
await client.set_breakpoint_by_url('file:///app.ts', 42)
await client.resume()
await client.step_over()

# Inspection
frames = await client.get_call_frames()
variables = await client.get_scope_variables(frame_id)
result = await client.evaluate('expression')

# Profiling
snapshot_json = await client.take_heap_snapshot()
await client.start_profiling()
profile_data = await client.stop_profiling()

await client.close()
```

### Breadcrumbs Methods (Optional)

**Only use for complex investigations where tracking your thought process adds value.**

```python
bc = Breadcrumbs()

# Track major milestones only
bc.add_hypothesis(description, rationale="why")
bc.add_finding(description, data={}, severity='info|warning|critical')
bc.add_decision(description, rationale="why")

# Save for later review
bc.save('investigation.json')
```

Note: Don't use `add_test()` for routine actions. Reserve breadcrumbs for significant investigative decisions.

### HeapSnapshot Methods

```python
from heap_analyzer import HeapSnapshot
import json

snapshot = HeapSnapshot(json.loads(snapshot_json))
stats = snapshot.get_node_size_summary()  # Returns pandas DataFrame
nodes = snapshot.get_nodes_by_type('Array')
path = snapshot.find_retaining_path(node_id)
```

### CPUProfile Methods

```python
from cpu_profiler import CPUProfile

profile = CPUProfile(profile_data)
hot = profile.get_hot_functions()  # List of dicts with function_name, self_time_percent
issues = profile.detect_async_issues()
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

✅ **DO** use CDPClient from cdp_client.py
✅ **DO** use HeapSnapshot from heap_analyzer.py
✅ **DO** use CPUProfile from cpu_profiler.py
✅ **DO** use breadcrumbs only for major milestones
✅ **DO** save snapshots and investigation timeline

---

**Remember**: All the infrastructure is already built. Your job is to use these tools to investigate methodically, track your findings, and present clear results to the user.
