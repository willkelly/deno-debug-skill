# Deno Debugger Skill for Claude

**Transform Claude into an interactive debugger for Deno/TypeScript applications.**

This skill enables Claude to act as a thoughtful debugging assistant that connects to Deno via the V8 Inspector Protocol, conducts systematic investigations, and generates comprehensive Org mode reports with reproducible analyses.

## 🎯 What This Skill Does

Claude becomes your debugging partner that:

1. **Connects** to your Deno app via Chrome DevTools Protocol
2. **Investigates** using breakpoints, heap snapshots, and CPU profiling
3. **Records** every hypothesis, test, and finding as breadcrumbs
4. **Analyzes** data with Python (pandas, matplotlib)
5. **Reports** findings in Org mode with executable code blocks

## 🏗️ Architecture

```
deno-debugger-skill/
├── skill/                   # The actual skill (what users install)
│   ├── SKILL.md            # Instructions Claude reads
│   ├── README.md           # Installation guide
│   ├── requirements.txt    # Python dependencies
│   └── scripts/            # All the debugging tools
│       ├── cdp_client.py   # Chrome DevTools Protocol client
│       ├── heap_analyzer.py # Heap snapshot analysis
│       ├── cpu_profiler.py  # CPU profiling & performance
│       ├── breadcrumbs.py   # Investigation tracking
│       ├── visualize.py     # Flamegraphs & charts
│       └── org_report.py    # Org mode report generator
│
├── tests/                   # Test suite (33 tests)
├── examples/                # Example apps and reports
├── templates/               # Report templates
└── docs/                    # Documentation

See PROJECT_STRUCTURE.md for complete details.
```

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/your-org/deno-debug-skill.git
cd deno-debug-skill

# Install the skill
cd skill/
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
You: "Claude, my Deno app is leaking memory when processing file uploads.
     Can you investigate?"

Claude: *reads SKILL.md, connects via CDP, systematically investigates*
```

## 📖 Usage Examples

### Memory Leak Investigation

```
You: "Memory grows with each upload and never gets released"

Claude will:
1. Connect to your Deno process
2. Capture baseline heap snapshot
3. Ask you to trigger the leak (or trigger it programmatically)
4. Capture comparison snapshot
5. Analyze growth using heap_analyzer.py
6. Set breakpoints in suspected code
7. Inspect variables and closures
8. Find retaining paths (why objects stay alive)
9. Generate comprehensive report with fix recommendations
```

### Performance Bottleneck

```
You: "My API responses are slow, can you profile it?"

Claude will:
1. Start CPU profiling
2. Exercise the slow endpoint
3. Stop profiling and analyze
4. Identify hot paths
5. Check for async/await issues
6. Generate flamegraph
7. Provide optimization recommendations
```

### Race Condition / Async Bug

```
You: "Sometimes my async operations complete in wrong order"

Claude will:
1. Set breakpoints at promise creation/resolution
2. Trace execution flow
3. Analyze timing with CPU profile
4. Check for improper awaiting
5. Identify the race condition
6. Suggest proper synchronization
```

## 🔧 Core Components

### CDP Client (`cdp_client.py`)

Handles all communication with Deno's V8 Inspector:

```python
from scripts.cdp_client import CDPClientSync

client = CDPClientSync('127.0.0.1', 9229)
client.enable_debugger()

# Set breakpoint
bp = client.set_breakpoint('file:///app/upload.ts', 42)

# Resume execution
client.resume()

# When paused, inspect
frames = client.get_call_frames()
vars = client.get_scope_variables(frames[0]['callFrameId'])
```

### Heap Analyzer (`heap_analyzer.py`)

Parse and analyze V8 heap snapshots:

```python
from scripts.heap_analyzer import load_snapshot, compare_snapshots

before = load_snapshot('before.heapsnapshot')
after = load_snapshot('after.heapsnapshot')

# Find what grew
growth = compare_snapshots(before, after)
print(growth.head())

