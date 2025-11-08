# Deno Debugger Skill

This is the actual Claude skill that gets installed. Everything here is what users need to use the debugger.

## Installation

```bash
# Install Python dependencies
pip install -r requirements.txt
```

## Usage

This skill is automatically loaded by Claude Code when investigating Deno/TypeScript applications.

See the parent directory's README.md for full documentation and examples.

## Contents

- `SKILL.md` - Instructions Claude reads
- `scripts/` - Pre-written analysis tools
  - `cdp_client.py` - Chrome DevTools Protocol client
  - `heap_analyzer.py` - Heap snapshot analysis
  - `cpu_profiler.py` - CPU profiling
  - `breadcrumbs.py` - Investigation tracking
  - `visualize.py` - Flamegraphs and charts
  - `org_report.py` - Report generation
- `requirements.txt` - Python dependencies

## For Developers

Testing and development tools are in the parent directory:
- `/tests/` - Unit and integration tests
- `/validate.py` - Validation script
- `/examples/` - Example apps and reports
