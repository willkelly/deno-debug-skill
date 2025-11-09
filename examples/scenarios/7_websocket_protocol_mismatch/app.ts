/**
 * WebSocket Game Server - Protocol Mismatch Scenario
 *
 * BUG: Server doesn't properly handle protocol version differences
 * Symptoms: Old clients can't play with new clients, state corruption, dropped messages
 *
 * To run: deno run --inspect --allow-net app.ts
 */

// Protocol versions
const PROTOCOL_V1 = "v1";
const PROTOCOL_V2 = "v2";
const CURRENT_PROTOCOL = PROTOCOL_V2;

interface PlayerV1 {
  type: "move" | "action" | "chat";
  playerId: string;
  x?: number;
  y?: number;
  action?: string;
  message?: string;
}

interface PlayerV2 {
  type: "move" | "action" | "chat";
  version: string; // NEW in v2
  playerId: string;
  timestamp: number; // NEW in v2
  position?: { x: number; y: number }; // CHANGED: nested object
  action?: { type: string; target?: string }; // CHANGED: nested object
  message?: string;
}

type PlayerMessage = PlayerV1 | PlayerV2;

interface GameState {
  players: Map<
    string,
    {
      socket: WebSocket;
      protocol: string;
      position: { x: number; y: number };
      score: number;
      lastSeen: number;
    }
  >;
  messageCount: number;
  v1Clients: number;
  v2Clients: number;
  protocolErrors: number;
}

const gameState: GameState = {
  players: new Map(),
  messageCount: 0,
  v1Clients: 0,
  v2Clients: 0,
  protocolErrors: 0,
};

function detectProtocolVersion(message: string): string {
  try {
    const data = JSON.parse(message);
    // BUG: Simple version detection that can fail
    return data.version === "v2" ? PROTOCOL_V2 : PROTOCOL_V1;
  } catch {
    return PROTOCOL_V1; // BUG: Assume v1 on parse error
  }
}

function broadcastToAll(message: unknown, excludePlayer?: string) {
  const messageStr = JSON.stringify(message);

  for (const [playerId, player] of gameState.players.entries()) {
    if (playerId !== excludePlayer && player.socket.readyState === WebSocket.OPEN) {
      try {
        // BUG: Sends message in v2 format to all clients,
        // even v1 clients that don't understand it
        player.socket.send(messageStr);
      } catch (error) {
        console.error(`Failed to send to ${playerId}:`, error);
      }
    }
  }
}

function translateV1toV2(v1Msg: PlayerV1): PlayerV2 {
  // BUG: Incomplete translation - doesn't handle all cases
  const v2Msg: PlayerV2 = {
    type: v1Msg.type,
    version: "v2",
    playerId: v1Msg.playerId,
    timestamp: Date.now(),
  };

  if (v1Msg.x !== undefined && v1Msg.y !== undefined) {
    v2Msg.position = { x: v1Msg.x, y: v1Msg.y };
  }
  // BUG: action field translation is wrong - v1.action is string, v2.action is object
  if (v1Msg.action) {
    // @ts-expect-error: Wrong type assignment
    v2Msg.action = v1Msg.action; // Should be { type: v1Msg.action }
  }

  if (v1Msg.message) {
    v2Msg.message = v1Msg.message;
  }

  return v2Msg;
}

function translateV2toV1(v2Msg: PlayerV2): PlayerV1 {
  // BUG: Lossy translation - drops timestamp, nested structure
  const v1Msg: PlayerV1 = {
    type: v2Msg.type,
    playerId: v2Msg.playerId,
  };

  if (v2Msg.position) {
    v1Msg.x = v2Msg.position.x;
    v1Msg.y = v2Msg.position.y;
  }

  if (v2Msg.action) {
    // BUG: v2.action is object, v1.action is string
    // This will result in "[object Object]" or undefined behavior
    v1Msg.action = v2Msg.action.type || String(v2Msg.action);
  }

  if (v2Msg.message) {
    v1Msg.message = v2Msg.message;
  }

  return v1Msg;
}