# Find retaining paths
path = snapshot.find_retaining_path(large_object_id)
```

### CPU Profiler (`cpu_profiler.py`)

Profile CPU usage and find bottlenecks:

```python
from scripts.cpu_profiler import start_profiling, stop_profiling

await start_profiling(client)
# ... let code run ...
profile = await stop_profiling(client)

# Analyze
hot = profile.get_hot_functions()
async_issues = detect_async_issues(profile)
```

### Breadcrumbs (`breadcrumbs.py`)

Track investigation journey:

```python
from scripts.breadcrumbs import Breadcrumbs

bc = Breadcrumbs('memory_leak_investigation')

bc.add_hypothesis("Upload handler retains buffers",
                  rationale="Heap shows growing ArrayBuffers")

bc.add_test("heap_comparison", "Compare before/after 10 uploads",
            details={'snapshots': ['before.heap', 'after.heap']})

bc.add_finding("ArrayBuffer grows 50MB per upload",
               data={'growth_rate': '50MB'},
               severity='high')

bc.save('investigation.json')
```

### Visualizations (`visualize.py`)

Generate charts and graphs:

```python
from scripts.visualize import flamegraph, heap_timeline, memory_growth_chart

# CPU flamegraph
flamegraph(profile, 'flamegraph.png')

# Memory over time
heap_timeline(snapshots, 'timeline.png')

# Growth comparison
memory_growth_chart(comparison_df, 'growth.png')
```

### Org Reports (`org_report.py`)

Generate comprehensive Org mode reports:

```python
from scripts.org_report import OrgReport

report = OrgReport("Memory Leak Investigation", breadcrumbs)

report.add_summary("Found leak in upload handler...")
report.add_timeline()
report.add_code_snippet('typescript', code, 'src/upload.ts:42')

report.add_analysis('Heap Growth', """
import pandas as pd
from scripts.heap_analyzer import compare_snapshots

before = load_snapshot('data/before.heapsnapshot')
after = load_snapshot('data/after.heapsnapshot')
growth = compare_snapshots(before, after)
print(growth.head())
""", data_path='data/')

report.add_recommendations([
    {'title': 'Fix buffer retention',
     'description': 'Add explicit cleanup',
     'priority': 'high'}
])

report.save('investigation.org')
```

## 📊 Output Artifacts

Every investigation generates:

- **`investigation_YYYYMMDD_HHMMSS.org`** - Main report (Org mode)
- **`breadcrumbs.json`** - Complete investigation log
- **`data/`** - Heap snapshots, CPU profiles
- **`output/`** - Flamegraphs, charts, visualizations

## 🎓 Debugging Patterns

The skill includes pre-defined investigation patterns:

### Memory Leak Pattern

1. Establish baseline heap snapshot
2. Trigger suspected leak
3. Capture comparison snapshot
4. Analyze growth
5. Find retaining paths
6. Set strategic breakpoints
7. Inspect closure state
8. Document root cause

### Performance Bottleneck Pattern

1. Profile baseline workload
2. Identify hot paths
3. Check async patterns
4. Set breakpoints in expensive functions
5. Analyze call patterns
6. Generate flamegraph
7. Propose optimizations

### Race Condition Pattern

1. Set breakpoints at async boundaries
2. Track promise state
3. Check event loop blocking
4. Analyze execution timeline
5. Identify improper synchronization
6. Verify fix

## 📝 Org Mode Reports

Reports are generated in Org mode format with:

- **Executive Summary** - TL;DR of issue and fix
- **Investigation Timeline** - Every breadcrumb with timestamps
- **Executable Code Blocks** - Python analysis you can re-run
- **Visualizations** - Embedded images
- **Code Snippets** - TypeScript with line numbers
- **Recommendations** - Actionable fixes with priorities

### Viewing Reports

**In Emacs:**
```bash
emacs investigation.org
```

Then:
- `C-c C-c` on code blocks to execute them
- `TAB` to fold/unfold sections
- Full Org mode functionality

**In VS Code:**
Install the "vscode-org-mode" extension

**As Plain Text:**
Reports are readable as markdown-like text

## 🧪 Example Session

```bash
# 1. Start your Deno app
deno run --inspect=127.0.0.1:9229 --allow-all app.ts

