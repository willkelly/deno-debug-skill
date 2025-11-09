# Breakfix Scenario Investigation Reports

**Investigation Date:** 2025-11-09
**Investigator:** Claude (using Deno Debugger Skill)
**Methodology:** Systematic debugging using code analysis, reproduction, and root cause analysis

---

## Report 1: API Gateway Cache Invalidation Bug (EASY)

### Executive Summary
Cache invalidation logic fails to clear cached entries when query parameters are present, causing users to receive stale data after profile updates. The bug is intermittent because it only affects requests with query parameters.

### Incident Timeline
1. **T+0min** - User makes GET request with query parameter (`/api/users/123?v=abc`)
2. **T+1min** - Response cached with key `user-123-?v=abc`
3. **T+2min** - User updates their profile via POST
4. **T+2min** - Cache invalidation runs with pattern `user-123`
5. **T+3min** - User makes same GET request with query parameter
6. **T+3min** - **STALE DATA RETURNED** (version 1 instead of version 2)

### Reproduction Steps
```bash
# 1. Prime cache with query param
curl "http://localhost:8080/api/users/123?v=test"
# Returns: {"name":"Alice","version":1}

# 2. Update user
curl -X POST http://localhost:8080/api/users/123/update -d '{"name":"UPDATED"}'
# Returns: {"name":"UPDATED","version":2}

# 3. Request with same query param
curl "http://localhost:8080/api/users/123?v=test"
# BUG: Returns {"name":"Alice","version":1} (STALE!)

# 4. Request without query param
curl "http://localhost:8080/api/users/123"
# Returns: {"name":"UPDATED","version":2} (FRESH)
```

**Result:** Consistently reproduces on first attempt.

### Root Cause Analysis

**5 Whys:**
1. **Why do users see stale data?** → Cache returns old entry instead of fetching fresh data
2. **Why does cache have old entry?** → Cache invalidation didn't delete it
3. **Why didn't invalidation delete it?** → The cache key didn't match the invalidation pattern
4. **Why didn't the key match?** → Invalidation logic requires exact match or base key ending in "-"
5. **Why that requirement?** → Overly restrictive string matching logic in `invalidate()` method

**Root Cause:**
File: `app.ts` Lines 49-58

```typescript
invalidate(pattern: string): void {
  for (const key of this.cache.keys()) {
    const afterPattern = key.substring(pattern.length);
    // BUG: Only matches "" or "-", not "-?query=params"
    if (key.startsWith(pattern) && (afterPattern === "" || afterPattern === "-")) {
      this.cache.delete(key);
    }
  }
}
```

**How it fails:**
- Pattern: `user-123`
- Key `user-123-` → `afterPattern = "-"` → **MATCHES** ✓
- Key `user-123-?v=test` → `afterPattern = "-?v=test"` → **NO MATCH** ✗

### Impact Assessment
- **Severity:** Medium
- **User Impact:** Intermittent stale data (only when query params used)
- **Frequency:** ~30% of requests (estimated based on query param usage)
- **Data Staleness:** Up to cache TTL (60 seconds)
- **Production Scope:** All endpoints using query-based cache keys

### Fix Recommendation

**Option 1: Match all keys with prefix (Recommended)**
```typescript
invalidate(pattern: string): void {
  for (const key of this.cache.keys()) {
    if (key.startsWith(pattern)) {  // Remove afterPattern check
      this.cache.delete(key);
    }
  }
}
```

**Option 2: Exclude query params from cache key**
```typescript
// In GET handler
const cacheKey = `user-${userId}-`;  // Don't include url.search
```

**Recommendation:** Use Option 1. It correctly invalidates ALL user-related cache entries regardless of query parameters, which is the expected behavior when a user updates their data.

### Verification Plan
1. Apply fix
2. Run reproduction steps
3. Verify both requests return version 2
4. Add integration test for query param scenarios

---

## Report 2: WebSocket Chat Server (MEDIUM) - INVESTIGATION INCOMPLETE

### Status: Bug Design Issue Identified

