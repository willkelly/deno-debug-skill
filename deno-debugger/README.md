# Deno Debugger Skill

This is the actual Claude skill that gets installed. Everything here is what users need to use the debugger.

## Installation

### 1. Install the skill

```bash
# Copy to Claude skills directory
cp -r . ~/.claude/skills/deno-debugger/
```

No additional dependencies are required - the skill uses pure Deno/TypeScript and all dependencies are managed by Deno.

## Quick Start

### 1. Start your Deno app with inspector

```bash
deno run --inspect=127.0.0.1:9229 --allow-net your-app.ts
```

### 2. Ask Claude to investigate

```
"My Deno app has a memory leak. Can you investigate?"
```

Claude will:
- Load this skill automatically
- Connect to the Deno inspector
- Conduct a systematic investigation
- Generate a complete report

## Testing the Skill

To verify the skill works, use one of the example scenarios in the parent directory:

```bash
# Run the memory leak scenario
cd ../examples/scenarios/1_memory_leak/
./run.sh

# Copy the prompt shown and paste it to Claude
```

See `../examples/scenarios/README.md` for all available test scenarios.

## Usage

This skill is automatically loaded by Claude Code when investigating Deno/TypeScript applications.

See the parent directory's README.md for full documentation and examples.

## Contents

- `SKILL.md` - Instructions Claude reads
- `scripts/` - Pre-written analysis tools (TypeScript/Deno)
  - `cdp_client.ts` - Chrome DevTools Protocol client
  - `heap_analyzer.ts` - Heap snapshot analysis
  - `cpu_profiler.ts` - CPU profiling
  - `breadcrumbs.ts` - Investigation tracking
  - `report_gen.ts` - Report generation
  - `concurrent_helper.ts` - Concurrent operations helper
  - `types.ts` - TypeScript type definitions
  - `deps.ts` - Dependency management
- `deno.json` - Deno configuration and tasks
- `deno.lock` - Deno dependency lock file

## For Developers

Testing and development tools are in the parent directory:
- `/tests/` - Unit and integration tests
- `/validate.py` - Validation script
- `/examples/` - Example apps and reports
