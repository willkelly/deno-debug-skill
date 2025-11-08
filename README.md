# Deno Debugger Skill for Claude

**Transform Claude into an interactive debugger for Deno/TypeScript applications.**

This skill enables Claude to act as a debugging assistant that connects to Deno via the V8 Inspector Protocol, conducts systematic investigations, and generates comprehensive Markdown reports with evidence-based analysis.

## 🎯 What This Skill Does

Claude becomes your debugging partner that:

1. **Connects** to your Deno app via Chrome DevTools Protocol
2. **Investigates** using breakpoints, heap snapshots, and CPU profiling
3. **Tracks** investigation reasoning with breadcrumbs (for complex cases)
4. **Analyzes** data with Python (pandas for heap/CPU analysis)
5. **Reports** findings in clear Markdown with specific recommendations

## 🚀 Quick Start

### 1. Install the Skill

```bash
# Copy to Claude's skills directory
cp -r deno-debugger/ ~/.claude/skills/

# Install Python dependencies
cd ~/.claude/skills/deno-debugger/
pip install -r requirements.txt
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
   - Algorithm complexity comparison (O(n) → O(sqrt(n)))
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
├── requirements.txt      # Python dependencies
└── scripts/              # Pre-written debugging infrastructure
    ├── cdp_client.py     # Chrome DevTools Protocol client
    ├── heap_analyzer.py  # Heap snapshot parsing
    ├── cpu_profiler.py   # CPU profile analysis
    ├── breadcrumbs.py    # Investigation tracking (optional)
    └── org_report.py     # Org mode reports (legacy, optional)
```

## 🔧 Core Components

### CDP Client (`cdp_client.py`)

Handles all communication with Deno's V8 Inspector:

```python
from cdp_client import CDPClient

client = CDPClient('127.0.0.1', 9229)
await client.connect()
await client.enable_debugger()

# Set breakpoint
await client.set_breakpoint_by_url('file:///app.ts', 42)

# Resume execution
await client.resume()

# When paused, inspect
frames = await client.get_call_frames()
vars = await client.get_scope_variables(frames[0]['callFrameId'])
```

**Features:**
- WebSocket connection with 100MB max_size (handles large heap snapshots)
- Deno/Node runtime detection
- Async/await API
- Heap snapshot capture
- CPU profiling
- Breakpoint management

### Heap Analyzer (`heap_analyzer.py`)

Parse and analyze V8 heap snapshots:

```python
from heap_analyzer import HeapSnapshot
import json

snapshot = HeapSnapshot(json.loads(snapshot_json))
stats = snapshot.get_node_size_summary()  # Returns pandas DataFrame
nodes = snapshot.get_nodes_by_type('Array')
```

### CPU Profiler (`cpu_profiler.py`)

Profile CPU usage and find bottlenecks:

```python
from cpu_profiler import CPUProfile

profile = CPUProfile(profile_data)
hot_functions = profile.get_hot_functions()  # DataFrame with CPU %
async_issues = profile.detect_async_issues()
```

### Breadcrumbs (`breadcrumbs.py`)

Track investigation reasoning (optional, for complex investigations):

```python
from breadcrumbs import Breadcrumbs

bc = Breadcrumbs()

# Track major milestones only
bc.add_hypothesis("Memory leak in upload handler",
                 rationale="User reports growth after uploads")

bc.add_finding("ArrayBuffer retention at line 22",
              data={'growth_mb': 0.05},
              severity='critical')

bc.add_decision("Root cause identified",
               rationale="Code shows missing cleanup")

bc.save('investigation.json')
```

**Use sparingly**: Breadcrumbs track investigative *reasoning*, not every action. See SKILL.md for guidelines.

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
- **2_performance_bottleneck/** - Inefficient prime checking and fibonacci
- **3_race_condition/** - Missing awaits and concurrent update bugs

See [examples/scenarios/README.md](examples/scenarios/README.md) for details.

### Run Automated Tests

```bash
# Run all unit tests
./run_tests.sh

# Or with pytest directly
pytest tests/ -v
```

**Test coverage:**
- ✅ CDP connection
- ✅ Heap snapshot parsing
- ✅ CPU profiling
- ✅ Breadcrumb tracking
- ✅ All analysis functions

## 🛠️ Advanced Usage

### Custom Conditional Breakpoints

```python
# Break only when condition is true
await client.set_breakpoint_by_url('file:///app.ts', 42,
                                  condition='fileSize > 1000000')
```

### Watch Expressions

```python
# Monitor value changes
while not done:
    value = await client.evaluate('myVariable')
    print(f"Variable value: {value}")
    await asyncio.sleep(1)
```

### Manual Investigation

You can use the scripts directly for custom investigations:

```python
import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path('./scripts')))
from cdp_client import CDPClient

async def investigate():
    client = CDPClient('127.0.0.1', 9229)
    await client.connect()
    await client.enable_debugger()

    # Your custom investigation logic here

    await client.close()

asyncio.run(investigate())
```

## 📚 Documentation

- **`deno-debugger/SKILL.md`** - Complete workflow and patterns Claude follows
- **`deno-debugger/README.md`** - Installation and usage guide
- **`examples/scenarios/README.md`** - Interactive scenario guide
- **`TESTING.md`** - Test suite documentation
- **`CONTRIBUTING.md`** - Contribution guidelines

## 🤝 Contributing

Contributions welcome! You can:

- Add new analysis functions to `heap_analyzer.py` or `cpu_profiler.py`
- Create new investigation patterns in `SKILL.md`
- Add more test scenarios to `examples/scenarios/`
- Improve report quality guidelines

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📄 License

MIT License - use freely for your debugging needs!

## 🎯 Next Steps

1. **Install the skill:** Copy `deno-debugger/` to `~/.claude/skills/deno-debugger/`
2. **Install dependencies:** `pip install -r requirements.txt`
3. **Try a scenario:** Run `examples/scenarios/1_memory_leak/run.sh`
4. **Debug your app:** Start with `--inspect` and ask Claude!

**Happy Debugging! 🐛🔍**