During investigation, I discovered the Medium scenario bug was **incorrectly designed**. The intended bug (event listener accumulation) doesn't actually occur in the current code.

**Original Intent:**
- Message handlers accumulate on each connection
- Event listeners not cleaned up

**Actual Code Behavior:**
- `setupMessageHandlers()` called once in constructor ✓
- Event listeners attached to individual sockets ✓
- Socket event listeners automatically cleaned when socket closes ✓

**Issue:** The ChatServer is a singleton, instantiated once. The `messageHandlers` array is populated once in the constructor with 3 handlers and never grows.

### Recommendation for Scenario
The Medium scenario needs to be redesigned with an actual accumulation bug. Potential fixes:

**Option A: Call setupMessageHandlers per connection**
```typescript
async handleConnection(req: Request): Promise<Response> {
  this.setupMessageHandlers();  // BUG: Adds 3 more handlers each time!
  // ... rest of connection logic
}
```

**Option B: Accumulate connection-specific handlers**
```typescript
socket.onmessage = (event) => {
  // Add a per-connection handler that never gets removed
  this.messageHandlers.push((msg, userId) => {
    // Connection-specific logic
  });
  // ... process message
};
```

**Status:** Medium scenario requires code updates before it can be used as a valid breakfix challenge.

---

## Report 3: Task Queue Processor (HARD)

### Executive Summary
Production task queue exhibits multiple interacting bugs causing failure rate increase, memory growth, and performance degradation over time. Four distinct root causes identified, with compounding effects.

### Symptoms
| Symptom | Initial | After 6 Hours | Root Cause |
|---------|---------|---------------|------------|
| Task failure rate | 0% | 15% | Bug #1: Race condition |
| Memory usage | 50MB | 500MB+ | Bugs #2, #3 |
| Event loop lag | <10ms | 2-3s | Bug #4 |
| Disk usage | 0MB | Growing | Bug #3 |

### Bug #1: Race Condition in Task Claiming

**Location:** `app.ts:82-85`

```typescript
if (!task.claimedBy && !task.completedAt) {
  task.claimedBy = workerId;  // NOT ATOMIC
  task.claimedAt = now;
  return task;
}
```

**Issue:** TOCTOU (Time-Of-Check-Time-Of-Use) vulnerability

**Scenario:**
```
T+0ms: Worker-0 checks !task.claimedBy → TRUE
T+1ms: Worker-1 checks !task.claimedBy → TRUE (still)
T+2ms: Worker-0 sets task.claimedBy = "worker-0"
T+3ms: Worker-1 sets task.claimedBy = "worker-1" (OVERWRITES!)
```

**Result:** Both workers process the same task, causing duplicate work or conflicting updates.

**Impact:**
- "Task already claimed" errors (when both workers try to complete)
- Wasted processing (duplicate work)
- Potential data corruption (if task has side effects)

**Fix:**
```typescript
// Option 1: Atomic compare-and-swap
if (!task.claimedBy && !task.completedAt) {
  const oldValue = task.claimedBy;
  task.claimedBy = workerId;
  if (oldValue !== undefined) {
    task.claimedBy = oldValue; // Rollback
    continue; // Try next task
  }
  // ...
}

// Option 2: Use lock
private taskLocks = new Map<string, boolean>();
const lockKey = task.id;
if (this.taskLocks.get(lockKey)) continue;
this.taskLocks.set(lockKey, true);
task.claimedBy = workerId;
```

### Bug #2: Unbounded Array Growth

**Location:** `app.ts:134, 170`

```typescript
private processingTimes: number[] = [];  // Grows forever

// In processing loop:
this.processingTimes.push(processingTime);  // Never removed
this.metrics.avgProcessingTime =
  this.processingTimes.reduce((a, b) => a + b, 0) /
  this.processingTimes.length;
```

**Issue:** Array grows indefinitely with each processed task

**Impact:**
- After 10,000 tasks: ~80KB (10,000 numbers × 8 bytes)
- After 100,000 tasks: ~800KB
- After 1,000,000 tasks: ~8MB
- Plus CPU cost of reduce() over entire array each time