function handleMessage(playerId: string, messageStr: string) {
  try {
    gameState.messageCount++;

    const player = gameState.players.get(playerId);
    if (!player) {
      console.error(`Player ${playerId} not found`);
      return;
    }

    const data = JSON.parse(messageStr);

    // BUG: Protocol detection happens per-message, not per-connection
    // This can change mid-session if message format varies
    const detectedProtocol = detectProtocolVersion(messageStr);

    if (detectedProtocol !== player.protocol) {
      console.warn(
        `Protocol mismatch for ${playerId}: expected ${player.protocol}, got ${detectedProtocol}`,
      );
      gameState.protocolErrors++;
      // BUG: Continue processing anyway, leading to corruption
    }

    // Process based on message type
    if (data.type === "move") {
      // BUG: Different coordinate handling for v1 vs v2
      if (player.protocol === PROTOCOL_V1) {
        if (data.x !== undefined && data.y !== undefined) {
          player.position = { x: data.x, y: data.y };
        }
      } else {
        // v2 client
        if (data.position) {
          player.position = data.position;
        } else if (data.x !== undefined) {
          // BUG: Fallback to v1 format, but this creates inconsistency
          player.position = { x: data.x, y: data.y };
        }
      }

      player.lastSeen = Date.now();

      // BUG: Broadcast in v2 format to everyone (breaks v1 clients)
      broadcastToAll({
        type: "player_moved",
        version: "v2", // v1 clients don't expect this field
        playerId,
        position: player.position,
        timestamp: Date.now(),
      });
    } else if (data.type === "action") {
      // BUG: Action handling doesn't account for v1 string vs v2 object
      let actionType: string;

      if (player.protocol === PROTOCOL_V1) {
        actionType = typeof data.action === "string" ? data.action : "";
      } else {
        actionType = data.action?.type || "";
      }

      if (actionType === "attack") {
        player.score += 10;
      }

      player.lastSeen = Date.now();

      // BUG: Broadcast always uses v2 format
      broadcastToAll({
        type: "player_action",
        version: "v2",
        playerId,
        action: { type: actionType }, // v1 clients expect action: "attack"
        timestamp: Date.now(),
      });
    } else if (data.type === "chat") {
      // Chat is simple enough that both versions work... mostly
      broadcastToAll({
        type: "chat",
        version: "v2", // BUG: v1 clients don't expect version field
        playerId,
        message: data.message,
        timestamp: Date.now(), // BUG: v1 clients don't expect timestamp
      });
    }
  } catch (error) {
    console.error(`Error handling message from ${playerId}:`, error);
    gameState.protocolErrors++;
  }
}

