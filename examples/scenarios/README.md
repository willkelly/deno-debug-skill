# Debugging Scenarios

This directory contains complete end-to-end scenarios for testing the Deno Debugger Skill with realistic bugs.

Each scenario includes:
- **app.ts** - A Deno application with a specific type of bug
- **prompt.txt** - The exact prompt to give Claude for investigation
- **run.sh** - Script that starts the app and provides instructions

## 🎯 Available Scenarios

### 1. Memory Leak Investigation
**Location:** `1_memory_leak/`

**Bug:** Global array accumulates ArrayBuffer objects without cleanup

**What Claude will find:**
- Heap growing by ~50MB per upload
- `leakedBuffers` array retaining all uploaded buffers
- Missing cleanup in `handleUpload()` function

**How to run:**
```bash
cd 1_memory_leak/
./run.sh
```

Then copy the prompt and paste it to Claude.

---

### 2. Performance Bottleneck
**Location:** `2_performance_bottleneck/`

**Bugs:**
- `isPrime()` uses trial division checking all numbers up to N
- `fibonacci()` uses exponential recursion without memoization

**What Claude will find:**
- CPU profile showing 99% time in `isPrime()` and `fibonacci()`
- O(n) algorithm where O(sqrt(n)) would work
- O(2^n) algorithm where O(n) with memoization would work

**How to run:**
```bash
cd 2_performance_bottleneck/
./run.sh
```

Then copy the prompt and paste it to Claude.

---

### 3. Race Condition / Async Bug
**Location:** `3_race_condition/`

**Bugs:**
- `createOrder()` missing `await` - returns before saving completes
- `updateOrderStatus()` has lost update problem (read-modify-write race)
- `processBatch()` uses `Promise.all()` where sequential execution needed

**What Claude will find:**
- Orders created but not findable immediately
- Concurrent updates overwriting each other
- Batch processing completing in unpredictable order

**How to run:**
```bash
cd 3_race_condition/
./run.sh
```

Then copy the prompt and paste it to Claude.

---

### 4. State Corruption / Variable Mutation
**Location:** `4_state_corruption/`

**Bugs:**
- Object reference shared instead of copied (`DEFAULT_SESSION`)
- Helper function `validateAndNormalizePermissions()` unexpectedly mutates state
- Cache invalidation affecting unrelated users (prefix match bug)

