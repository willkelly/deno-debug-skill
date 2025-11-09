# Testing Guide

This document describes the testing strategy for the Deno Debugger Skill.

## Test Structure

```
deno-debugger/
├── scripts/
│   ├── *_test.ts           # Unit tests alongside source files
│   ├── cdp_client.ts
│   ├── heap_analyzer.ts
│   ├── cpu_profiler.ts
│   ├── breadcrumbs.ts
│   └── report_gen.ts
examples/scenarios/          # Integration test scenarios
├── 1_memory_leak/
├── 2_performance_bottleneck/
├── 3_race_condition/
├── 4_state_corruption/
└── 5_event_loop_timing/
```

## Types of Tests

### 1. Unit Tests (Deno Test)

Test individual components without requiring a running Deno instance.

**Run:**
```bash
cd deno-debugger
deno task test
```

**Run with verbose output:**
```bash
deno test --allow-read --allow-net --allow-write -v
```

**What's tested:**
- ✅ Breadcrumb tracking and timeline generation
- ✅ Heap snapshot parsing
- ✅ CPU profile parsing
- ✅ Data structure validation
- ✅ Analysis functions

**Coverage:**
- `deno-debugger/scripts/breadcrumbs.ts` - Full coverage
- `deno-debugger/scripts/heap_analyzer.ts` - Parser logic
- `deno-debugger/scripts/cpu_profiler.ts` - Parser logic
- `deno-debugger/scripts/report_gen.ts` - Report generation
- `deno-debugger/scripts/cdp_client.ts` - Core functionality

### 2. Integration Tests (Example Scenarios)

Test against real Deno instances to ensure CDP protocol works correctly.

**Run a scenario:**
```bash
cd examples/scenarios/1_memory_leak
./run.sh
```

**What's tested:**
- ✅ CDP WebSocket connection
- ✅ Debugger enable/disable
- ✅ Breakpoint set/remove
- ✅ Heap snapshot capture from real Deno
- ✅ CPU profile capture from real Deno
- ✅ Parsing real V8 data
- ✅ Snapshot comparison
- ✅ Report generation
- ✅ End-to-end workflow

**Requirements:**
- Deno installed (2.x recommended)

### 3. CI/CD Tests (GitHub Actions)

Automated testing on every push.

**What's tested:**
- Lint and format checks (deno fmt, deno lint)
- Type checking (deno check)
- Unit tests across Deno 2.x
- Integration tests against example apps
- Scenario compilation validation

## Running Tests Locally

### Quick Start

```bash
# Run everything
make test

# Or directly:
cd deno-debugger
deno task test
```

### Unit Tests Only

```bash
cd deno-debugger

# Run all tests
deno test --allow-read --allow-net --allow-write

# Run specific test file
deno test scripts/breadcrumbs_test.ts -v

# Run tests in watch mode
deno task test:watch
```

### Integration Tests

```bash
# Run a complete scenario
cd examples/scenarios/1_memory_leak
./run.sh

# The script will:
# 1. Start a buggy Deno app with --inspect
# 2. Show you a prompt to give Claude
# 3. Let Claude investigate the bug end-to-end
```

