# Contributing to Deno Debugger Skill

Thank you for your interest in improving the Deno Debugger Skill! This document provides guidance on how to extend and enhance the skill.

## 🎯 Philosophy

This skill is designed around these principles:

1. **Pre-written Infrastructure**: Ship robust tools that Claude uses as building blocks
2. **Minimal Custom Code**: Claude writes investigation-specific code, not protocol handlers
3. **Breadcrumb Tracking**: Track investigation reasoning for reproducibility (when needed)
4. **Markdown Reports**: Professional, readable documentation
5. **Conversational**: Enable back-and-forth between user and Claude
6. **Zero Dependencies**: Pure TypeScript using Deno stdlib only

## 🛠️ How to Extend

### Adding New Analysis Functions

**Example: Add leak detection for a specific object type**

Edit `deno-debugger/scripts/heap_analyzer.ts`:

```typescript
/**
 * Detect leaked event listeners in heap snapshot.
 * @param snapshot - HeapSnapshot instance to analyze
 * @returns Array of potentially leaked listeners
 */
export function detectEventListenerLeaks(snapshot: HeapSnapshot): LeakInfo[] {
  const listeners = snapshot.getNodesByType("EventListener");

  const leaks: LeakInfo[] = [];
  for (const listener of listeners) {
    // Your analysis logic here
    if (isLeaked(listener)) {
      leaks.push({
        nodeId: listener.id,
        size: listener.self_size,
        retainedSize: listener.retained_size,
      });
    }
  }

  return leaks;
}
```

Then update `deno-debugger/SKILL.md` to tell Claude about this function:

```markdown
### Detecting Event Listener Leaks

```typescript
import { detectEventListenerLeaks } from "./scripts/heap_analyzer.ts";

const leaks = detectEventListenerLeaks(snapshot);
console.log(`Found ${leaks.length} potentially leaked listeners`);
```
```

### Adding New Debugging Patterns

Edit `deno-debugger/SKILL.md` and add a new pattern section:

```markdown
#### Pattern D: WebSocket Connection Leak

1. **Capture connections**: Set breakpoint at WebSocket creation
2. **Track lifecycle**: Monitor open/close events via CDP
3. **Compare snapshots**: Look for growing WebSocket objects
4. **Check event listeners**: Verify cleanup on close
5. **Find retention**: Use retaining paths to see why connections stay alive
```

### Adding New Breadcrumb Types

Edit `deno-debugger/scripts/breadcrumbs.ts`:

```typescript
// Add to BreadcrumbType enum
export type BreadcrumbType =
  | "hypothesis"
  | "test"
  | "finding"
  | "decision"
  | "experiment";  // New type!

// Then add a method:
export class Breadcrumbs {
  // ... existing methods ...

  /**
   * Record an experimental investigation approach.
   */
  addExperiment(
    experimentName: string,
    description: string,
    results?: Record<string, unknown>
  ): void {
    this.breadcrumbs.push({
      type: "experiment",
      timestamp: new Date().toISOString(),
      description,
      data: { experimentName, results }
    });
  }
}
```

### Adding CDP Commands

Edit `deno-debugger/scripts/cdp_client.ts`:

```typescript
export class CDPClient {
  // ... existing methods ...

  /**
   * Get event listeners attached to an object.
   */
  async getEventListeners(objectId: string): Promise<EventListener[]> {
    const result = await this.sendCommand("DOMDebugger.getEventListeners", {
      objectId
    });
    return result.listeners || [];
  }
}
```

## 📝 Documentation Standards

When adding features:

1. **JSDoc Comments**: Every exported function needs clear JSDoc
2. **Type Annotations**: Use TypeScript types for all parameters and return values
3. **Examples**: Add example usage in file's `if (import.meta.main)` block or in SKILL.md
4. **SKILL.md**: Update to tell Claude about new capabilities
5. **README**: Update if it's a major feature

Example:

