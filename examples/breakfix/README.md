# Breakfix Debugging Scenarios

Realistic production-style debugging challenges. Unlike the `/scenarios` directory which demonstrates specific debugging techniques with obvious bugs, these breakfix scenarios mimic real-world debugging situations where:

- The bug isn't immediately obvious from code inspection
- Multiple symptoms may have a single root cause (or multiple interacting causes)
- You need to use actual debugging tools to find the issue
- The code looks reasonable on first glance

Think of these as "interview-style" debugging challenges.

## How to Use

1. **Don't read the code first** - Treat it like a real production issue
2. **Start with the problem description** in the file header
3. **Run the app** and reproduce the symptoms
4. **Use the debugging skill** to investigate systematically
5. **Find the root cause** using heap snapshots, profiling, breakpoints, etc.

## Scenarios

### Easy: API Gateway (`easy/app.ts`)

**Difficulty:** ⭐☆☆

**Symptoms:**
- Users intermittently see stale data after profile updates
- Cache invalidation seems to work... sometimes
- No pattern to when it fails vs succeeds

**Skills Practiced:**
- Understanding cache key generation
- Analyzing HTTP request patterns
- Debugging intermittent issues

**Hints:**
<details>
<summary>Click for debugging approach</summary>

1. Make several GET requests with different query parameters
2. Update the user
3. Make the same GET requests again
4. Check which ones show stale data
5. Examine the cache keys being generated

</details>

**The Bug:**
<details>
<summary>Click to reveal</summary>

The cache key includes query parameters (`user-${userId}-${url.search}`), but cache invalidation only invalidates by user ID pattern (`user-${userId}`). When requests include query params like `?v=123`, they create separate cache entries that don't get invalidated.

Fix: Either include query params in invalidation pattern, or exclude query params from cache key.
</details>

---

### Medium: WebSocket Chat Server (`medium/app.ts`)

**Difficulty:** ⭐⭐☆

**Symptoms:**
- Messages duplicate (2x, 3x, 4x) after users reconnect several times
- Memory grows steadily over time
- Number of duplicates correlates with connection count for that user
- Server gets sluggish after running for hours

**Skills Practiced:**
- Event listener leak detection
- WebSocket connection lifecycle
- Memory profiling and heap snapshots
- Finding retention paths

**Hints:**
<details>
<summary>Click for debugging approach</summary>

1. Connect, disconnect, reconnect the same user 3-4 times
2. Send a message and count duplicates
3. Take heap snapshots before/after reconnections
4. Look for growing arrays or handler lists
5. Check what keeps growing with each connection

</details>

**The Bug:**
<details>
<summary>Click to reveal</summary>

`setupMessageHandlers()` is called in the constructor and pushes handlers onto `this.messageHandlers` array. Every new WebSocket connection creates a new event listener via `addEventListener("close", ...)` but the handlers array grows indefinitely. Each reconnection adds MORE handlers that never get removed.

Additionally, the `messageHandlers` array is never cleared between connections, so each connection adds 3 more handlers (room messages, private messages, logging).

Fixes needed:
1. Move `setupMessageHandlers()` outside constructor or only call once
2. Remove event listeners when connection closes
3. Clear or properly manage the handlers array lifecycle
</details>

---

### Hard: Task Queue Processor (`hard/app.ts`)

**Difficulty:** ⭐⭐⭐

**Symptoms:**
- Task failure rate increases over time (0% → 15% after 6 hours)
- Memory grows from 50MB to 500MB+ over 24 hours
- Intermittent "Task already claimed" errors despite locks
- Event loop lag spikes to 2-3 seconds during export tasks
- Some export files are corrupted or incomplete

**Multiple interacting bugs** - fixing one won't solve all symptoms!

**Skills Practiced:**
- Multi-bug root cause analysis
- Race condition debugging
- Resource leak detection (file handles)
- Event loop monitoring
- Performance profiling

**Hints:**
<details>
<summary>Click for debugging approach</summary>

1. Run export tasks and monitor memory growth
2. Check heap snapshots for leaked resources
3. Profile CPU during export task processing
4. Set breakpoints in the `claim()` method
5. Examine the export file generation code for blocking operations
6. Look for resources that aren't being released

</details>

**The Bugs:**
<details>
<summary>Click to reveal</summary>

**Bug 1: Race Condition in Task Claiming**
The `claim()` method checks and sets `claimedBy` but there's a window where two workers can claim the same task:
```typescript
if (!task.claimedBy && !task.completedAt) {
  task.claimedBy = workerId; // Not atomic!
  task.claimedAt = now;
  return task;
}
```
Fix: Use atomic compare-and-swap or proper locking.

**Bug 2: Memory Leak from Processing Times Array**
```typescript
this.processingTimes.push(processingTime);
```
This array grows indefinitely. After processing thousands of tasks, it consumes significant memory.

Fix: Keep only last N measurements or use a ring buffer.

**Bug 3: File Handle Leaks**
```typescript
this.tempFiles.push(filename);
```
Temp files are tracked but never cleaned up. Also, file handles might not be released if errors occur between open and close.

Fix: Clean up temp files after processing, use try/finally for file handles.

**Bug 4: Event Loop Blocking**
```typescript
// Synchronous JSON generation blocks event loop
for (let i = 0; i < count; i++) {
  const record = JSON.stringify({...}); // Blocking!
  data += record;
}
```
Large exports (count=1000) block the event loop for seconds, causing lag.

Fix: Process in smaller chunks with `await` between iterations, or use streaming.

**Bug 5: Memory from Buffer Allocations**
```typescript
const imageBuffer = new Uint8Array(1024 * 1024); // 1MB
```
Buffers are allocated but references may be retained longer than needed.

These bugs interact: event loop blocking makes task claims timeout, which causes retries, which accumulates more memory from the processing times array and leaked buffers.

</details>

---

## Debugging Workflow

For each scenario, use the Deno Debugger Skill's systematic approach:

### 1. Reproduce the Issue
```bash
deno run --inspect --allow-net --allow-read --allow-write <scenario>/app.ts
```

### 2. Form Hypothesis
Based on symptoms, what could be wrong?

### 3. Gather Data
- Heap snapshots (before/after reproduction)
- CPU profiles (during slow operations)
- Breakpoints (at suspicious code paths)
- Memory metrics over time

### 4. Analyze
- Compare snapshots for growing objects
- Check hot paths in CPU profile
- Examine variable states at breakpoints

### 5. Identify Root Cause
What is the actual bug, not just the symptom?

### 6. Verify Fix
Change the code and verify symptoms disappear.

## Success Criteria

You've successfully debugged a scenario when you can:

1. **Identify the root cause** (not just symptoms)
2. **Explain why** it happens
3. **Propose a specific fix** with code
4. **Estimate production impact** (e.g., "memory leak of 5MB/hour")

## Tips

- **Don't guess** - Use actual debugging data
- **Trust the tools** - Heap snapshots don't lie
- **Look for patterns** - Does it correlate with time? Usage? Specific operations?
- **Consider interactions** - Multiple bugs can compound each other
- **Think like production** - What would monitoring show you?

## Creating Your Own Scenarios

Good breakfix scenarios have:

1. **Realistic code** - looks like production code
2. **Subtle bugs** - not obvious from inspection
3. **Clear symptoms** - measurable, reproducible
4. **Require tools** - can't be found by just reading code
5. **Learning value** - teaches debugging techniques

Avoid:
- Obvious bugs with comments pointing at them
- Contrived code that doesn't look real
- Bugs that are trivial to spot
- Multiple unrelated issues (unless that's the point)

---

Happy debugging! 🐛🔍
