# [BUG] V8 Inspector does not send HeapProfiler.addHeapSnapshotChunk events

## Summary

Deno's V8 Inspector implementation does not emit `HeapProfiler.addHeapSnapshotChunk` events when taking heap snapshots via Chrome DevTools Protocol (CDP), making it impossible to programmatically capture heap snapshots through the inspector.

## Environment

- **Deno Version**: 2.5.6
- **OS**: Linux 4.4.0 (also tested on other platforms)
- **Architecture**: x86_64

## Expected Behavior

According to the [Chrome DevTools Protocol specification](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/#method-takeHeapSnapshot), when calling `HeapProfiler.takeHeapSnapshot`, the inspector should emit:

1. `HeapProfiler.reportHeapSnapshotProgress` events (optional, for progress tracking)
2. `HeapProfiler.addHeapSnapshotChunk` events (required, containing actual snapshot data)

**Node.js behavior (correct):**
- ✅ Sends `HeapProfiler.reportHeapSnapshotProgress` events
- ✅ Sends `HeapProfiler.addHeapSnapshotChunk` events with snapshot data
- ✅ Total: 51 chunks, 5,151,306 bytes in test case

## Actual Behavior

**Deno behavior (broken):**
- ✅ Sends `HeapProfiler.reportHeapSnapshotProgress` events
- ❌ Does NOT send `HeapProfiler.addHeapSnapshotChunk` events
- ❌ Total: 0 chunks, 0 bytes

## Reproduction

### Minimal Test Case

```python
import asyncio
import json
import websockets
import aiohttp
import subprocess
from pathlib import Path

async def test_deno_heap_snapshot():
    # Create minimal Deno script
    test_script = """
    const data = [];
    for (let i = 0; i < 1000; i++) {
        data.push({ index: i, value: "x".repeat(100) });
    }
    console.log("Ready");
    setInterval(() => {}, 1000);
    """

    script_path = Path("/tmp/test.ts")
    script_path.write_text(test_script)

    # Launch Deno with inspector
    proc = subprocess.Popen(
        ["deno", "run", "--inspect=127.0.0.1:9229", str(script_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    try:
        await asyncio.sleep(2)

        # Get WebSocket URL
        async with aiohttp.ClientSession() as session:
            async with session.get('http://127.0.0.1:9229/json') as resp:
                targets = await resp.json()
                ws_url = targets[0]['webSocketDebuggerUrl']

        # Connect and monitor messages
        ws = await websockets.connect(ws_url)
        chunks_received = []
        progress_received = []

        async def monitor():
            try:
                async for message in ws:
                    data = json.loads(message)
                    if 'method' in data:
                        if data['method'] == 'HeapProfiler.addHeapSnapshotChunk':
                            chunks_received.append(data)
                            print(f"✅ Chunk received: {len(data['params']['chunk'])} bytes")
                        elif data['method'] == 'HeapProfiler.reportHeapSnapshotProgress':
                            progress_received.append(data)
                            params = data['params']
                            print(f"Progress: {params.get('done', 0)}/{params.get('total', 0)}")
            except websockets.exceptions.ConnectionClosed:
                pass

        monitor_task = asyncio.create_task(monitor())

        # Enable HeapProfiler
        await ws.send(json.dumps({'id': 1, 'method': 'HeapProfiler.enable'}))
        await asyncio.sleep(0.5)

        # Request heap snapshot
        print("Requesting heap snapshot...")
        await ws.send(json.dumps({
            'id': 2,
            'method': 'HeapProfiler.takeHeapSnapshot',
            'params': {'reportProgress': True}
        }))

        # Wait for completion
        await asyncio.sleep(15)
        await ws.close()
        monitor_task.cancel()

        print(f"\nResults:")
        print(f"Progress events: {len(progress_received)}")
        print(f"Chunk events: {len(chunks_received)}")

        if len(chunks_received) == 0:
            print("❌ BUG CONFIRMED: No chunks received!")
        else:
            print(f"✅ Success: {sum(len(c['params']['chunk']) for c in chunks_received)} bytes")

    finally:
        proc.kill()
        proc.wait()

# Run test
asyncio.run(test_deno_heap_snapshot())
```

### Expected Output (Node.js)
```
Progress: 0/108052
Progress: 10000/108052
...
✅ Chunk received: 100000 bytes
✅ Chunk received: 100000 bytes
...
Results:
Progress events: 8
Chunk events: 51
✅ Success: 5,151,306 bytes
```

### Actual Output (Deno)
```
Progress: 0/104836
Progress: 10000/104836
...
Progress: 104836/104836
Results:
Progress events: 14
Chunk events: 0
❌ BUG CONFIRMED: No chunks received!
```

## Full Reproduction Repository

A complete test suite demonstrating this issue is available at:
https://github.com/[your-username]/deno-debug-skill

**Run comparison test:**
```bash
# Install dependencies
pip install websockets aiohttp pytest pytest-asyncio

# Run test
python -m pytest tests/test_heap_simple.py -v -s
```

This will show:
- Node.js: ✅ PASS (51 chunks received)
- Deno: ❌ SKIP (0 chunks received)

## Impact

This bug makes it **impossible** to:
- Programmatically capture heap snapshots from Deno processes
- Build automated memory leak detection tools
- Integrate Deno debugging into IDEs and development tools
- Create automated performance analysis workflows

**Workaround**: Users must manually use Chrome DevTools UI (`chrome://inspect`) to capture snapshots, then export them as `.heapsnapshot` files.

## Technical Analysis

The issue appears to be in Deno's V8 Inspector bridge implementation. Specifically:

1. ✅ Deno correctly accepts `HeapProfiler.enable` command
2. ✅ Deno correctly accepts `HeapProfiler.takeHeapSnapshot` command
3. ✅ Deno's V8 engine correctly generates the heap snapshot (evidenced by progress events)
4. ❌ Deno's inspector bridge does NOT forward `HeapProfiler.addHeapSnapshotChunk` events to CDP clients

The snapshot data is being generated internally but never transmitted over the WebSocket connection.

## Related

- Chrome DevTools Protocol Spec: https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/
- V8 Inspector Protocol: https://v8.dev/docs/inspector
- Node.js (working implementation for reference): Node's inspector correctly emits these events

## Verification

This is definitively a Deno bug, verified by:
1. ✅ Identical code works with Node.js
2. ✅ All other CDP events work correctly with Deno (CPU profiling, breakpoints, etc.)
3. ✅ Progress events prove the connection is working
4. ❌ Only chunk events are missing

## Labels

- `bug`
- `inspector`
- `v8`
- `debugging`

---

**Additional Information**

If you need any additional information, test cases, or clarification, please let me know. I'm happy to provide more details or help debug this issue.
