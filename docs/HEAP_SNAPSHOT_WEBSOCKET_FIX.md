# Heap Snapshot WebSocket Fix

## Summary

Heap snapshot capture from Deno now works correctly! The issue was **NOT** a Deno bug, but rather two issues in our CDP client implementation:

1. **WebSocket message size limit** - Default 1MB was too small for heap snapshot chunks
2. **Incomplete command awaiting** - Not properly awaiting snapshot command completion

## The Problem

Initial symptoms:
- ✅ Progress events received (e.g., "104,836/104,836 complete")
- ❌ Zero heap snapshot chunks received
- ❌ Empty result (0 bytes)

This led to the incorrect conclusion that "Deno doesn't send chunks."

## Root Cause Analysis

### Issue #1: Message Size Limit

**Discovery**: Error message from streaming parameter test:
```
websockets.exceptions.ConnectionClosedError: sent 1009 (message too big)
frame with 1048781 bytes exceeds limit of 1048576 bytes
```

**Cause**: The `websockets` library has a default `max_size` of 1MB (1,048,576 bytes). Deno's heap snapshot chunks can be **slightly larger than 1MB**, causing them to be silently rejected.

**Evidence**:
- Raw WebSocket test with `max_size=100MB`: ✅ 9 chunks received (8.6MB total)
- CDP client without `max_size`: ❌ 0 chunks received
- CDP client with `max_size=100MB`: ✅ 9 chunks received (8.6MB total)

### Issue #2: Command Awaiting

**Cause**: The `takeHeapSnapshot` command was sent with `asyncio.create_task()` but never properly awaited after progress completion.

**Fix**: Await the snapshot task AFTER waiting for progress to complete:

```python
# Start snapshot capture
snapshot_task = asyncio.create_task(
    self.send_command("HeapProfiler.takeHeapSnapshot", {"reportProgress": True})
)

# Wait for progress completion
await asyncio.wait_for(progress_done.wait(), timeout=30)

# IMPORTANT: Now await the command completion
await snapshot_task
```

## The Solution

**File**: `skill/scripts/cdp_client.py`

### Change #1: Increase WebSocket Max Size

```python
async def connect(self):
    # ...

    # IMPORTANT: Increase max_size to allow large heap snapshot chunks
    # Default is 1MB but Deno sends chunks up to ~1MB each
    # Setting to 100MB to safely handle all chunk sizes
    max_msg_size = 100 * 1024 * 1024
    self.ws = await websockets.connect(ws_url, max_size=max_msg_size)
```

### Change #2: Proper Command Awaiting

```python
async def take_heap_snapshot(self, report_progress: bool = False) -> str:
    # Register event handlers first
    self.on_event("HeapProfiler.addHeapSnapshotChunk", chunk_handler)

    # Enable heap profiler
    await self.enable_heap_profiler()

    # Start snapshot capture in background
    snapshot_task = asyncio.create_task(
        self.send_command("HeapProfiler.takeHeapSnapshot", {
            "reportProgress": report_progress
        })
    )

    # Wait for progress completion
    if report_progress:
        await asyncio.wait_for(progress_done.wait(), timeout=30)
    else:
        await asyncio.sleep(5.0)

    # CRITICAL: Await the command completion
    await snapshot_task

    return ''.join(chunks)
```

## Test Results

### Before Fix
```
Deno + Our Client = ❌ 0 chunks, 0 bytes
```

### After Fix
```
Deno + Our Client = ✅ 9 chunks, 8,675,783 bytes

Chunk sizes:
  #1: 1,048,576 bytes
  #2: 1,048,576 bytes
  #3: 1,048,576 bytes
  #4: 1,048,576 bytes
  #5: 1,048,576 bytes
  #6: 1,048,576 bytes
  #7: 1,048,576 bytes
  #8: 1,048,576 bytes
  #9: 287,179 bytes (final chunk)
```

## Why Chrome DevTools Worked

Chrome DevTools likely:
1. Sets a much higher `max_size` on WebSocket connections
2. Properly awaits all CDP command completions
3. Has robust error handling for large messages

This is why the user reported "heap snapshots work in Chrome DevTools" - because their implementation handles these edge cases correctly.

## Lessons Learned

1. **Don't assume external bugs** - Always verify with multiple test approaches
2. **Check default limits** - Libraries often have conservative defaults (like 1MB max message size)
3. **Monitor error messages** - The "message too big" error was the key clue
4. **Test incrementally** - Raw WebSocket tests helped isolate the issue
5. **Verify assumptions** - "Progress events work but chunks don't" suggested connection was fine, issue was elsewhere

## Files Changed

- `skill/scripts/cdp_client.py` - Added `max_size` parameter and proper command awaiting
- `tests/test_deno_heap_fixed.py` - New test proving heap snapshots work
- `tests/test_message_size_limit.py` - Test that identified the max_size issue
- `tests/test_chrome_emulation.py` - Tests that helped debug the problem
- `skill/SKILL.md` - Removed incorrect "Known Limitations" section

## Migration Guide

If you have code that works around the "Deno heap snapshot bug":

**Before** (workaround):
```python
# Don't use take_heap_snapshot() with Deno - it's broken
# Use Chrome DevTools UI to manually export .heapsnapshot files
```

**After** (now works):
```python
from scripts.cdp_client import CDPClient

client = CDPClient('127.0.0.1', 9229)
await client.connect()

# This now works perfectly with Deno!
snapshot_json = await client.take_heap_snapshot(report_progress=True)

# Parse and analyze
import json
snapshot = json.loads(snapshot_json)
# ... analyze the heap ...
```

## Performance Notes

- Heap snapshots are typically 5-10MB for small applications
- Chunks are sent at ~1MB each (close to the old limit!)
- Setting `max_size=100MB` provides safe headroom
- Progress reporting adds minimal overhead

## References

- **WebSockets Library Docs**: https://websockets.readthedocs.io/
- **CDP HeapProfiler Spec**: https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/
- **Test Files**: `tests/test_deno_heap_fixed.py`, `tests/test_message_size_limit.py`

---

**Date**: 2025-11-08
**Status**: ✅ FIXED
**Impact**: Heap snapshot capture now works with both Deno and Node.js
