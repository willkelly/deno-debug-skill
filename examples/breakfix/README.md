# Breakfix Debugging Scenarios

Realistic production-style debugging challenges designed to **require actual debugger usage**. These scenarios cannot be easily solved by code reading alone - you need to use debugging tools to efficiently identify the root cause.

## Philosophy

Unlike the `/scenarios` directory which demonstrates specific debugging techniques with obvious bugs, these breakfix scenarios mimic real-world debugging situations where:

- **The bug is NOT obvious from code inspection**
- Code reading is possible but time-prohibitive
- **Debugging tools provide quick, clear answers**
- You must choose the right debugging technique for the problem type
- The code is complex enough that debuggers save significant time

Think of these as "true debugging challenges" that test your ability to **use debuggers effectively**, not just read code.

## Key Principle

**When to use a debugger vs code reading:**
- Code reading: Good for small files, simple logic, obvious patterns
- Debugging tools: Essential for memory issues, timing bugs, performance bottlenecks, complex state

These scenarios are designed to be complex enough that debugging tools are the clear winner.

## How to Use

1. **Read the problem description** in the file header
2. **Run the app** and reproduce the symptoms
3. **Choose the right debugging technique** based on symptoms:
   - Memory growth → Heap snapshots
   - Timing/race issues → Breakpoints + variable watches
   - Performance → CPU profiling
4. **Use the debugger** to find the root cause quickly
5. **Compare**: Could you have found this as quickly by reading code?

## Scenarios

### Easy: Plugin Analytics Service (`easy/app.ts`)

**Difficulty:** ⭐☆☆
**Port:** 8080

**Symptoms:**
- Memory grows steadily over time (~2MB per 1000 plugin reloads)
- No obvious memory leaks in code review
- Service uses 800MB after 6 hours (started at 80MB)

**Required Debugging Technique: HEAP SNAPSHOTS**

**Why code reading won't work efficiently:**
- 5 plugin classes, each with multiple methods
- Event subscription/unsubscription spread across initialization and shutdown
- The leak is in what's NOT happening (missing cleanup)
- Heap snapshots immediately show growing handler arrays

**Debugging Approach:**
1. Take heap snapshot before plugin reloads
2. Trigger 20-30 plugin reloads via `POST /reload-plugins`
3. Take heap snapshot after reloads
4. Compare snapshots - look for growing objects
5. You'll see `EventBus.handlers` arrays growing linearly
6. Trace back to find missing `unsubscribe()` calls in plugin `shutdown()` methods

**The Bug:**
Each plugin subscribes to events in `initialize()` but forgets to unsubscribe in `shutdown()`. Every reload creates new plugin instances that subscribe, but old handlers remain in the EventBus, causing a memory leak.

**Time comparison:**
- Code reading: 10-15 minutes (read all 5 plugins, trace event flow)
- Heap snapshots: 2-3 minutes (snapshot diff shows the leak immediately)

---

### Medium: Distributed Lock Manager (`medium/app.ts`)

**Difficulty:** ⭐⭐☆
**Port:** 8081

**Symptoms:**
- Under high concurrency, TWO clients sometimes acquire the same lock
- Happens ~1% of the time with 100+ concurrent requests
- No errors are logged
- Data corruption in production from race condition

**Required Debugging Technique: BREAKPOINTS + VARIABLE WATCHES**

**Why code reading won't work efficiently:**
- Race condition is timing-dependent
- Multiple async operations with state checks
- The bug is in the *timing gap* between check and update
- Breakpoints let you observe concurrent execution paths

**Debugging Approach:**
1. Set breakpoints in `acquire()` method:
   - After "Check if lock is available" (line ~130)
   - After "BUG IS HERE" comment (line ~154)
   - Before "Finalize acquisition" (line ~163)
2. Watch variables: `lock.state`, `lock.owner`, `lock.version`
3. Run 100+ concurrent acquire requests
4. Step through breakpoints for multiple requests
5. Observe: Two requests both see `state === "available"`, then both proceed to acquire!

**The Bug:**
TOCTOU (Time-Of-Check-Time-Of-Use) vulnerability. The code checks if the lock is available, then has async delays, then updates the lock state. Between the check and the update, another concurrent request can also pass the check, causing both to acquire the lock.

**Time comparison:**
- Code reading: 15-20 minutes (understand async flow, try to spot the race mentally)
- Breakpoints + watches: 5 minutes (see the race happen in real-time)

---

### Hard: Media Processing Service (`hard/app.ts`)

**Difficulty:** ⭐⭐⭐
**Port:** 8082

**Symptoms:**
- Processing 10 images: ~500ms ✓
- Processing 50 images: ~12 seconds ⚠️
- Processing 100 images: ~45 seconds ❌
- Exponential performance degradation (indicates O(n²) bug)
- CPU usage spikes to 100%
- Memory usage is normal

