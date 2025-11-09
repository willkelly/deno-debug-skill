/**
 * WebSocket Chat Server - Memory Leak Scenario
 *
 * BUG: Connection cleanup is incomplete, causing memory leaks
 * Symptoms: Memory grows with each connection/disconnection cycle
 *
 * To run: deno run --inspect --allow-net app.ts
 */

interface ChatMessage {
  type: "join" | "message" | "leave";
  user: string;
  content?: string;
  timestamp: number;
}

interface ConnectionData {
  socket: WebSocket;
  user: string;
  messageBuffer: ChatMessage[];
  heartbeatInterval: number;
  reconnectAttempts: number;
}

// Global state
const connections = new Map<string, ConnectionData>();
const messageHistory: ChatMessage[] = []; // BUG: Never cleaned up
const userSessions = new Map<string, Set<string>>(); // BUG: Sessions never removed

// Statistics tracking (also leaks)
const connectionStats = {
  totalConnections: 0,
  messagesSent: 0,
  bytesTransferred: 0,
  connectionDurations: [] as number[], // BUG: Array grows unbounded
};

function generateUserId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function broadcastMessage(message: ChatMessage, excludeUser?: string) {
  const messageStr = JSON.stringify(message);
  connectionStats.messagesSent++;
  connectionStats.bytesTransferred += messageStr.length;

  for (const [userId, conn] of connections.entries()) {
    if (userId !== excludeUser && conn.socket.readyState === WebSocket.OPEN) {
      try {
        conn.socket.send(messageStr);
      } catch (error) {
        console.error(`Failed to send to ${userId}:`, error);
      }
    }
  }
}

function startHeartbeat(userId: string, conn: ConnectionData) {
  // BUG: Interval is stored but never cleared on disconnect
  const interval = setInterval(() => {
    if (conn.socket.readyState === WebSocket.OPEN) {
      try {
        conn.socket.send(JSON.stringify({ type: "ping" }));
      } catch {
        // Ignore errors
      }
    }
  }, 30000);

  conn.heartbeatInterval = interval as unknown as number;
}

function handleConnection(req: Request): Response {
  const { socket, response } = Deno.upgradeWebSocket(req);
  const userId = generateUserId();

  connectionStats.totalConnections++;
  const connectionStartTime = Date.now();

  const conn: ConnectionData = {
    socket,
    user: userId,
    messageBuffer: [],
    heartbeatInterval: 0,
    reconnectAttempts: 0,
  };

  connections.set(userId, conn);

  // BUG: Create user session tracking but never clean up
  if (!userSessions.has(userId)) {
    userSessions.set(userId, new Set());
  }
  userSessions.get(userId)!.add(Date.now().toString());

  socket.onopen = () => {
    console.log(`WebSocket opened for ${userId}`);

    // Send welcome message
    const welcome = {
      type: "join" as const,
      user: userId,
      timestamp: Date.now(),
    };

    socket.send(JSON.stringify(welcome));

    // Send message history (BUG: History grows unbounded)
    socket.send(JSON.stringify({
      type: "history",
      messages: messageHistory.slice(-50), // Last 50 messages
    }));

    // Start heartbeat (BUG: Never cleaned up)
    startHeartbeat(userId, conn);

    // Broadcast join to others
    broadcastMessage(welcome, userId);
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      const message: ChatMessage = {
        type: "message",
        user: userId,
        content: data.content,
        timestamp: Date.now(),
      };

      // BUG: Message buffer in ConnectionData is never cleared
      conn.messageBuffer.push(message);

      // BUG: Global message history grows forever
      messageHistory.push(message);

      // Broadcast to all other clients
      broadcastMessage(message, userId);
    } catch (error) {
      console.error(`Error handling message from ${userId}:`, error);
    }
  };

  socket.onerror = (error) => {
    console.error(`WebSocket error for ${userId}:`, error);
  };

  socket.onclose = () => {
    console.log(`WebSocket closed for ${userId}`);

    // Track connection duration (BUG: Array grows unbounded)
    const duration = Date.now() - connectionStartTime;
    connectionStats.connectionDurations.push(duration);

    const leaveMessage: ChatMessage = {
      type: "leave",
      user: userId,
      timestamp: Date.now(),
    };

    // BUG: Only remove from connections map, but:
    // - messageHistory still contains all messages
    // - userSessions still contains session data
    // - heartbeatInterval is never cleared (keeps running!)
    // - messageBuffer in ConnectionData is not cleared before removal
    // - connectionStats.connectionDurations grows forever
    connections.delete(userId);

    // Broadcast leave to remaining clients
    broadcastMessage(leaveMessage);
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
      activeConnections: connections.size,
      totalConnections: connectionStats.totalConnections,
      messagesSent: connectionStats.messagesSent,
      bytesTransferred: connectionStats.bytesTransferred,
      messageHistorySize: messageHistory.length,
      userSessionsSize: userSessions.size,
      connectionDurationsTracked: connectionStats.connectionDurations.length,
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
  <title>WebSocket Chat</title>
  <style>
    body { font-family: Arial; max-width: 800px; margin: 50px auto; padding: 20px; }
    #messages { border: 1px solid #ccc; height: 400px; overflow-y: scroll; padding: 10px; margin-bottom: 10px; }
    #input { width: 80%; padding: 10px; }
    #send { padding: 10px 20px; }
    .message { margin: 5px 0; }
    .join { color: green; }
    .leave { color: red; }
  </style>
</head>
<body>
  <h1>WebSocket Chat (Leaky)</h1>
  <div id="messages"></div>
  <input type="text" id="input" placeholder="Type a message...">
  <button id="send">Send</button>
  <button id="disconnect">Disconnect</button>

  <script>
    let ws = null;
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');

    function connect() {
      ws = new WebSocket('ws://' + location.host + '/ws');

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const msg = document.createElement('div');
        msg.className = 'message ' + data.type;
        msg.textContent = data.type === 'message'
          ? \`\${data.user}: \${data.content}\`
          : \`\${data.user} \${data.type}ed\`;
        messages.appendChild(msg);
        messages.scrollTop = messages.scrollHeight;
      };

      ws.onclose = () => {
        const msg = document.createElement('div');
        msg.textContent = 'Disconnected';
        msg.style.color = 'red';
        messages.appendChild(msg);
      };
    }

    document.getElementById('send').onclick = () => {
      if (ws && ws.readyState === WebSocket.OPEN && input.value) {
        ws.send(JSON.stringify({ content: input.value }));
        input.value = '';
      }
    };

    document.getElementById('disconnect').onclick = () => {
      if (ws) ws.close();
    };

    input.onkeypress = (e) => {
      if (e.key === 'Enter') document.getElementById('send').click();
    };

    connect();
  </script>
</body>
</html>
  `, {
    headers: { "Content-Type": "text/html" },
  });
}

const PORT = 8086;
console.log(`WebSocket Chat Server starting on http://localhost:${PORT}`);
console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
console.log(`Stats endpoint: http://localhost:${PORT}/stats`);
console.log("");
console.log("⚠️  This server has intentional memory leaks for debugging practice!");
console.log("   - Message history grows unbounded");
console.log("   - User sessions are never cleaned up");
console.log("   - Heartbeat intervals are not cleared");
console.log("   - Connection statistics arrays grow forever");
console.log("");
console.log("Connect clients, disconnect them, and watch memory grow...");

Deno.serve({ port: PORT }, handleHttpRequest);
