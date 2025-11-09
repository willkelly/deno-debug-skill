### Scenario 7: WebSocket Protocol Mismatch

**Difficulty:** Hard
**Category:** State Corruption / Protocol Bug
**Pattern:** Pattern C (Breakpoint + Variable Watching) + Source Code Analysis

## 🎯 Scenario Description

A multiplayer game server that supports two protocol versions (v1 and v2) but has numerous bugs in protocol handling, translation, and compatibility. V1 and V2 clients can't reliably communicate, messages are corrupted, and state becomes inconsistent.

## 🐛 The Bugs

Multiple protocol-related issues:

1. **Broadcast Format Bug** - Server broadcasts v2 format to all clients, breaking v1 clients
2. **Translation Bugs** - Incomplete/incorrect translation between v1 ↔ v2 formats
3. **Action Format Mismatch** - v1 uses `action: "attack"` (string), v2 uses `action: { type: "attack" }` (object)
4. **Coordinate Format** - v1 uses `{x, y}` (flat), v2 uses `position: {x, y}` (nested)
5. **Protocol Detection** - Happens per-message instead of per-connection, can flip mid-session
6. **Missing Negotiation** - No proper version negotiation on connect
7. **Extra Fields** - v2 adds `version` and `timestamp` fields that confuse v1 parsers

## 🔍 Symptoms

- V1 clients receive messages they can't parse (unexpected fields)
- V2 clients receive incomplete data (missing timestamps)
- Actions sent by v1 clients appear as `"[object Object]"` to v2 clients
- Protocol error counter grows rapidly
- Game state becomes inconsistent between clients
- Type errors in console when parsing messages

## 🚀 How to Run

### Terminal 1: Start the Server

```bash
cd examples/scenarios/7_websocket_protocol_mismatch
deno run --inspect --allow-net app.ts
```

You should see:
```
Debugger listening on ws://127.0.0.1:9229
WebSocket Game Server starting on http://localhost:8087
⚠️  This server has intentional protocol mismatch bugs!
```

### Terminal 2: Exercise the Bug

Open the demo UI:
```bash
open http://localhost:8087
```

Then:
1. Click "Connect V1" to connect a legacy client
2. Click "Connect V2" to connect a new client
3. Click "Move" and "Action" buttons on both clients
4. Watch the messages - V1 will receive unparseable v2 messages
5. Check `/stats` endpoint to see `protocolErrors` growing

Or use the test script:
```bash
deno run --allow-net test_protocol_mismatch.ts
```

### Terminal 3: Ask Claude to Investigate

```
You: "My multiplayer game server supports two protocol versions, but v1 and v2 clients
can't play together. V1 clients get parsing errors, actions appear corrupted, and game
state is inconsistent. Can you investigate the protocol handling?"
```

## 🔬 Investigation Approach

Claude should use **Pattern C + Source Analysis**:

1. **Set breakpoints** in message handling code
   ```typescript
   await client.setBreakpointByUrl("file:///app.ts", 124); // handleMessage
   await client.setBreakpointByUrl("file:///app.ts", 170); // broadcastToAll
   ```

2. **Watch variables** to see protocol mismatches
   ```typescript
   // Watch detectedProtocol vs player.protocol
   const detectedProtocol = await client.evaluate("detectedProtocol");
   const playerProtocol = await client.evaluate("player.protocol");
   ```

3. **Examine message flow**:
   - V1 client sends: `{ type: "move", x: 10, y: 20 }`
   - Server broadcasts: `{ type: "player_moved", version: "v2", position: {x,y}, timestamp: ... }`
   - V1 client receives v2 format → parsing error!

4. **Analyze translation functions**:
   - `translateV1toV2()` - Line ~70 - Incorrect action translation
   - `translateV2toV1()` - Line ~91 - Lossy translation
   - Never actually called! Server just broadcasts v2 format

5. **Expected findings**:
   - `broadcastToAll()` always sends v2 format (Line ~58)
   - Translation functions exist but aren't used
   - Protocol detection changes per-message (Line ~114)
   - Action format incompatibility (string vs object)

## 📊 Expected Evidence

### Protocol Error Rate

```bash
curl http://localhost:8087/stats
{
  "activePlayers": 2,
  "v1Clients": 1,
  "v2Clients": 1,
  "messageCount": 50,
  "protocolErrors": 23  // 46% error rate!
}
```

### Console Errors (V1 Client)

```javascript
// V1 client trying to parse V2 message
Unexpected field 'version' in message
Unexpected field 'timestamp' in message
Cannot read property 'x' of undefined (expected data.x, got data.position)
```

### Message Examples

**V1 sends:**
```json
{
  "type": "action",
  "playerId": "player-123",
  "action": "attack"
}
```

**Server broadcasts (BUG - v2 format to everyone):**
```json
{
  "type": "player_action",
  "version": "v2",
  "playerId": "player-123",
  "action": { "type": "attack" },
  "timestamp": 1699564723000
}
```

**V1 client receives:** Sees `action` as object, but expects string → `"[object Object]"` or crash

## 🎯 Root Causes to Identify

1. **`broadcastToAll()` ignores client protocol**
   - Location: Line ~58-70
   - Always sends v2 format regardless of recipient
   - Should check `player.protocol` and translate

2. **Translation functions not called**
   - Location: `translateV1toV2()` and `translateV2toV1()` exist but unused
   - `broadcastToAll()` should translate based on recipient protocol
   - Currently dead code

3. **Action format incompatibility**
   - Location: Line ~76 (v1→v2) and Line ~103 (v2→v1)
   - v1: `action: "attack"` (string)
   - v2: `action: { type: "attack" }` (object)
   - Translation incorrectly assigns string to object and vice versa