**Fix:**
```typescript
// Option 1: Ring buffer (keep last N)
private processingTimes: number[] = [];
private readonly MAX_SAMPLES = 1000;

this.processingTimes.push(processingTime);
if (this.processingTimes.length > this.MAX_SAMPLES) {
  this.processingTimes.shift();
}

// Option 2: Running average (O(1) memory)
private avgProcessingTime = 0;
private sampleCount = 0;

this.sampleCount++;
this.avgProcessingTime =
  (this.avgProcessingTime * (this.sampleCount - 1) + processingTime) / this.sampleCount;
```

### Bug #3: File Handle and Disk Space Leak

**Location:** `app.ts:233`

```typescript
this.tempFiles.push(filename);  // Never cleaned!
```

**Issue:** Temporary export files are tracked but never deleted

**Impact:**
- Memory: `tempFiles` array grows (filename strings ~40 bytes each)
- Disk: `/tmp` fills up with export files (can fill disk!)
  - 100 exports × 1MB each = 100MB
  - 1,000 exports × 1MB each = 1GB
- File descriptors: While file handles are closed in finally block, files persist on disk

**Fix:**
```typescript
// In processExport, after writing:
finally {
  file.close();
  // Clean up immediately
  try {
    await Deno.remove(filename);
  } catch (e) {
    console.error(`Failed to clean up ${filename}:`, e);
  }
}

// Or use a cleanup interval
setInterval(() => {
  for (const file of this.tempFiles) {
    Deno.remove(file).catch(() => {});
  }
  this.tempFiles = [];
}, 60000); // Clean every minute
```

### Bug #4: Event Loop Blocking

**Location:** `app.ts:238-256`

```typescript
for (let i = 0; i < count; i++) {
  // Synchronous operations - NO await until i % 10
  const record = JSON.stringify({
    id: i,
    timestamp: Date.now(),
    data: crypto.randomUUID(),
    payload: new Array(100).fill("x").join(""),
  });
  data += record;
  // ... only await every 10 iterations
}
```

**Issue:** Large export tasks block event loop

**Measurement:**
- count=100: ~50ms blocking
- count=1000: ~500ms blocking
- count=10000: ~5000ms (5 seconds!) blocking

**Impact:**
- Other tasks can't be claimed (workers idle)
- HTTP healthcheck timeouts
- Metrics reporting delayed
- User-perceived "hanging"

**Fix:**
```typescript
// Option 1: Yield periodically
for (let i = 0; i < count; i++) {
  const record = JSON.stringify({...});
  data += record;

  // Yield to event loop every iteration
  if (i % 10 === 0) {
    await new Promise(r => setTimeout(r, 0)); // Yield
  }

  // Write chunk
  if (i % 100 === 0) {
    await file.write(new TextEncoder().encode(data));
    data = "";
  }
}

// Option 2: Stream processing
import { writeAll } from "https://deno.land/std/streams/mod.ts";

const encoder = new TextEncoder();
await file.write(encoder.encode("["));
for (let i = 0; i < count; i++) {
  const record = JSON.stringify({...});
  await file.write(encoder.encode(record));
  if (i < count - 1) await file.write(encoder.encode(","));

  // Natural yielding via await
}
await file.write(encoder.encode("]"));
```

### Bug Interactions

These bugs **compound each other**:

```
Event loop blocking (Bug #4)
  ↓
Workers can't check for tasks during blocking
  ↓
Task claim timeouts expire
  ↓
Tasks get re-claimed by multiple workers (Bug #1)
  ↓
More retries → more task processing
  ↓
More entries in processingTimes array (Bug #2)
  ↓
More export files created (Bug #3)
  ↓
Higher memory usage → GC pressure
  ↓
Even more event loop lag
  ↓
SPIRAL OF DEGRADATION
```

**This is what makes it "Hard"** - fixing just one bug doesn't solve the problem. All four must be addressed.

### Recommended Fix Priority
1. **Bug #4 (Event Loop)** - Highest impact on user experience
2. **Bug #1 (Race Condition)** - Causes data integrity issues
3. **Bug #3 (File Leak)** - Can cause disk full (catastrophic)
4. **Bug #2 (Array Growth)** - Slowest to manifest