function handleConnection(req: Request): Response {
  const url = new URL(req.url);
  const protocolVersion = url.searchParams.get("version") || PROTOCOL_V1;

  const { socket, response } = Deno.upgradeWebSocket(req);
  const playerId = `player-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  // Track protocol version
  if (protocolVersion === PROTOCOL_V2) {
    gameState.v2Clients++;
  } else {
    gameState.v1Clients++;
  }

  console.log(`Player ${playerId} connected with protocol ${protocolVersion}`);

  socket.onopen = () => {
    const player = {
      socket,
      protocol: protocolVersion,
      position: { x: 0, y: 0 },
      score: 0,
      lastSeen: Date.now(),
    };

    gameState.players.set(playerId, player);

    // Send welcome message
    // BUG: Welcome message format depends on server's current version,
    // not the client's protocol version
    if (protocolVersion === PROTOCOL_V2) {
      socket.send(JSON.stringify({
        type: "welcome",
        version: "v2",
        playerId,
        serverProtocol: CURRENT_PROTOCOL,
        timestamp: Date.now(),
      }));
    } else {
      // v1 format
      socket.send(JSON.stringify({
        type: "welcome",
        playerId,
        // BUG: Missing serverProtocol info for v1 clients
      }));
    }

    // Broadcast join (BUG: always in v2 format)
    broadcastToAll({
      type: "player_joined",
      version: "v2",
      playerId,
      timestamp: Date.now(),
    }, playerId);
  };

  socket.onmessage = (event) => {
    handleMessage(playerId, event.data);
  };

  socket.onerror = (error) => {
    console.error(`WebSocket error for ${playerId}:`, error);
  };

  socket.onclose = () => {
    console.log(`Player ${playerId} disconnected`);

    const player = gameState.players.get(playerId);
    if (player) {
      if (player.protocol === PROTOCOL_V2) {
        gameState.v2Clients--;
      } else {
        gameState.v1Clients--;
      }
    }

    gameState.players.delete(playerId);

    broadcastToAll({
      type: "player_left",
      version: "v2",
      playerId,
      timestamp: Date.now(),
    });
  };

  return response;
}

async function handleHttpRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/ws") {
    return handleConnection(req);
  }

  if (url.pathname === "/stats") {
    return new Response(JSON.stringify({
      activePlayers: gameState.players.size,
      v1Clients: gameState.v1Clients,
      v2Clients: gameState.v2Clients,
      messageCount: gameState.messageCount,
      protocolErrors: gameState.protocolErrors,
    }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(`
<!DOCTYPE html>
<html>
<head>
  <title>WebSocket Game - Protocol Mismatch Demo</title>
  <style>
    body { font-family: monospace; max-width: 900px; margin: 20px auto; }
    .client { border: 2px solid #ccc; padding: 15px; margin: 10px 0; }
    .v1 { border-color: #e74c3c; }
    .v2 { border-color: #3498db; }
    #messages { height: 200px; overflow-y: scroll; border: 1px solid #ddd; padding: 10px; background: #f9f9f9; }
    button { margin: 5px; padding: 8px 15px; }
    .error { color: red; font-weight: bold; }
    .warning { color: orange; }
  </style>
</head>
<body>
  <h1>WebSocket Game - Protocol Mismatch Demo</h1>
  <p>⚠️ This server has intentional protocol version bugs!</p>

  <div class="client v1">
    <h3>V1 Client (Legacy)</h3>
    <button onclick="connectV1()">Connect V1</button>
    <button onclick="moveV1()">Move (x,y)</button>
    <button onclick="actionV1()">Action (string)</button>
    <button onclick="disconnectV1()">Disconnect</button>
  </div>

  <div class="client v2">
    <h3>V2 Client (New)</h3>
    <button onclick="connectV2()">Connect V2</button>
    <button onclick="moveV2()">Move (position obj)</button>
    <button onclick="actionV2()">Action (obj)</button>
    <button onclick="disconnectV2()">Disconnect</button>
  </div>

  <h3>Messages</h3>
  <div id="messages"></div>

  <script>
    let wsV1 = null;
    let wsV2 = null;
    const messages = document.getElementById('messages');

    function log(msg, type = 'info') {
      const div = document.createElement('div');
      div.className = type;
      div.textContent = new Date().toLocaleTimeString() + ': ' + msg;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function connectV1() {
      wsV1 = new WebSocket('ws://' + location.host + '/ws?version=v1');
      wsV1.onmessage = (e) => log('V1 received: ' + e.data, 'info');
      wsV1.onerror = () => log('V1 error', 'error');
      wsV1.onopen = () => log('V1 connected', 'info');
    }

    function connectV2() {
      wsV2 = new WebSocket('ws://' + location.host + '/ws?version=v2');
      wsV2.onmessage = (e) => log('V2 received: ' + e.data, 'info');
      wsV2.onerror = () => log('V2 error', 'error');
      wsV2.onopen = () => log('V2 connected', 'info');
    }

    function moveV1() {
      if (wsV1 && wsV1.readyState === WebSocket.OPEN) {
        wsV1.send(JSON.stringify({ type: 'move', playerId: 'v1-client', x: 10, y: 20 }));
        log('V1 sent move (x,y format)', 'info');
      }
    }

    function moveV2() {
      if (wsV2 && wsV2.readyState === WebSocket.OPEN) {
        wsV2.send(JSON.stringify({
          type: 'move',
          version: 'v2',
          playerId: 'v2-client',
          position: { x: 15, y: 25 },
          timestamp: Date.now()
        }));
        log('V2 sent move (position obj format)', 'info');
      }
    }

    function actionV1() {
      if (wsV1 && wsV1.readyState === WebSocket.OPEN) {
        wsV1.send(JSON.stringify({ type: 'action', playerId: 'v1-client', action: 'attack' }));
        log('V1 sent action (string format)', 'info');
      }
    }

    function actionV2() {
      if (wsV2 && wsV2.readyState === WebSocket.OPEN) {
        wsV2.send(JSON.stringify({
          type: 'action',
          version: 'v2',
          playerId: 'v2-client',
          action: { type: 'attack', target: 'enemy1' },
          timestamp: Date.now()
        }));
        log('V2 sent action (object format)', 'info');
      }
    }

    function disconnectV1() {
      if (wsV1) { wsV1.close(); log('V1 disconnected', 'info'); }
    }

    function disconnectV2() {
      if (wsV2) { wsV2.close(); log('V2 disconnected', 'info'); }
    }
  </script>
</body>
</html>
  `, {
    headers: { "Content-Type": "text/html" },
  });
}

const PORT = 8087;
console.log(`WebSocket Game Server starting on http://localhost:${PORT}`);
console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws?version=v1|v2`);
console.log(`Stats endpoint: http://localhost:${PORT}/stats`);
console.log("");
console.log("⚠️  This server has intentional protocol mismatch bugs!");
console.log("   - V2 messages broadcast to V1 clients (parsing failures)");
console.log("   - Incompatible action format (string vs object)");
console.log("   - Coordinate format mismatch (flat vs nested)");
console.log("   - Protocol detection can change mid-session");
console.log("   - Missing protocol negotiation");
console.log("");
console.log("Connect both V1 and V2 clients and watch the chaos...");

Deno.serve({ port: PORT }, handleHttpRequest);
