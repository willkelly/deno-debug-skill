# Scenario 6: WebSocket Connection Leak

**Difficulty:** Medium
**Category:** Memory Leak
**Pattern:** Pattern A (Memory Leak Investigation)

## 🎯 Scenario Description

A WebSocket chat server that exhibits memory leaks from improper connection cleanup. Every time a client connects and disconnects, memory is leaked through multiple mechanisms.

## 🐛 The Bug

The server has **multiple memory leaks**:

1. **Message History Growth** - `messageHistory` array grows unbounded, never cleaned up
2. **User Session Tracking** - `userSessions` Map accumulates data, never removes old sessions
3. **Heartbeat Intervals** - `setInterval` timers are created but never cleared on disconnect
4. **Connection Statistics** - `connectionDurations` array grows with every connection
5. **Message Buffers** - Each `ConnectionData` has a `messageBuffer` that's never cleared

## 🔍 Symptoms

- Memory grows steadily with each connect/disconnect cycle
- Growth is more pronounced than active connections would suggest
- Multiple small leaks compound over time
- Even with 0 active connections, memory remains high

## 🚀 How to Run

### Terminal 1: Start the Server

```bash
cd examples/scenarios/6_websocket_leak
deno run --inspect --allow-net app.ts
```

You should see:
```
Debugger listening on ws://127.0.0.1:9229
WebSocket Chat Server starting on http://localhost:8086
⚠️  This server has intentional memory leaks for debugging practice!
```

### Terminal 2: Exercise the Leak

Open the chat UI in your browser:
```bash
open http://localhost:8086
```

Or use the provided test script to simulate many connections:
```bash
deno run --allow-net simulate_connections.ts
```

Or manually simulate with WebSocket clients:
```bash
# Connect 100 clients, send messages, disconnect
for i in {1..100}; do
  curl -N -H "Connection: Upgrade" \
       -H "Upgrade: websocket" \
       -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
       -H "Sec-WebSocket-Version: 13" \
       http://localhost:8086/ws &
  sleep 0.1
done
```

### Terminal 3: Ask Claude to Investigate

```
You: "My WebSocket chat server is leaking memory. After clients connect and disconnect,
memory stays high even with no active connections. Can you investigate?"
```

## 🔬 Investigation Approach

Claude should follow **Pattern A: Memory Leak Investigation**:

1. **Capture baseline heap snapshot**
   ```typescript
   await captureSnapshot(client, "baseline.heapsnapshot");
   ```

2. **Trigger the leak** - Connect and disconnect multiple clients

3. **Capture comparison snapshot**
   ```typescript
   await captureSnapshot(client, "after.heapsnapshot");
   ```

4. **Compare snapshots** - Use fast mode for quick analysis
   ```typescript
   const comparison = await compareSnapshotsFast(
     "baseline.heapsnapshot",
     "after.heapsnapshot"
   );
   ```

5. **Expected findings:**
   - Growing `Array` objects (messageHistory, connectionDurations, messageBuffers)
   - Growing `Set` objects (userSessions values)
   - Lingering `Timer` objects (heartbeat intervals not cleared)
   - Growing `ChatMessage` objects

6. **Examine source code** to find why cleanup is incomplete

## 📊 Expected Evidence

### Heap Snapshot Comparison

| Type | Count Before | Count After | Growth |
|------|--------------|-------------|--------|
| Array | ~50 | ~150 | +100 |
| Set | 0 | 20 | +20 |
| Timer | 0 | 20 | +20 (active intervals) |
| ChatMessage | 0 | 500+ | +500 |
| String | ~1000 | ~2500 | +1500 |

### Memory Growth Rate

- ~5-10 KB per connection (message history)
- ~2-3 KB per connection (user sessions)
- ~1 KB per connection (connection stats)
- Timer overhead for each uncleaned heartbeat

**Total:** ~10-15 KB per connect/disconnect cycle

With 100 connections: **~1-1.5 MB leaked**

## 🎯 Root Causes to Identify

1. **`messageHistory` never trimmed**
   - Location: Line ~109
   - Grows unbounded as messages accumulate
   - Should use LRU cache or max size limit