```typescript
/**
 * Analyzes CPU profile to find hot execution paths.
 *
 * @param profile - The CPU profile to analyze
 * @param minPercentage - Minimum percentage of total time (default: 5%)
 * @returns Array of hot paths sorted by time spent
 *
 * @example
 * ```ts
 * const profile = await loadProfile("profile.cpuprofile");
 * const hotPaths = analyzeHotPaths(profile, 10);
 * console.table(hotPaths);
 * ```
 */
export function analyzeHotPaths(
  profile: CPUProfile,
  minPercentage = 5
): HotPath[] {
  // Implementation
}
```

## 🧪 Testing

### Testing New Analysis Functions

Create a test file alongside your implementation:

```typescript
// deno-debugger/scripts/my_analyzer_test.ts
import { assertEquals, assertExists } from "@std/assert";
import { myNewFunction } from "./my_analyzer.ts";

Deno.test("myNewFunction should detect specific pattern", () => {
  const testData = createTestSnapshot();
  const result = myNewFunction(testData);

  assertExists(result);
  assertEquals(result.length, 2);
  assertEquals(result[0].type, "ExpectedType");
});

Deno.test("myNewFunction should handle empty snapshots", () => {
  const emptySnapshot = createEmptySnapshot();
  const result = myNewFunction(emptySnapshot);

  assertEquals(result.length, 0);
});
```

Run your tests:

```bash
cd deno-debugger
deno test scripts/my_analyzer_test.ts -v
```

### Testing CDP Commands

Test against a real Deno instance:

```bash
# Terminal 1: Start test app
cd examples/scenarios/1_memory_leak
deno run --inspect=127.0.0.1:9229 --allow-net app.ts

# Terminal 2: Test your code
cd deno-debugger
deno run --allow-net scripts/test_command.ts
```

Example test script:

```typescript
// scripts/test_command.ts
import { CDPClient } from "./cdp_client.ts";

const client = new CDPClient("127.0.0.1", 9229);
await client.connect();
await client.enableDebugger();

// Test your new command
const result = await client.yourNewCommand();
console.log("Result:", result);

await client.close();
```

## 🎨 Code Style

- Follow Deno style guide
- Use `deno fmt` for consistent formatting
- Use clear, descriptive variable names
- Prefer explicit over implicit
- Comment complex algorithms
- Keep functions focused (single responsibility)

### Formatting

```bash
cd deno-debugger

# Auto-format all files
deno fmt

# Check formatting
deno fmt --check
```

### Linting

```bash
cd deno-debugger

# Run linter
deno lint
```

## 📦 Adding Dependencies

**Philosophy: Avoid external dependencies whenever possible.**

This skill uses only Deno standard library (`@std/*`). Before adding a new dependency:

1. Check if functionality exists in Deno stdlib
2. Check if you can implement it simply yourself
3. Only add well-maintained, popular libraries
4. Document why it's needed in PR

To add a dependency, update `deno-debugger/scripts/deps.ts`:

```typescript
// deps.ts
export { parse as parseArgs } from "@std/flags";
export { assertEquals, assertExists } from "@std/assert";
// Add your new dependency here
export { someFunction } from "jsr:@scope/package@version";
```

## 🐛 Example: Adding WebSocket Debugging

Here's a complete example of adding a new feature:

### 1. Add Analysis Function

Create `deno-debugger/scripts/websocket_analyzer.ts`:

```typescript
/**
 * WebSocket connection analysis utilities.
 */

import type { HeapSnapshot } from "./heap_analyzer.ts";

export interface WebSocketInfo {
  nodeId: number;
  url: string;
  readyState: number;
  retainedSize: number;
}

/**
 * Find all WebSocket connections in heap snapshot.
 */
export function findOpenWebSockets(snapshot: HeapSnapshot): WebSocketInfo[] {
  const wsNodes = snapshot.getNodesByType("WebSocket");

  return wsNodes.map(node => ({
    nodeId: node.id,
    url: extractUrl(node),
    readyState: extractReadyState(node),
    retainedSize: node.retained_size,
  }));
}

// Helper functions
function extractUrl(node: HeapNode): string {
  // Implementation
}

function extractReadyState(node: HeapNode): number {
  // Implementation
}

// CLI usage
if (import.meta.main) {
  const { loadSnapshot } = await import("./heap_analyzer.ts");
  const snapshot = await loadSnapshot(Deno.args[0]);
  const connections = findOpenWebSockets(snapshot);
  console.table(connections);
}
```

