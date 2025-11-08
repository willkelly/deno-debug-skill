---
name: deno-debugger
description: Interactive debugger for Deno/TypeScript applications using the V8 Inspector Protocol. This skill should be used when investigating issues in Deno applications, including memory leaks, performance bottlenecks, race conditions, crashes, or any runtime behavior that requires step-by-step debugging, heap analysis, or CPU profiling. Provides CDP client tools, heap/CPU analyzers, breadcrumb tracking, and automated Org mode report generation.
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
- `breadcrumbs.py` - Investigation timeline tracking
- `visualize.py` - Flamegraphs and charts
- `org_report.py` - Org mode report generation

Your job is to **use these scripts** to investigate, not rewrite them.

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

Record your initial hypothesis about the problem:

```python
bc.add_hypothesis(
    "Memory leak in upload handler due to retained buffers",
    rationale="User reports memory grows after each file upload"
)
```

### 3. Choose Investigation Pattern

Based on the problem type, follow one of these patterns:

#### Pattern A: Memory Leak

```python
import json
from heap_analyzer import HeapSnapshot

# 1. Capture baseline
bc.add_test('baseline_snapshot', 'Capturing initial heap state')
snapshot1_json = await client.take_heap_snapshot(report_progress=False)
snapshot1 = json.loads(snapshot1_json)

# 2. Trigger the leak (ask user or trigger programmatically)
# ... trigger leak ...

# 3. Capture comparison
bc.add_test('comparison_snapshot', 'Capturing heap after leak')
snapshot2_json = await client.take_heap_snapshot(report_progress=False)
snapshot2 = json.loads(snapshot2_json)

# 4. Analyze growth
growth = len(snapshot2_json) - len(snapshot1_json)
bc.add_finding(
    f"Heap grew by {growth:,} bytes",
    data={'growth_bytes': growth},
    severity='warning'
)

# 5. Analyze the snapshot
heap = HeapSnapshot(snapshot2)
stats = heap.get_node_size_summary()
print(stats.head(10))  # Top object types

# 6. Record findings
bc.add_finding(
    "Found large ArrayBuffer objects in heap",
    data={'count': 100, 'size_mb': 50},
    severity='critical'
)
```

#### Pattern B: Performance Bottleneck

```python
from cpu_profiler import CPUProfile

# 1. Start profiling
bc.add_test('cpu_profiling', 'Profiling slow operation')
await client.start_profiling()

# 2. Trigger slow operation
# ... trigger slow code ...
await asyncio.sleep(2)  # Let it run

# 3. Stop and analyze
profile_data = await client.stop_profiling()
profile = CPUProfile(profile_data)

# 4. Find hot functions
hot_functions = profile.get_hot_functions()
for func in hot_functions[:5]:
    print(f"{func['function_name']}: {func['self_time_percent']:.1f}%")

# 5. Record findings
bc.add_finding(
    f"Found bottleneck in {hot_functions[0]['function_name']}",
    data={'cpu_percent': hot_functions[0]['self_time_percent']},
    severity='critical'
)
```

#### Pattern C: Race Condition

```python
# 1. Set breakpoints at async boundaries
await client.set_breakpoint_by_url('file:///app.ts', 42)

# 2. Set pause on exceptions
await client.set_pause_on_exceptions('all')

# 3. Trigger the race
# ... trigger problematic async code ...

# 4. When paused, inspect state
frames = await client.get_call_frames()
if frames:
    variables = await client.get_scope_variables(frames[0]['callFrameId'])

# 5. Evaluate expressions to check state
result = await client.evaluate('myVariable.status')
bc.add_finding(
    "Variable in unexpected state during async operation",
    data={'state': result},
    severity='high'
)
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

### 5. Record Decision

Document your conclusion:

```python
bc.add_decision(
    "Root cause identified",
    rationale="Heap snapshot shows ArrayBuffer retention, code shows missing cleanup"
)
```

### 6. Save Artifacts

```python
from pathlib import Path

# Create output directory
output_dir = Path('investigation_output')
output_dir.mkdir(exist_ok=True)

# Save investigation timeline
bc.save(output_dir / 'investigation.json')

