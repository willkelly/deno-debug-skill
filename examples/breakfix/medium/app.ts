/**
 * Real-time Chat Server
 *
 * WebSocket-based chat server supporting multiple rooms and private messages.
 *
 * PROBLEM REPORT:
 * The chat server works fine initially, but after running for a few hours with
 * active users connecting/disconnecting:
 * - Messages start getting duplicated (users see the same message 2-3 times)
 * - Memory usage grows steadily
 * - Server becomes sluggish over time
 *
 * The issue gets worse as users reconnect. A user who reconnects 5 times might
 * see messages duplicated 5 times.
 *
 * TO TEST:
 * 1. Start: deno run --inspect --allow-net medium/app.ts
 * 2. Connect multiple times: websocat ws://localhost:8081/chat/alice
 * 3. Send messages and watch for duplication
 * 4. Monitor memory growth with heap snapshots
 */

interface User {
  id: string;
  username: string;
  ws: WebSocket;
  rooms: Set<string>;
  connectedAt: number;
  messageCount: number;
}

interface ChatMessage {
  type: "message" | "join" | "leave" | "error";
  from?: string;
  to?: string;
  room?: string;
  text?: string;
  timestamp: number;
}

class ChatServer {
  private users = new Map<string, User>();
  private rooms = new Map<string, Set<string>>(); // room -> user IDs
  private messageHandlers: Array<(msg: ChatMessage, userId: string) => void> = [];

  constructor() {
    // Set up message routing
    this.setupMessageHandlers();
  }

  private setupMessageHandlers() {
    // Handler for room messages
    this.messageHandlers.push((msg, userId) => {
      if (msg.type === "message" && msg.room) {
        this.broadcastToRoom(msg.room, msg, userId);
      }
    });

    // Handler for private messages
    this.messageHandlers.push((msg, userId) => {
      if (msg.type === "message" && msg.to) {
        this.sendPrivateMessage(msg, userId);
      }
    });

    // Handler for logging
    this.messageHandlers.push((msg, userId) => {
      const user = this.users.get(userId);
      if (user) {
        user.messageCount++;
      }
    });
  }

  async handleConnection(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathMatch = url.pathname.match(/^\/chat\/(\w+)$/);

    if (!pathMatch) {
      return new Response("Invalid path. Use /chat/:username", { status: 400 });
    }

    const username = pathMatch[1];

    // Upgrade to WebSocket
    const { socket, response } = Deno.upgradeWebSocket(req);

    const userId = `${username}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const user: User = {
      id: userId,
      username,
      ws: socket,
      rooms: new Set(["general"]),
      connectedAt: Date.now(),
      messageCount: 0,
    };

    socket.onopen = () => {
      this.users.set(userId, user);
      this.joinRoom(userId, "general");

      // Send welcome message
      this.sendToUser(userId, {
        type: "message",
        from: "System",
        text: `Welcome ${username}! You're in room 'general'`,
        timestamp: Date.now(),
      });

      console.log(`✓ ${username} connected (${this.users.size} total users)`);

      // Set up connection-specific handlers
      const heartbeatHandler = () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
        }
      };

      // Send heartbeat every 30 seconds
      const heartbeatInterval = setInterval(heartbeatHandler, 30000);

      // Add cleanup when socket closes
      socket.addEventListener("close", () => {
        clearInterval(heartbeatInterval);
      });
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ChatMessage;
        msg.from = username;
        msg.timestamp = Date.now();

        // Process through all message handlers
        for (const handler of this.messageHandlers) {
          handler(msg, userId);
        }
      } catch (error) {
        this.sendToUser(userId, {
          type: "error",
          text: `Invalid message: ${error}`,
          timestamp: Date.now(),
        });
      }
    };

    socket.onerror = (error) => {
      console.error(`WebSocket error for ${username}:`, error);
    };

    socket.onclose = () => {
      const user = this.users.get(userId);
      if (user) {
        for (const room of user.rooms) {
          this.leaveRoom(userId, room);
        }
        this.users.delete(userId);
      }
      console.log(`✗ ${username} disconnected (${this.users.size} remaining)`);
    };

    return response;
  }

  private joinRoom(userId: string, roomName: string) {
    const user = this.users.get(userId);
    if (!user) return;

    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }

    this.rooms.get(roomName)!.add(userId);
    user.rooms.add(roomName);

    this.broadcastToRoom(roomName, {
      type: "join",
      from: user.username,
      room: roomName,
      timestamp: Date.now(),
    });
  }

  private leaveRoom(userId: string, roomName: string) {
    const user = this.users.get(userId);
    if (!user) return;

    const room = this.rooms.get(roomName);
    if (room) {
      room.delete(userId);
      if (room.size === 0) {
        this.rooms.delete(roomName);
      }
    }

    user.rooms.delete(roomName);

    this.broadcastToRoom(roomName, {
      type: "leave",
      from: user.username,
      room: roomName,
      timestamp: Date.now(),
    });
  }

  private broadcastToRoom(roomName: string, msg: ChatMessage, excludeUserId?: string) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    const msgStr = JSON.stringify(msg);
    for (const userId of room) {
      if (userId !== excludeUserId) {
        const user = this.users.get(userId);
        if (user && user.ws.readyState === WebSocket.OPEN) {
          user.ws.send(msgStr);
        }
      }
    }
  }

  private sendPrivateMessage(msg: ChatMessage, fromUserId: string) {
    const toUser = Array.from(this.users.values()).find((u) => u.username === msg.to);

    if (toUser && toUser.ws.readyState === WebSocket.OPEN) {
      toUser.ws.send(JSON.stringify(msg));
    } else {
      this.sendToUser(fromUserId, {
        type: "error",
        text: `User ${msg.to} not found`,
        timestamp: Date.now(),
      });
    }
  }

  private sendToUser(userId: string, msg: ChatMessage) {
    const user = this.users.get(userId);
    if (user && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(JSON.stringify(msg));
    }
  }

  getStats() {
    return {
      totalUsers: this.users.size,
      rooms: Array.from(this.rooms.entries()).map(([name, users]) => ({
        name,
        userCount: users.size,
      })),
      messageHandlers: this.messageHandlers.length,
    };
  }
}

const chatServer = new ChatServer();

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname.startsWith("/chat/")) {
    return chatServer.handleConnection(req);
  }

  if (url.pathname === "/stats") {
    return Response.json(chatServer.getStats());
  }

  return new Response(
    `WebSocket Chat Server

Connect: ws://localhost:8081/chat/:username
Stats:   http://localhost:8081/stats

Example:
  websocat ws://localhost:8081/chat/alice

Send message:
  {"type":"message","room":"general","text":"Hello!"}
  {"type":"message","to":"bob","text":"Private message"}
`,
    { headers: { "content-type": "text/plain" } },
  );
}

console.log("💬 Chat server starting on http://localhost:8081");
console.log("   Connect: ws://localhost:8081/chat/:username");
console.log("   Stats:   http://localhost:8081/stats");
console.log("");
console.log("⚠️  BUG: After multiple reconnections:");
console.log("    - Messages get duplicated");
console.log("    - Memory grows steadily");
console.log("    Try reconnecting the same user 3-4 times");

Deno.serve({ port: 8081 }, handleRequest);
