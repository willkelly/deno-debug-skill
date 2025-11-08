# TypeScript Migration Plan

## Current Python Architecture Analysis

### Files to Convert (~2,410 lines total)
1. **cdp_client.py** (~450 lines) - WebSocket CDP client
2. **heap_analyzer.py** (~400 lines) - Heap snapshot parsing with pandas DataFrames
3. **cpu_profiler.py** (~420 lines) - CPU profile analysis with pandas
4. **breadcrumbs.py** (~340 lines) - Investigation timeline tracking
5. **org_report.py** (~420 lines) - Markdown report generation

### Current Pattern
```
User Request → Claude reads SKILL.md → Claude executes Python CLI scripts → Scripts output data/reports
```

**Python Dependencies:**
- `websockets` - WebSocket client for CDP
- `aiohttp` - HTTP client for inspector endpoint
- `pandas` + `numpy` - Data analysis and manipulation
- `orjson` - Fast JSON parsing
- `python-dateutil` - Datetime handling

**Script Interaction Model:**
- CLI tools that read/write JSON files
- Heavy use of pandas DataFrames for data manipulation
- Async/await for CDP operations
- File-based communication (snapshots, profiles, breadcrumbs.json)

## Proposed TypeScript Architecture

### Why Keep the CLI Pattern?
✅ **Keep the same pattern** - It works well:
- Clear separation of concerns
- Scripts are testable in isolation
- Claude can compose them easily
- File I/O makes debugging transparent

### TypeScript Advantages
1. **Native V8 Integration** - Deno runs on V8, better type understanding
2. **Strong Typing** - Type-safe V8 data structures (HeapSnapshot, CPUProfile)
3. **Deno stdlib** - Built-in HTTP, WebSocket, file I/O
4. **No pandas needed** - Native Map/Set/Array are fast enough for this use case
5. **Single runtime** - No Python + Deno, just Deno
6. **Better async** - Native Promise/async-await

### Proposed Structure

```
deno-debugger/
├── SKILL.md              # Updated for TypeScript
├── README.md             # Updated installation (no pip)
├── deno.json             # Deno configuration
├── deps.ts               # Centralized dependencies
└── scripts/
    ├── cdp_client.ts     # CDP WebSocket client
    ├── heap_analyzer.ts  # Heap snapshot analysis
    ├── cpu_profiler.ts   # CPU profile analysis
    ├── breadcrumbs.ts    # Investigation tracking
    ├── report_gen.ts     # Markdown report generation
    └── types.ts          # Shared V8 type definitions
```

### TypeScript Implementation Plan

#### 1. cdp_client.ts
Replace `websockets` + `aiohttp` with native Deno:
```typescript
// Deno has native fetch and WebSocket
const response = await fetch(`http://127.0.0.1:9229/json`);
const targets = await response.json();
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
```

**Key Changes:**
- Use native `WebSocket` API
- Use native `fetch` for HTTP
- Use `Deno.Command` for subprocess (if needed)
- Strong typing for CDP protocol messages

#### 2. heap_analyzer.ts
Replace `pandas` with native TypeScript data structures:
```typescript
// Instead of pandas DataFrame, use:
class HeapSnapshot {
  nodes: Map<number, HeapNode>;
  edges: HeapEdge[];
  strings: string[];

  // Fast lookups without pandas
  getNodesByType(type: string): HeapNode[] {
    return Array.from(this.nodes.values()).filter(n => n.type === type);
  }
}
```

**Key Changes:**
- `Map<K,V>` instead of pandas Index
- Native array methods (`.filter()`, `.map()`, `.reduce()`)
- Custom aggregation functions (no `groupby`, write our own)
- Still fast enough for typical heap sizes (< 100MB snapshots)

#### 3. cpu_profiler.ts
Similar to heap_analyzer, replace pandas:
```typescript
interface CPUProfileNode {
  id: number;
  callFrame: CallFrame;
  hitCount: number;
  children?: number[];
}

class CPUProfile {
  nodes: Map<number, CPUProfileNode>;

  getHotFunctions(minSamples: number): CPUProfileNode[] {
    return Array.from(this.nodes.values())
      .filter(n => n.hitCount >= minSamples)
      .sort((a, b) => b.hitCount - a.hitCount);
  }
}
```

#### 4. breadcrumbs.ts
Minimal changes, mostly just porting logic:
```typescript
interface Breadcrumb {
  type: 'hypothesis' | 'test' | 'finding' | 'decision';
  timestamp: string;
  description: string;
  data?: Record<string, unknown>;
}

class Breadcrumbs {
  crumbs: Breadcrumb[] = [];