# 2. Ask Claude
"Claude, investigate why memory grows during file uploads"

# 3. Claude conducts investigation
# - Connects to inspector
# - Captures snapshots
# - Analyzes growth
# - Sets breakpoints
# - Records findings

# 4. Claude generates report
"I've found the issue. The upload handler retains ArrayBuffer
references in closures. See investigation_20251107_143000.org
for full details and fix recommendations."

# 5. Review report
emacs investigation_20251107_143000.org
```

## 🔍 What Makes This Unique?

### Pre-written Infrastructure
- Robust CDP client, heap analyzer, profiler already implemented
- Claude writes minimal custom code per investigation
- Focus on investigation logic, not protocol details

### Breadcrumb Tracking
- Every hypothesis, test, finding recorded
- Enables reproducible investigations
- Generates excellent reports

### Org Mode Reports
- Executable code blocks for reproducibility
- Professional documentation
- Share with team, include in PRs

### Conversational Debugging
- Ask questions during investigation
- Guide Claude's focus
- Iterate on findings

### Future-Proof
- Patterns transfer to Claude Agent SDK
- Build institutional knowledge
- Adapt to new debugging scenarios

## 🛠️ Advanced Usage

### Custom Investigations

Create custom investigation scripts:

```python
from scripts.cdp_client import CDPClientSync
from scripts.breadcrumbs import Breadcrumbs
from scripts.org_report import OrgReport

bc = Breadcrumbs('custom_investigation')
client = CDPClientSync('127.0.0.1', 9229)

# Your custom investigation logic
bc.add_hypothesis("...")
# ... investigate ...
bc.add_finding("...")

# Generate report
report = OrgReport("Custom Investigation", bc)
report.save('custom_report.org')
```

### Conditional Breakpoints

```python
# Break only when condition is true
client.set_breakpoint('file:///app.ts', 42,
                     condition='fileSize > 1000000')
```

### Watch Expressions

```python
# Monitor value changes
while not done:
    value = client.evaluate('myVariable', context)
    bc.add_finding(f"Variable value: {value}")
    await asyncio.sleep(1)
```

## 📚 Learn More

- **`SKILL.md`** - Full instructions Claude reads
- **`examples/memory_leak_example.org`** - Complete example report
- **`templates/investigation_template.org`** - Template for reports
- **Script docstrings** - Each Python file has detailed docs

## 🤝 Contributing

This skill is designed to be extended:

- Add new analysis functions to `heap_analyzer.py` or `cpu_profiler.py`
- Create new visualization types in `visualize.py`
- Add debugging patterns to `SKILL.md`
- Improve report templates

## 🧪 Testing

This skill includes comprehensive testing:

### Quick Test

```bash
# Run all tests
./run_tests.sh
```

### Unit Tests

```bash
# Test parsers, breadcrumbs, etc. (no Deno required)
pytest tests/ -v
```

### Integration Tests

```bash
# Test against real Deno instance
python validate.py
```

**What gets tested:**
- ✅ CDP connection to Deno
- ✅ Breakpoint setting
- ✅ Heap snapshot capture and parsing
- ✅ CPU profiling
- ✅ All analysis functions
- ✅ Visualization generation
- ✅ Org report generation

**CI/CD:**
- Automated tests on every push
- Tested against Python 3.9, 3.10, 3.11
- Tested against Deno 1.40.x, 1.41.x, 1.42.x

See [TESTING.md](TESTING.md) for details.

## 📄 License

MIT License - use freely for your debugging needs!

## 🎯 Next Steps

1. **Install dependencies:** `pip install -r requirements.txt`
2. **Run tests:** `./run_tests.sh` (validates everything works)
3. **Launch Deno app:** `deno run --inspect your-app.ts`
4. **Ask Claude to debug!**

**Happy Debugging! 🐛🔍**
