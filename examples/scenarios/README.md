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
data/scenarios/memory_leak_20251108_123456/
├── app.log                      # Deno app output
├── investigation.json           # Breadcrumb timeline
├── investigation_report.org     # Full Org mode report (or REPORT.md)
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
- Apps run on different HTTP ports (8000, 8001, 8002) to avoid conflicts
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