# Generate Org mode report
timeline = bc.to_org_timeline()
with open(output_dir / 'investigation.org', 'w') as f:
    f.write(timeline)

# Save snapshots (if investigating memory)
if snapshot1_json:
    with open(output_dir / 'baseline.heapsnapshot', 'w') as f:
        f.write(snapshot1_json)
    with open(output_dir / 'after.heapsnapshot', 'w') as f:
        f.write(snapshot2_json)

# Close connection
await client.close()
```

### 7. Present Findings

Summarize your findings to the user:

```
Investigation Complete
======================

Root Cause: [Brief description]
Location: file.ts:line

Finding: [What you discovered]

Fix: [Recommended solution]

All investigation artifacts saved to investigation_output/
- investigation.json (breadcrumb timeline)
- investigation.org (full report)
- baseline.heapsnapshot (before state)
- after.heapsnapshot (after state)
```

## Complete Example: Memory Leak Investigation

Here's a complete end-to-end investigation you can use as a template:

```python
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path('./scripts')))

from cdp_client import CDPClient
from breadcrumbs import Breadcrumbs
from heap_analyzer import HeapSnapshot

async def investigate_memory_leak():
    # Setup
    bc = Breadcrumbs()
    bc.add_hypothesis(
        "Memory leak due to retained buffers",
        rationale="User reports memory growth"
    )

    # Connect
    client = CDPClient('127.0.0.1', 9229)
    await client.connect()
    await client.enable_debugger()

    # Baseline snapshot
    snapshot1_json = await client.take_heap_snapshot()
    snapshot1 = json.loads(snapshot1_json)
    bc.add_test('baseline', f'Captured {len(snapshot1_json)} bytes')

    # Trigger leak (ask user or do programmatically)
    print("Please trigger the leak now...")
    await asyncio.sleep(5)

    # Comparison snapshot
    snapshot2_json = await client.take_heap_snapshot()
    snapshot2 = json.loads(snapshot2_json)

    # Analyze
    growth = len(snapshot2_json) - len(snapshot1_json)
    bc.add_finding(
        f"Heap grew by {growth:,} bytes",
        data={'growth': growth},
        severity='warning'
    )

    # Examine heap
    heap = HeapSnapshot(snapshot2)
    stats = heap.get_node_size_summary()

    # Record findings
    top_type = stats.iloc[0]
    bc.add_finding(
        f"Largest object type: {top_type['type']}",
        data={'count': top_type['count'], 'size': top_type['total_size']},
        severity='critical'
    )

    # Save
    Path('output').mkdir(exist_ok=True)
    bc.save('output/investigation.json')

    timeline = bc.to_org_timeline()
    with open('output/investigation.org', 'w') as f:
        f.write(timeline)

    await client.close()

    print("Investigation complete! Check output/ directory")

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

### Breadcrumbs Methods

```python
bc = Breadcrumbs()
bc.add_hypothesis(description, rationale="why")
bc.add_test(name, details)
bc.add_finding(description, data={}, severity='info|warning|critical')
bc.add_decision(description, rationale="why")
bc.save('path.json')
timeline = bc.to_org_timeline()
```

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
2. **Track breadcrumbs** - Record every hypothesis, test, finding, decision
3. **Save artifacts** - Snapshots, profiles, investigation timeline
4. **Communicate clearly** - Explain what you're doing and why
5. **Be methodical** - Form hypothesis → test → analyze → conclude

## Common Mistakes to Avoid

❌ **DON'T** write a new CDP WebSocket client
❌ **DON'T** parse heap snapshots manually
❌ **DON'T** write custom profiling code
❌ **DON'T** skip breadcrumb tracking
❌ **DON'T** forget to save artifacts

✅ **DO** use CDPClient from cdp_client.py
✅ **DO** use HeapSnapshot from heap_analyzer.py
✅ **DO** use CPUProfile from cpu_profiler.py
✅ **DO** track everything with Breadcrumbs
✅ **DO** save snapshots and investigation timeline

---

**Remember**: All the infrastructure is already built. Your job is to use these tools to investigate methodically, track your findings, and present clear results to the user.