**Required Debugging Technique: CPU PROFILING**

**Why code reading won't work efficiently:**
- 6-stage processing pipeline with multiple abstraction layers
- 4 classes: ImageUtils, Filters, MetadataProcessors, ProcessingPipeline
- Multiple filter and metadata operations that all *look* reasonable
- The O(n²) operation is hidden in an innocent-looking "checksum" function
- Called indirectly: BatchProcessor → Pipeline → MetadataProcessors → ImageUtils

**Debugging Approach:**
1. Start CPU profiling
2. Trigger batch processing: `POST /process` with `count=100`
3. Stop profiling when request completes
4. Analyze CPU profile - sort by "Self Time"
5. You'll see `ImageUtils.calculateChecksum()` consuming 90%+ of CPU time!
6. Look at that function - it has nested loops over all pixels (O(n²))

**The Bug:**
The `calculateChecksum()` function in `ImageUtils` has a nested loop that compares every pixel with every other pixel. For a 50x50 image, that's (50×50×3)² = 56 million operations per image! It's called from `MetadataProcessors.qualityScore()` which looks like innocent metadata enrichment.

**Time comparison:**
- Code reading: 30-45 minutes (read through all classes, trace pipeline, analyze each stage)
- CPU profiling: 3-5 minutes (profile immediately shows the hot function)

---

## Debugging Workflow

For each scenario, use this systematic approach:

### 1. Understand the Symptoms
What is the observable problem? (Memory growth, race condition, performance)

### 2. Choose the Right Tool
- **Memory issues** → Heap snapshots
- **Timing/race issues** → Breakpoints + variable watches
- **Performance bottlenecks** → CPU profiling

### 3. Reproduce Reliably
Can you trigger the issue consistently?

### 4. Gather Data
- Heap snapshots: Before/after comparison
- Breakpoints: Watch variable state changes
- CPU profiles: Identify hot paths

### 5. Analyze
- Heap: What objects are growing?
- Breakpoints: What state transitions are happening?
- CPU: Which functions consume the most time?

### 6. Identify Root Cause
What is the actual bug, not just the symptom?

### 7. Verify Fix
Change the code and confirm symptoms disappear.

## Success Criteria

You've successfully debugged a scenario when you can:

1. **Identify the root cause** using debugging tools
2. **Explain why** the bug happens
3. **Prove** debugging tools were faster than code reading
4. **Propose a specific fix** with code changes

## Comparison: Debugging Tools vs Code Reading

| Scenario | Tool Used | Tool Time | Code Reading Time | Winner |
|----------|-----------|-----------|-------------------|--------|
| Easy     | Heap Snapshots | 2-3 min | 10-15 min | Debugger 5x faster |
| Medium   | Breakpoints | 5 min | 15-20 min | Debugger 3x faster |
| Hard     | CPU Profiling | 3-5 min | 30-45 min | Debugger 10x faster |

**Key insight:** Debugging tools don't just help - they're **dramatically faster** for these types of issues.

## What Makes These "True Debugging Scenarios"?

✅ **Good debugging scenarios:**
- Bug is hidden in complex code
- Symptoms are clear, root cause is not
- Debugging tools provide immediate clarity
- Code reading is possible but inefficient

❌ **Not good debugging scenarios:**
- Obvious bugs with comments pointing at them
- Bugs visible in 20 lines of simple code
- Contrived code that doesn't look real
- Issues where tools don't help

## Tips

- **Match tools to symptoms**: Memory → Heap, Timing → Breakpoints, CPU → Profiling
- **Trust the data**: Profilers don't lie about hot paths
- **Look for patterns**: Does the leak grow linearly? Exponentially?
- **Think production**: What metrics would you monitor?
- **Know when to switch**: If code reading takes >5 minutes, use a debugger

## Creating Your Own Scenarios

Good breakfix scenarios have:

1. **Complex enough code** - Not obvious from quick scan
2. **Realistic structure** - Looks like production code
3. **Clear symptoms** - Measurable, reproducible issues
4. **Tool advantage** - Debuggers provide clear, fast answers
5. **Learning value** - Teaches both debugging technique AND when to use it

Avoid:
- Trivial bugs in small files
- Issues solvable by simple grep
- Obvious problems with comments explaining them
- Scenarios where tools don't actually help

---

## Key Takeaway

**These scenarios teach you WHEN to use debuggers, not just HOW.**

In real-world development:
- Small bugs in small files → Code reading is fine
- Memory leaks → Heap snapshots are essential
- Race conditions → Breakpoints are the only way
- Performance issues → Profiling beats intuition

Use the right tool for the job. That's the skill these scenarios develop.

Happy debugging! 🐛🔍