4. **Per-message protocol detection**
   - Location: Line ~114 `detectProtocolVersion(messageStr)`
   - Should be per-connection, not per-message
   - Can flip mid-session causing further confusion

5. **Missing content negotiation**
   - No handshake to agree on protocol version
   - Client specifies version in URL, but server doesn't validate compatibility
   - Should reject incompatible versions or force upgrade

## ✅ Expected Fix

The fix should include:

```typescript
function broadcastToAll(message: PlayerV2, excludePlayer?: string) {
  for (const [playerId, player] of gameState.players.entries()) {
    if (playerId !== excludePlayer && player.socket.readyState === WebSocket.OPEN) {
      try {
        // FIX: Translate message based on recipient's protocol
        const messageToSend = player.protocol === PROTOCOL_V1
          ? translateV2toV1(message)
          : message;

        player.socket.send(JSON.stringify(messageToSend));
      } catch (error) {
        console.error(`Failed to send to ${playerId}:`, error);
      }
    }
  }
}

function translateV1toV2(v1Msg: PlayerV1): PlayerV2 {
  const v2Msg: PlayerV2 = {
    type: v1Msg.type,
    version: "v2",
    playerId: v1Msg.playerId,
    timestamp: Date.now(),
  };

  if (v1Msg.x !== undefined && v1Msg.y !== undefined) {
    v2Msg.position = { x: v1Msg.x, y: v1Msg.y };
  }

  // FIX: Correct action translation
  if (v1Msg.action) {
    v2Msg.action = { type: v1Msg.action };  // Wrap string in object
  }

  if (v1Msg.message) {
    v2Msg.message = v1Msg.message;
  }

  return v2Msg;
}

function translateV2toV1(v2Msg: PlayerV2): PlayerV1 {
  const v1Msg: PlayerV1 = {
    type: v2Msg.type,
    playerId: v2Msg.playerId,
  };

  if (v2Msg.position) {
    v1Msg.x = v2Msg.position.x;
    v1Msg.y = v2Msg.position.y;
  }

  // FIX: Extract action type string
  if (v2Msg.action) {
    v1Msg.action = v2Msg.action.type;
  }

  if (v2Msg.message) {
    v1Msg.message = v2Msg.message;
  }

  return v1Msg;
}

// FIX: Protocol detection per-connection, not per-message
// Remove detectProtocolVersion() calls from handleMessage()
// Use player.protocol which is set at connection time
```

Additionally, consider:
- Version negotiation handshake
- Deprecation warnings for v1 clients
- Graceful fallback if translation fails
- Protocol compatibility matrix

## 📈 Success Metrics

After the fix:

- Protocol errors drop to 0
- V1 and V2 clients can play together
- Messages are correctly translated between formats
- No unexpected fields in parsed messages
- Game state stays synchronized

**Before Fix:** 46% protocol error rate, incompatible clients
**After Fix:** 0% errors, seamless interoperability

## 🎓 Learning Objectives

This scenario teaches:

1. **Protocol versioning** - Challenges of supporting multiple protocol versions
2. **Message translation** - Converting between incompatible data formats
3. **Type safety** - String vs object type mismatches
4. **State inspection** - Using breakpoints to observe message flow
5. **Backward compatibility** - Maintaining support for legacy clients
6. **Protocol negotiation** - Importance of version handshakes
7. **Content negotiation** - Per-recipient message formatting

## 🔧 Testing the Fix

After applying the fix:

```bash
# Terminal 1: Restart server
deno run --inspect --allow-net app.ts

# Terminal 2: Run protocol test
deno run --allow-net test_protocol_mismatch.ts

# Expected: 0 protocol errors, both clients receive correct formats
```

Check stats:
```bash
curl http://localhost:8087/stats
# Expected: protocolErrors: 0
```

## 📚 Related Scenarios

- **Scenario 4: State Corruption** - Variable mutation causing inconsistent state
- **Scenario 6: WebSocket Leak** - Other WebSocket lifecycle issues
- **Scenario 3: Race Condition** - Async bugs similar to protocol timing issues

## 💡 Hints

<details>
<summary>Hint 1: Where to set breakpoints</summary>

Key breakpoints:
- `handleMessage()` - Line ~114 - See incoming message format
- `broadcastToAll()` - Line ~58 - See outgoing format mismatch
- Translation functions - Lines ~70, ~91 - Check if they're even called (they're not!)

Watch expressions:
- `player.protocol` - Client's expected protocol
- `detectedProtocol` - Per-message detection (unstable)
- `JSON.parse(event.data)` - Actual message structure

</details>

<details>
<summary>Hint 2: Protocol translation strategies</summary>

Three approaches:
1. **Server-side translation** - Translate on broadcast (current approach, but broken)
2. **Client adaptation layer** - Clients handle both formats (complex)
3. **Force upgrade** - Reject v1 clients, require v2 (breaks compatibility)

Best: Fix server-side translation, deprecate v1 gradually

</details>

<details>
<summary>Hint 3: Debugging protocol mismatches</summary>

1. Log all incoming/outgoing messages with protocol tags
2. Set breakpoint when `detectedProtocol !== player.protocol`
3. Check if translation functions are in call stack (they won't be - dead code!)
4. Examine `messageStr` vs `player.protocol` at breakpoint
5. Trace broadcast path to see where translation should happen

</details>

## 🏆 Advanced Challenge

After fixing the basic bugs, try:

1. **Add protocol negotiation** - Client and server agree on version at connect
2. **Add version middleware** - Transparent translation layer
3. **Add backwards compatibility tests** - Automated protocol compatibility matrix
4. **Add deprecation warnings** - Notify v1 clients to upgrade
5. **Support v3 protocol** - Add another version and see if your fixes scale

This tests whether your architecture can handle multiple versions cleanly!