**What Claude will find:**
- Multiple sessions sharing the same object reference
- Username getting overwritten when new session created
- Corrupted flag set on all sessions (because they're the same object)
- Cache invalidation cascade due to string prefix matching

**Debugging techniques:**
- Conditional breakpoint: `break when session.corrupted === true`
- Watch variable: `DEFAULT_SESSION`
- Watch expression: `activeSessions.get('user-001').username`
- Step through to observe reference sharing

**How to run:**
```bash
cd 4_state_corruption/
./run.sh
```

Then copy the prompt and paste it to Claude.

---

### 5. Event Loop / Timing Issues
**Location:** `5_event_loop_timing/`

**Bugs:**
- `setTimeout(0)` assumed to execute "immediately" but it's a macrotask
- Mixing Promises (microtasks) with setTimeout (macrotasks) creates unexpected execution order
- Task completion checked too early (before macrotask executes)
- Sequential processing assumption violated by event loop behavior

**What Claude will find:**
- Tasks scheduled with `setTimeout(0)` still pending when checked immediately
- Promise callbacks execute before setTimeout callbacks (microtasks before macrotasks)
- State changes happening in different order than code suggests
- Timing assumptions about "immediate" execution are wrong

**Debugging techniques:**
- Set breakpoints in setTimeout and Promise.then callbacks
- Watch variable: `taskQueue` to see state changes
- Step through to observe actual execution order
- Understand microtask queue vs macrotask queue

**How to run:**
```bash
cd 5_event_loop_timing/
./run.sh
```

Then copy the prompt and paste it to Claude.

---

### 6. WebSocket Connection Leak
**Location:** `6_websocket_leak/`

**Bugs:**
- Message history grows unbounded (`messageHistory` never trimmed)
- User sessions never cleaned up (`userSessions` Map accumulates entries)
- Heartbeat intervals not cleared (`setInterval` without `clearInterval`)
- Connection statistics array grows forever (`connectionDurations`)
- Message buffers not cleared before connection deletion

**What Claude will find:**
- Multiple small leaks that compound over time
- Growing Array, Set, and Timer objects in heap
- Memory stays high even with 0 active connections
- ~10-15 KB leaked per connect/disconnect cycle

**Debugging techniques:**
- Heap snapshot comparison to identify growing object types
- Source code examination to find cleanup gaps
- Stats endpoint monitoring (`/stats`) to track leak indicators
- Understanding WebSocket lifecycle and cleanup requirements

**How to run:**
```bash
cd 6_websocket_leak/
./run.sh

# In another terminal, simulate connections:
deno run --allow-net simulate_connections.ts 50
```

Then copy the prompt and paste it to Claude.

---

### 7. WebSocket Protocol Mismatch
**Location:** `7_websocket_protocol_mismatch/`

**Bugs:**
- Server broadcasts v2 format to all clients (v1 clients can't parse)
- Translation functions exist but are never called (dead code)
- Action format incompatibility: v1 uses string, v2 uses object
- Coordinate format mismatch: v1 flat `{x, y}`, v2 nested `{position: {x, y}}`
- Protocol detection happens per-message instead of per-connection
- Missing protocol negotiation handshake

**What Claude will find:**
- `broadcastToAll()` always sends v2 format regardless of recipient
- V1 clients receive unexpected fields: `version`, `timestamp`, `position` object
- V2 clients receive v1 format sometimes, missing expected fields
- Translation layer bypassed entirely
- ~46% protocol error rate with mixed clients

**Debugging techniques:**
- Breakpoints in `handleMessage()` and `broadcastToAll()`
- Watch expressions: `player.protocol` vs `detectedProtocol`
- Examine message flow from sender to recipients
- Check call stacks to see if translation functions are called (they're not)
- Conditional breakpoint on protocol mismatch

**How to run:**
```bash
cd 7_websocket_protocol_mismatch/
./run.sh

# In another terminal, test both protocols:
deno run --allow-net test_protocol_mismatch.ts
```

Then copy the prompt and paste it to Claude.

---

## 🚀 Quick Start

### Option A: Run a Specific Scenario

```bash
# Pick a scenario and run its script
cd examples/scenarios/1_memory_leak/
./run.sh

# The script will:
# 1. Start the buggy Deno app with --inspect
# 2. Trigger some buggy behavior
# 3. Show you the prompt to give Claude
# 4. Wait for you to finish (Ctrl+C to stop)
```

### Option B: Manual Setup

```bash
# 1. Start the app manually
deno run --inspect=127.0.0.1:9229 --allow-net 1_memory_leak/app.ts

# 2. Copy the prompt
cat 1_memory_leak/prompt.txt

# 3. Paste to Claude and let it investigate
```

## 📊 What Gets Generated

Each investigation creates artifacts in `data/scenarios/<scenario>_<timestamp>/`:

```
investigation_output/
├── REPORT.md                    # Investigation report (Markdown)
├── investigation.json           # Breadcrumb timeline (if used)
├── baseline.heapsnapshot        # Before state (memory leak)
├── after_leak.heapsnapshot      # After state (memory leak)
└── profile.cpuprofile           # CPU profile (performance)
```

## 🔍 Expected Claude Behavior

### Memory Leak Scenario
1. Connects to inspector at ws://127.0.0.1:9229
2. Captures baseline heap snapshot
3. Triggers upload or asks you to
4. Captures comparison snapshot
5. Analyzes growth: ~50MB ArrayBuffer increase
6. Examines code, finds `leakedBuffers.push(buffer)` at line 22
7. Generates report with fix: remove array or clear after processing

### Performance Scenario
1. Connects to inspector
2. Starts CPU profiling
3. Triggers slow endpoint or asks you to
4. Stops profiling after operation completes
5. Analyzes profile:
   - `isPrime()` consuming 95%+ CPU time
   - Trial division checking all numbers up to N
6. Recommends:
   - Only check up to sqrt(N)
   - Consider sieve of Eratosthenes for bulk operations
   - Memoize fibonacci calculations

### Race Condition Scenario
1. Connects to inspector
2. May set breakpoints at promise creation/resolution
3. Traces async execution flow
4. Identifies issues:
   - `createOrder()` missing `await` on `saveToDatabase()`
   - `updateOrderStatus()` read-modify-write without locking
   - `processBatch()` using concurrent when sequential needed
5. Recommends:
   - Add `await` before `saveToDatabase()`
   - Use transaction or optimistic locking for updates
   - Use `for...of` loop instead of `Promise.all()`

## 🧪 Testing the Skill

These scenarios are for **sanity testing**, not automated CI/CD.

**When to use:**
- After installing the skill to verify it works
- After making changes to skill scripts
- To demonstrate the skill to others
- To practice using the skill

**Not for automated testing:**
- These require human interaction (pasting prompts to Claude)
- The run.sh scripts are interactive
- Use `pytest tests/` for automated testing

## 📖 How Claude Uses the Skill

When you give Claude one of these prompts, Claude will:

1. **Read SKILL.md** - Understand its debugging capabilities
2. **Plan investigation** - Form hypothesis based on your description
3. **Connect via CDP** - Use `cdp_client.py` to connect to inspector
4. **Gather data** - Capture heap snapshots, CPU profiles, etc.
5. **Analyze** - Use `heap_analyzer.py`, `cpu_profiler.py` to process data
6. **Track breadcrumbs** - Record every hypothesis, test, finding
7. **Generate report** - Create Org mode document with findings

All using the pre-written helper scripts, so Claude focuses on investigation logic rather than protocol details.

## 🎓 Learning from Scenarios

Each scenario demonstrates a specific debugging pattern:

| Scenario | Pattern | Key Techniques |
|----------|---------|----------------|
| Memory Leak | Compare heap snapshots | Baseline → trigger → compare → analyze growth |
| Performance | CPU profiling | Profile → identify hot paths → analyze algorithm complexity |
| Race Condition | Async flow tracing | Breakpoints → trace execution → identify synchronization issues |
| State Corruption | Variable watching | Conditional breakpoints → watch expressions → step-by-step debugging |
| Event Loop Timing | Execution order analysis | Breakpoint in callbacks → watch queue → understand microtask vs macrotask |
| WebSocket Leak | Multi-source leak analysis | Heap snapshots → identify growing types → source cleanup gaps |
| Protocol Mismatch | Message flow analysis | Breakpoints → watch protocol fields → examine translation layer |

## 🔧 Customizing Scenarios

Want to add your own scenario?

```bash
mkdir examples/scenarios/4_my_scenario/
cd examples/scenarios/4_my_scenario/

# Create your buggy app
cat > app.ts << 'EOF'
// Your Deno app with a specific bug
EOF

# Create the prompt
cat > prompt.txt << 'EOF'
My app has this problem: [describe the bug]
EOF

# Create the runner script (copy from another scenario and modify)
cp ../1_memory_leak/run.sh ./run.sh
# Edit run.sh to match your scenario
```

## 📝 Notes

- All scenarios use the same inspector port (9229), so only run one at a time
- Apps run on different HTTP ports (8000-8006) to avoid conflicts
- Press Ctrl+C to stop the run.sh script and clean up
- Investigation artifacts are timestamped to avoid overwrites
- The skill works best when you describe the observed behavior, not the root cause

## 🎯 Success Criteria

A scenario is working correctly if Claude:
- ✅ Connects to the inspector without errors
- ✅ Captures appropriate diagnostic data (heap snapshots, profiles)
- ✅ Identifies the root cause accurately
- ✅ Generates a comprehensive investigation report
- ✅ Provides actionable fix recommendations

---

**Happy debugging!** 🐛🔍