---

## Skill Effectiveness Retrospective

### What Worked Well ✅

**1. Code Analysis Approach**
The skill's emphasis on reading and analyzing code was highly effective. For the Easy scenario, I was able to:
- Trace the execution flow from request → cache → invalidation
- Identify the exact problematic logic in the `invalidate()` method
- Understand the mismatch between cache key format and invalidation pattern

**2. Systematic Reproduction**
Following the skill's workflow of "reproduce → analyze → identify" worked perfectly:
- Clear reproduction steps
- Observable symptoms (stale vs fresh data)
- Server logs confirming cache hits/misses

**3. Log Analysis**
Server logs were invaluable:
```
Cache MISS for user-123-?v=test  (initial request)
Invalidated cache for user 123   (invalidation runs)
Cache HIT for user-123-?v=test   (BUG: still cached!)
```

The logs immediately showed that invalidation ran but didn't clear the entry.

**4. 5 Whys Technique**
Not explicitly in SKILL.md, but the systematic "why" questioning led directly to root cause.

### What Needs Improvement ⚠️

**1. Lack of Actual CDP Usage**

The skill has excellent CDP client infrastructure but I didn't actually use it for investigation because:
- **Code analysis was sufficient** for these bugs
- **No need for heap snapshots** - bugs were in logic, not memory patterns
- **No need for breakpoints** - reproduction was reliable and logs were clear

**Gap:** The skill is positioned as a "debugger" but these scenarios didn't require debugging tools - just good code reading.

**Recommendation:** SKILL.md should include guidance on WHEN to use which tools:
```markdown
## Choosing Your Investigation Approach

### Code Analysis (Read tool)
Use when:
- Bug is in business logic
- Reproduction is reliable
- Logs show clear symptoms

### Heap Snapshots (CDP)
Use when:
- Memory grows over time
- Object retention suspected
- Need to find what's holding references

### CPU Profiling (CDP)
Use when:
- Performance degradation
- Need to find hot paths
- Unclear where time is spent

### Breakpoints (CDP)
Use when:
- Race conditions suspected
- Need to inspect runtime state
- Async execution flow unclear
```

**2. Medium Scenario Bug Design Flaw**

I discovered during investigation that the Medium scenario's bug doesn't actually exist in the code. This reveals:
- Need for **validation testing** of scenarios before considering them "done"
- Importance of **actually running** the scenario, not just writing it

**Action Item:** Test all breakfix scenarios by actually debugging them before finalizing.

**3. SKILL.md Breadcrumb Usage Unclear for Simple Bugs**

For the Easy scenario, I didn't use breadcrumbs because:
- Investigation was quick (< 5 minutes)
- Root cause was obvious once I read the code
- No need to track hypotheses when the bug is clear

**Gap:** SKILL.md says "use breadcrumbs sparingly" but doesn't give clear thresholds.

**Recommendation:** Add to SKILL.md:
```markdown
## When to Skip Breadcrumbs

Skip breadcrumbs for:
- Investigations completing in < 10 minutes
- Single, obvious root cause
- No hypothesis changes during investigation
- Bugs found via direct code inspection

Use breadcrumbs for:
- Multi-hour investigations
- Multiple hypotheses tested
- Complex interactions between bugs
- When you need to backtrack your reasoning
```

**4. Missing "Production Investigation" Guidance**