### 2. Add Tests

Create `deno-debugger/scripts/websocket_analyzer_test.ts`:

```typescript
import { assertEquals } from "@std/assert";
import { findOpenWebSockets } from "./websocket_analyzer.ts";

Deno.test("findOpenWebSockets finds WebSocket nodes", () => {
  const snapshot = createTestSnapshot();
  const connections = findOpenWebSockets(snapshot);
  assertEquals(connections.length, 2);
});
```

### 3. Update SKILL.md

Add pattern to `deno-debugger/SKILL.md`:

```markdown
#### Pattern D: WebSocket Connection Leak

```typescript
import { findOpenWebSockets } from "./scripts/websocket_analyzer.ts";

const connections = findOpenWebSockets(snapshot);
console.log(`Found ${connections.length} open WebSocket connections`);
console.table(connections);
```
```

### 4. Update README

Add to features list in `README.md`:

```markdown
### WebSocket Analysis

Check for WebSocket connection leaks and monitor connection states.
```

### 5. Test Everything

```bash
# Run tests
cd deno-debugger
deno test scripts/websocket_analyzer_test.ts

# Format and lint
deno fmt
deno lint

# Type check
deno check scripts/websocket_analyzer.ts
```

## 🤝 Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/websocket-analysis`
3. Make your changes
4. Write tests for new functionality
5. Update documentation (SKILL.md, README.md, etc.)
6. Run quality checks:
   ```bash
   make lint
   make test
   ```
7. Commit with clear messages:
   ```bash
   git commit -m "Add WebSocket connection leak detection"
   ```
8. Push to your fork
9. Submit PR with description of changes

### Commit Message Guidelines

- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- Reference issues and PRs liberally
- First line should be 50 chars or less
- Provide detailed description after blank line if needed

## 💡 Ideas for Contributions

Here are some ideas for enhancements:

### Analysis Functions
- Event listener leak detection
- Closure analysis (find captured variables)
- Promise leak detection
- Timer/interval leak detection
- Memory allocation timeline

### CDP Features
- Network inspection
- Console message capture
- Exception handling breakpoints
- Source map support improvements
- Watch expressions

### Reporting
- HTML report output (in addition to Markdown)
- JSON export for tooling integration
- Charts and graphs (using SVG)
- Interactive dashboards

### Debugging Patterns
- Database connection leaks
- File handle leaks
- Worker thread issues
- Module loading performance
- Async function tracking

### Tooling
- CLI wrapper script
- VS Code extension integration
- Automated regression testing
- Performance benchmarking

### Testing
- More unit test coverage
- Performance benchmarks
- Large heap snapshot tests
- Edge case handling

## 📚 Resources

- [Deno Manual](https://docs.deno.com/)
- [Deno Standard Library](https://deno.land/std)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [V8 Heap Snapshot Format](https://github.com/v8/v8/wiki/Heap-Snapshot-Format)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🙏 Thank You!

Every contribution helps make debugging easier for everyone. Whether it's:
- A bug fix
- New analysis function
- Documentation improvement
- Example investigation
- Bug report
- Feature request

All contributions are valuable! 🎉

## Development Setup

```bash
# Clone the repository
git clone https://github.com/your-username/deno-debug-skill.git
cd deno-debug-skill

# Ensure Deno is installed
deno --version

# Run tests
make test

# Try an example scenario
cd examples/scenarios/1_memory_leak
./run.sh
```

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions or ideas
- Check existing issues before creating new ones
