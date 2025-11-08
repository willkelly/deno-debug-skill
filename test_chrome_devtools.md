# Testing Chrome DevTools with Deno Heap Snapshots

## Goal
Verify whether Chrome DevTools can actually capture heap snapshots from Deno via CDP.

## Test Steps

### 1. Launch Deno with Inspector
```bash
deno run --inspect=127.0.0.1:9229 examples/leaky_app.ts
```

### 2. Open Chrome DevTools
1. Open Chrome browser
2. Navigate to `chrome://inspect`
3. Click "inspect" on your Deno process

### 3. Attempt Heap Snapshot
1. Go to the **Memory** tab
2. Select "Heap snapshot"
3. Click **"Take snapshot"**

### 4. Check Results

**If it works:**
- You'll see a snapshot appear in the left sidebar
- The snapshot will have a size (e.g., "5.2 MB")
- You can click on it and browse objects

**If it doesn't work:**
- The snapshot might appear but show 0 bytes
- Or it might fail with an error
- Or it might hang indefinitely

### 5. Monitor Network Traffic (Advanced)

To see what's actually happening on the wire:

```bash
# Install websocat if you don't have it
# This will let us monitor the WebSocket connection

# In one terminal, start a proxy
websocat -v ws-l:127.0.0.1:9230 ws://127.0.0.1:9229 2>&1 | grep HeapProfiler
```

Then connect Chrome DevTools to port 9230 instead of 9229.

You should see:
- `HeapProfiler.enable` command
- `HeapProfiler.takeHeapSnapshot` command
- `HeapProfiler.reportHeapSnapshotProgress` events
- **`HeapProfiler.addHeapSnapshotChunk` events** ← This is the key!

If you DON'T see addHeapSnapshotChunk events, then Chrome DevTools also doesn't get chunks.

## Alternative Test: Check DevTools Protocol Monitor

Chrome DevTools has a built-in protocol monitor:

1. Open Chrome DevTools (the one debugging Deno)
2. Open Chrome DevTools on the DevTools window itself (yes, DevTools-ception!)
   - On the DevTools window, press `Cmd/Ctrl + Shift + I`
3. Go to Console
4. Type: `Main.ProtocolMonitor.show()`
5. This shows all CDP messages
6. Try taking a heap snapshot again
7. Search for "HeapProfiler.addHeapSnapshotChunk" in the protocol monitor

**If you see it:** Chrome DevTools IS receiving chunks (and we need to figure out why our client isn't)

**If you DON'T see it:** Chrome DevTools is also NOT receiving chunks (meaning Deno truly doesn't send them)

## Report Back

Please let me know what you find! Specifically:
1. Does Chrome DevTools successfully capture a heap snapshot?
2. What size does it show?
3. Do you see `HeapProfiler.addHeapSnapshotChunk` events in the protocol monitor?

This will tell us whether:
- A) Chrome DevTools has a workaround we need to discover
- B) Deno truly doesn't implement this part of the CDP spec
- C) There's something our client is doing wrong