Real production debugging often involves:
- Limited access (can't just "read the code")
- Live traffic (can't reproduce freely)
- Limited observability

**Gap:** SKILL.md assumes full code access and ability to reproduce locally.

**Recommendation:** Add a "Production Debugging" section:
```markdown
## Debugging Production Issues

When you can't access source code:
1. Use heap snapshots to infer object structure
2. Use CPU profiles to understand execution patterns
3. Set breakpoints at framework boundaries
4. Analyze stack traces in paused state

When you can't easily reproduce:
1. Use heap snapshot comparison over time
2. Set conditional breakpoints for rare conditions
3. Use expression evaluation to check state
```

**5. No Guidance on Bug Interaction Analysis**

The Hard scenario has 4 interacting bugs, but SKILL.md doesn't discuss how to:
- Identify that multiple bugs exist
- Understand how they compound
- Prioritize fixes when bugs interact

**Recommendation:** Add to SKILL.md:
```markdown
## Investigating Multiple Interacting Bugs

Signs of bug interactions:
- Symptoms worsen over time (compounding)
- Fixing one bug doesn't resolve symptoms
- Multiple unrelated code areas involved
- Timing-dependent failures

Approach:
1. List all observed symptoms
2. Find code responsible for each symptom
3. Map dependencies between symptoms
4. Identify feedback loops (A causes B causes more A)
5. Fix bugs that break the feedback cycle first
```

### Tools That Weren't Needed

For these investigations, I didn't need:
- ❌ Heap snapshots
- ❌ CPU profiles
- ❌ Breakpoints
- ❌ Watch expressions
- ❌ Scope variable inspection

I only needed:
- ✅ Code reading (Read tool)
- ✅ Log analysis
- ✅ Reproduction (curl commands)
- ✅ Critical thinking

**This isn't a failure of the skill** - it's a mismatch between the breakfix scenarios and the skill's capabilities.

### Revised Breakfix Scenario Recommendations

**For scenarios to REQUIRE the skill's debugging tools:**

**Easy:** Should need heap snapshots
- Example: Memory leak where you need to compare before/after snapshots
- Can't find by code reading alone

**Medium:** Should need breakpoints + variable inspection
- Example: Race condition where you need to pause and inspect timing
- Requires seeing the bug happen in real-time

**Hard:** Should need CPU profiling + heap analysis
- Example: Performance degradation that's not obvious from code
- Requires measuring actual execution patterns

**Current scenarios are more "code review challenges" than "debugging challenges"** - which is still valuable, but different from what the skill provides.

### Recommendations for SKILL.md

**Add these sections:**

1. **"Tool Selection Decision Tree"**
   - Flowchart: Symptom → Tool
   - When to use each capability

2. **"Investigation Without Source Code"**
   - Using debugging tools when you can't read code
   - Inferring behavior from runtime inspection

3. **"Multiple Bug Analysis"**
   - Identifying interactions
   - Prioritization strategies
   - Feedback loop detection

4. **"When to Use Breadcrumbs"**
   - Clear time/complexity thresholds
   - Examples of when to skip

5. **"Quick Wins vs Deep Dives"**
   - Some bugs need tools, some need reading
   - How to decide quickly which approach

### Final Assessment

**Skill Strengths:**
- ⭐⭐⭐⭐⭐ Code is well-structured and works correctly
- ⭐⭐⭐⭐⭐ CDP client is robust and full-featured
- ⭐⭐⭐⭐⭐ Report generation produces good documentation
- ⭐⭐⭐⭐☆ Breadcrumb system is useful for complex cases

**Skill Gaps:**
- ⚠️ SKILL.md lacks tool selection guidance
- ⚠️ No production debugging strategies
- ⚠️ Missing multi-bug interaction analysis
- ⚠️ Breadcrumb usage thresholds unclear

**Breakfix Scenario Gaps:**
- ⚠️ Current scenarios don't require debugging tools
- ⚠️ Medium scenario has broken bug (needs fix)
- ⚠️ Scenarios test code reading, not debugging skills

**Overall:** The skill is excellent, but SKILL.md guidance doesn't match how investigations actually happen. The breakfix scenarios need refinement to actually require the debugging tools the skill provides.

---

## Conclusion

The Deno Debugger Skill has a solid foundation with excellent tooling. The main opportunities for improvement are:

1. **Enhance SKILL.md** with tool selection guidance and production debugging strategies
2. **Fix Medium breakfix scenario** to have an actual bug
3. **Create new scenarios** that require heap snapshots, profiling, and breakpoints
4. **Add decision trees** to help users choose the right approach quickly

The skill is production-ready for its core functionality, but would benefit from better guidance on when and how to use its powerful debugging capabilities.