2. **`userSessions` never cleaned**
   - Location: Line ~89-92
   - Map entries are added but never removed
   - Should clean up on disconnect

3. **`heartbeatInterval` never cleared**
   - Location: Line ~53-62
   - `setInterval` called but `clearInterval` never called
   - Should call `clearInterval(conn.heartbeatInterval)` in `onclose`

4. **`connectionStats.connectionDurations` grows forever**
   - Location: Line ~137
   - Array grows with every connection
   - Should use fixed-size circular buffer or periodic cleanup

5. **`conn.messageBuffer` not cleared before deletion**
   - Location: Line ~112
   - Buffer accumulates messages but never cleared
   - Should call `conn.messageBuffer.length = 0` before `connections.delete()`

## ✅ Expected Fix

The fix should include:

```typescript
socket.onclose = () => {
  console.log(`WebSocket closed for ${userId}`);

  const conn = connections.get(userId);
  if (!conn) return;

  // FIX 1: Clear heartbeat interval
  clearInterval(conn.heartbeatInterval);

  // FIX 2: Clear message buffer before deletion
  conn.messageBuffer.length = 0;

  // FIX 3: Remove user session
  userSessions.delete(userId);

  // FIX 4: Limit connection durations tracking
  const duration = Date.now() - connectionStartTime;
  connectionStats.connectionDurations.push(duration);
  if (connectionStats.connectionDurations.length > 1000) {
    connectionStats.connectionDurations = connectionStats.connectionDurations.slice(-1000);
  }

  // FIX 5: Limit message history size
  if (messageHistory.length > 100) {
    messageHistory.splice(0, messageHistory.length - 100);
  }

  connections.delete(userId);
  broadcastMessage(leaveMessage);
};
```

## 📈 Success Metrics

After the fix:

- Memory stabilizes after clients disconnect
- No growth with 0 active connections
- Bounded memory usage (message history capped at 100)
- No lingering timers
- Clean disconnect cleanup

**Before Fix:** 1.5 MB leaked per 100 connections
**After Fix:** <10 KB per 100 connections (only active connection overhead)

## 🎓 Learning Objectives

This scenario teaches:

1. **Multiple leak sources** - Real-world leaks often have multiple causes
2. **Timer cleanup** - `setInterval`/`setTimeout` must be cleared
3. **Collection growth** - Arrays/Maps need size limits or cleanup policies
4. **Cleanup order** - Must clean up all resources before deletion
5. **WebSocket lifecycle** - Proper connection/disconnection handling
6. **Heap snapshot analysis** - Identifying growing object types and their sources

## 🔧 Testing the Fix

After applying the fix:

```bash
# Terminal 1: Restart server
deno run --inspect --allow-net app.ts

# Terminal 2: Simulate connections
deno run --allow-net simulate_connections.ts

# Terminal 3: Check stats endpoint
curl http://localhost:8086/stats

# Expected: messageHistorySize <= 100, userSessionsSize = active connections
```

Then investigate again with Claude - should see minimal growth!

## 📚 Related Scenarios

- **Scenario 1: Memory Leak** - Simpler single-leak scenario
- **Scenario 3: Race Condition** - WebSocket race conditions in message ordering
- **Scenario 4: State Corruption** - Shared state issues with multiple connections

## 💡 Hints

<details>
<summary>Hint 1: What to look for in heap snapshots</summary>

Focus on:
- Growing Array counts (messageHistory, connectionDurations)
- Growing Map/Set sizes (userSessions)
- Timer objects (heartbeat intervals)
- String duplicates (message content)

</details>

<details>
<summary>Hint 2: Common WebSocket leak patterns</summary>

WebSocket applications commonly leak through:
1. Event listeners not removed
2. Timers (heartbeat/keepalive) not cleared
3. Message buffers not bounded
4. Session/tracking data not cleaned up
5. Reconnection state not garbage collected

</details>

<details>
<summary>Hint 3: How to verify the fix</summary>

1. Run heap comparison before/after fix
2. Connect 100 clients, disconnect all
3. Memory should return to ~baseline
4. Check `/stats` endpoint - bounded sizes
5. Run for hours - no continuous growth

</details>