**Available scenarios:**
- **1_memory_leak/** - ArrayBuffer accumulation in upload handler
- **2_performance_bottleneck/** - Inefficient algorithms needing optimization
- **3_race_condition/** - Async operations completing in wrong order
- **4_state_corruption/** - State management issues
- **5_event_loop_timing/** - Event loop blocking problems

See [examples/scenarios/README.md](examples/scenarios/README.md) for details.

## Test Data and Fixtures

### Test Fixtures

Unit tests create minimal synthetic fixtures that follow the V8 format specification.
These are defined directly in test files for clarity and maintainability.

### Real Data

Integration tests use real Deno applications to generate authentic V8 data:
- Heap snapshots from actual memory leaks
- CPU profiles from real performance bottlenecks
- Breakpoint pauses from live debugging sessions

## Code Quality Checks

### Formatting

```bash
cd deno-debugger

# Check formatting
deno fmt --check

# Auto-format
deno fmt
```

### Linting

```bash
cd deno-debugger

# Run linter
deno lint
```

### Type Checking

```bash
cd deno-debugger/scripts

# Type check all scripts
deno check *.ts
```

### All Quality Checks

```bash
# Run everything
make lint
```

## Known Issues / Limitations

### Current Test Coverage

| Component | Unit Tests | Integration Tests | Coverage |
|-----------|-----------|-------------------|----------|
| cdp_client.ts | ⚠️ Partial | ✅ | ~60% |
| heap_analyzer.ts | ✅ | ✅ | ~75% |
| cpu_profiler.ts | ✅ | ✅ | ~75% |
| breadcrumbs.ts | ✅ | ✅ | ~95% |
| report_gen.ts | ✅ | ✅ | ~80% |

### What's Not Tested Yet

- ❌ CDP client edge cases (disconnection, errors)
- ❌ Retaining path analysis (complex heap structures)
- ❌ Large heap snapshot performance
- ❌ Memory leak detection over multiple snapshots
- ❌ Advanced CPU profiling scenarios

## Adding New Tests

### Adding a Unit Test

```typescript
// scripts/my_feature_test.ts
import { assertEquals } from "@std/assert";
import { myFunction } from "./my_feature.ts";

Deno.test("myFunction should do something", () => {
  const result = myFunction(inputData);
  assertEquals(result, expectedOutput);
});

Deno.test("myFunction should handle edge cases", () => {
  const result = myFunction(edgeCaseData);
  assertEquals(result, expectedResult);
});
```

### Adding an Integration Test

Create a new scenario directory:

```bash
mkdir examples/scenarios/6_my_test
cd examples/scenarios/6_my_test
```

Create `app.ts` with buggy code and `run.sh` to launch it:

```typescript
// app.ts
console.log("Starting test app...");
// Your buggy code here
```

```bash
# run.sh
#!/bin/bash
deno run --inspect=127.0.0.1:9229 --allow-net app.ts
```

## Debugging Test Failures

### Unit Test Fails

```bash
# Run with verbose output
deno test scripts/failing_test.ts -v

# Run specific test
deno test scripts/failing_test.ts --filter "test name"

# See detailed stack traces
deno test scripts/failing_test.ts --trace-ops
```

### Integration Test Fails

```bash
# Check Deno is running
ps aux | grep deno

# Check inspector port
netstat -an | grep 9229

# Check Deno version
deno --version
```

### Viewing Generated Artifacts

After running scenarios:

```bash
# View snapshot
cat investigation_output/baseline.heapsnapshot | head -100

# View report
cat investigation_output/REPORT.md

# View breadcrumbs
cat investigation_output/investigation.json
```

## Performance Testing

Currently no dedicated performance tests. Future additions:

- Benchmark heap snapshot parsing time
- Test with large (>100MB) heap snapshots
- Measure CDP command latency
- Profile memory usage of analyzers

## Contributing Tests

When adding new features:

1. **Write unit tests first** (TDD approach)
2. **Add integration test** if feature uses CDP
3. **Update this document** with coverage info
4. **Ensure CI passes** before PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## CI/CD

Tests run automatically on:
- Every push to `main`, `develop`, or `claude/*` branches
- Every pull request

View results in GitHub Actions tab.

### Local CI Simulation

Run the same checks that CI runs:

```bash
# Formatting
cd deno-debugger && deno fmt --check

# Linting
cd deno-debugger && deno lint

# Type checking
cd deno-debugger/scripts && deno check *.ts

# Unit tests
cd deno-debugger && deno task test

# Validate examples
cd examples/scenarios/1_memory_leak && deno check app.ts
cd ../2_performance_bottleneck && deno check app.ts
```

## Resources

- [Deno Testing Documentation](https://docs.deno.com/runtime/manual/basics/testing/)
- [V8 Heap Snapshot Format](https://github.com/v8/v8/wiki/Heap-Snapshot-Format)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Deno Standard Library](https://deno.land/std)

## Quick Reference

```bash
# Development workflow
make test           # Run all tests
make test-watch     # Run tests in watch mode
make lint           # Check code quality
make format         # Format code
make typecheck      # Type check everything

# From deno-debugger directory
deno task test      # Run tests
deno task test:watch # Watch mode
deno fmt            # Format
deno lint           # Lint
```