  addHypothesis(description: string, rationale?: string): void {
    this.crumbs.push({
      type: 'hypothesis',
      timestamp: new Date().toISOString(),
      description,
      data: { rationale }
    });
  }
}
```

#### 5. report_gen.ts
Port markdown generation (simpler without org-mode):
```typescript
function generateReport(data: ReportData): string {
  return `# Investigation Report

## Summary
${data.summary}

## Findings
${data.findings.map(f => `- ${f}`).join('\n')}
`;
}
```

### CLI Script Pattern

Each TypeScript script will be executable:
```typescript
// scripts/heap_analyzer.ts
if (import.meta.main) {
  const snapshot = JSON.parse(await Deno.readTextFile(Deno.args[0]));
  const heap = new HeapSnapshot(snapshot);
  const analysis = heap.analyze();
  console.log(JSON.stringify(analysis, null, 2));
}
```

Usage from Claude:
```bash
deno run --allow-read --allow-write scripts/heap_analyzer.ts data/snapshot.heapsnapshot
```

### Testing Strategy

Use Deno's built-in test framework:
```typescript
// scripts/heap_analyzer_test.ts
import { assertEquals } from "@std/assert";
import { HeapSnapshot } from "./heap_analyzer.ts";

Deno.test("parse heap snapshot", () => {
  const snapshot = new HeapSnapshot(sampleData);
  assertEquals(snapshot.nodes.size, 2);
});
```

Run with:
```bash
deno test --allow-read
```

### Dependencies Management

Use `deps.ts` pattern (no npm needed for this project):
```typescript
// deps.ts
export { assertEquals, assertExists } from "@std/assert";
export { parse as parseArgs } from "@std/flags";
```

**Zero external dependencies needed!** Everything can use Deno stdlib.

### GitHub Actions Changes

```yaml
# .github/workflows/test.yml
- name: Setup Deno
  uses: denoland/setup-deno@v1
  with:
    deno-version: v2.x

- name: Run tests
  run: deno test --allow-read --allow-net

- name: Lint
  run: deno lint

- name: Format check
  run: deno fmt --check
```

## Migration Steps

### Phase 1: Core TypeScript Implementation
1. Create `deno.json` configuration
2. Create `deps.ts` for dependencies
3. Create `types.ts` with V8 type definitions
4. Convert `cdp_client.py` → `cdp_client.ts`
5. Convert `heap_analyzer.py` → `heap_analyzer.ts` (remove pandas)
6. Convert `cpu_profiler.py` → `cpu_profiler.ts` (remove pandas)
7. Convert `breadcrumbs.py` → `breadcrumbs.ts`
8. Create `report_gen.ts` (simplified, markdown only)

### Phase 2: Testing
1. Convert pytest tests to Deno.test
2. Update test fixtures
3. Run validation scenarios
4. Fix any issues

### Phase 3: Infrastructure
1. Update `.github/workflows/test.yml` for Deno
2. Update `SKILL.md` (Python → TypeScript examples)
3. Update `README.md` (remove pip, add Deno install)
4. Update `TESTING.md` for Deno test framework
5. Update `CONTRIBUTING.md`
6. Update `Makefile` for Deno commands

### Phase 4: Cleanup
1. Remove all `.py` files
2. Remove `requirements.txt`, `requirements-dev.txt`
3. Remove `__pycache__` directories
4. Update `.gitignore` for TypeScript
5. Remove Python-specific CI jobs

### Phase 5: Validation
1. Test memory leak scenario
2. Test performance scenario
3. Ensure all features work
4. Performance comparison (should be faster!)

## Benefits of TypeScript Migration

1. **Simpler installation** - Just `deno install`, no pip/virtualenv
2. **Type safety** - Catch V8 data structure errors at compile time
3. **Better performance** - Native V8 optimizations, no pandas overhead
4. **Single runtime** - Debugging Deno apps with Deno tools
5. **Modern async** - Native Promise/async-await
6. **Smaller footprint** - No Python + deps (was ~50MB), just Deno
7. **Better IDE support** - TypeScript has excellent tooling

## Risks & Mitigation

**Risk:** Losing pandas convenience for data manipulation
**Mitigation:** V8 data is already JSON; native JS structures are sufficient

**Risk:** Performance regression without pandas
**Mitigation:** For heap sizes < 100MB, native Map/Array are fast enough. We can benchmark.

**Risk:** Breaking existing workflows
**Mitigation:** Keep same CLI pattern, just different extension (.ts vs .py)

## Success Criteria

- ✅ All unit tests passing
- ✅ All scenario tests passing (memory leak, performance)
- ✅ GitHub Actions passing
- ✅ Documentation updated
- ✅ No Python files remaining
- ✅ Installation simpler (one command)
- ✅ Same or better performance
