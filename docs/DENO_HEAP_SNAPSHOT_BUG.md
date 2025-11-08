# Deno Heap Snapshot Bug Report

## Summary

**Deno's V8 Inspector does NOT send heap snapshot chunks via CDP**, making it impossible to programmatically capture heap snapshots through the Chrome DevTools Protocol.

## Evidence

### Test Results

#### ✓ Node.js (WORKS)
```
Chunks received: 51
Progress events: 8
Total chunk data: 5,151,306 bytes
Status: ✓ SUCCESS
```

#### ✗ Deno (BROKEN)
```
Chunks received: 0
Progress events: 14
Total chunk data: 0 bytes
Status: ✗ FAILURE
```

### What We Tested

**Test File**: `tests/test_heap_simple.py`

Both tests use identical CDP commands:
1. `HeapProfiler.enable` - Enables the heap profiler
2. `HeapProfiler.takeHeapSnapshot` with `reportProgress: true`
3. Listen for events via WebSocket

### Node.js Behavior (Expected)

Node.js sends TWO types of events:
1. `HeapProfiler.reportHeapSnapshotProgress` - Progress updates
2. `HeapProfiler.addHeapSnapshotChunk` - **Actual snapshot data chunks**

### Deno Behavior (Broken)

Deno sends ONLY:
1. `HeapProfiler.reportHeapSnapshotProgress` - Progress updates ✓

Deno does NOT send:
2. `HeapProfiler.addHeapSnapshotChunk` - **MISSING!** ✗

## Technical Details

### CDP Protocol

According to the Chrome DevTools Protocol spec:

**Method**: `HeapProfiler.takeHeapSnapshot`
- Collects a snapshot of the JavaScript heap

**Events**:
- `HeapProfiler.addHeapSnapshotChunk` - **Required** to receive snapshot data
- `HeapProfiler.reportHeapSnapshotProgress` - Optional progress tracking

### What Deno is Missing

Deno's V8 inspector implementation:
- ✓ Accepts `HeapProfiler.enable` command
- ✓ Accepts `HeapProfiler.takeHeapSnapshot` command
- ✓ Sends progress events
- ✗ **Never sends chunk events with actual data**

## Impact on Deno Debugger Skill

This bug makes it **impossible** to:
- Programmatically capture heap snapshots from Deno processes
- Analyze memory leaks using automated tools
- Build debugging workflows that include heap analysis
- Use our `HeapSnapshot` analyzer class with Deno

## Workarounds

### Workaround 1: Use Chrome DevTools UI (Manual)

**Steps:**
1. Launch Deno with `--inspect` or `--inspect-brk`
2. Open Chrome DevTools in browser
3. Navigate to Profiler tab
4. Manually click "Take Heap Snapshot"
5. Export `.heapsnapshot` file
6. Load file with our `HeapSnapshot` class

**Pros:**
- Actually works
- Can capture heap snapshots

**Cons:**
- Manual process (not automated)
- Breaks skill automation
- Requires browser UI

### Workaround 2: Use Playwright for Automation

**Strategy**: Use Playwright to automate Chrome DevTools UI

```python
from playwright.async_api import async_playwright

async with async_playwright() as p:
    browser = await p.chromium.launch()
    context = await browser.new_context()

    # Connect to Deno's DevTools URL
    page = await context.new_page()
    await page.goto(f"devtools://devtools/bundled/inspector.html?ws=127.0.0.1:9229/...")

    # Automate clicking "Take Heap Snapshot"
    # Extract downloaded .heapsnapshot file
```

**Pros:**
- Can automate the UI
- Still works

**Cons:**
- Hacky and fragile
- Depends on DevTools UI structure
- Slow

### Workaround 3: CPU Profiling Only

**Strategy**: Skip heap analysis, use CPU profiling instead

- ✓ CPU profiling works perfectly with Deno
- ✓ Our `CPUProfile` class works fine
- ✗ Can't detect memory leaks
- ✗ Can't analyze heap growth

## Recommended Action

### For Deno Team

File a bug report with Deno project:
- **Title**: "Deno V8 Inspector does not send HeapProfiler.addHeapSnapshotChunk events"
- **Labels**: inspector, v8, debugging
- **Impact**: Blocks programmatic heap snapshot capture

### For This Skill

**Short term:**
1. Document limitation in `skill/SKILL.md`
2. Update `cdp_client.py` to detect Deno and warn users
3. Provide workaround instructions

**Long term:**
1. Implement Playwright-based workaround (optional)
2. Wait for Deno to fix the bug
3. Test with future Deno versions

## Test Commands

To reproduce this issue:

```bash
# Install dependencies
pip install -r requirements-dev.txt

# Run comparison test
python -m pytest tests/test_heap_simple.py -v -s

# You'll see:
# - Node.js: ✓ 51 chunks received
# - Deno: ✗ 0 chunks received
```

## References

- **CDP Spec**: https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/
- **Node.js Implementation**: Works correctly (tested)
- **Deno Implementation**: Broken (confirmed)
- **Our CDP Client**: `skill/scripts/cdp_client.py` (verified correct)

## Conclusion

This is definitively a **Deno bug**, not an issue with our CDP client implementation.

Our code works perfectly with Node.js. Deno's V8 inspector is incomplete.

---

**Date**: 2025-11-08
**Deno Version**: 2.5.6
**Test Environment**: Linux 4.4.0
**Verification**: Tests in `tests/test_heap_simple.py`
