/**
 * State Corruption / Variable Mutation Bug
 *
 * This app has a subtle bug where shared state gets corrupted through
 * unexpected mutations. Requires careful variable watching and conditional
 * breakpoints to track down.
 *
 * The bugs:
 * 1. Object reference shared when it should be copied
 * 2. State mutated unexpectedly by a helper function
 * 3. Cache invalidation happening at the wrong time
 *
 * To debug:
 * 1. deno run --inspect --allow-net examples/scenarios/4_state_corruption/app.ts
 * 2. Use breakpoints and variable watches to track state changes
 * 3. Conditional breakpoint: break only when state.corrupted === true
 */

// User session state
interface UserSession {
  userId: string;
  username: string;
  permissions: string[];
  lastActivity: number;
  metadata: Record<string, any>;
  corrupted?: boolean; // Debug flag
}

// Active sessions (this will get corrupted!)
const activeSessions: Map<string, UserSession> = new Map();

// Default session template (BUG: This gets mutated!)
const DEFAULT_SESSION: UserSession = {
  userId: "unknown",
  username: "guest",
  permissions: ["read"],
  lastActivity: Date.now(),
  metadata: {},
};

/**
 * BUG 1: Creates session by reference instead of copy
 * This means all sessions share the same object!
 */
function createSession(userId: string, username: string): UserSession {
  console.log(`Creating session for ${username}...`);

  // BUG: Should do a deep copy, but we're just using the reference
  const session = DEFAULT_SESSION;

  // These mutations affect the DEFAULT_SESSION object!
  session.userId = userId;
  session.username = username;
  session.lastActivity = Date.now();

  // This will cause all sessions to share the same metadata object
  session.metadata = {}; // Still a problem!

  activeSessions.set(userId, session);

  console.log(`  Session created for ${username}`);
  return session;
}

/**
 * BUG 2: Helper function unexpectedly mutates session
 * The name suggests it's just validating, but it modifies state!
 */
function validateAndNormalizePermissions(session: UserSession): boolean {
  console.log(`Validating permissions for ${session.username}...`);

  // BUG: This function name suggests it's read-only, but it mutates!
  if (session.permissions.length === 0) {
    // Sneaky mutation - adds default permissions
    session.permissions.push("read");
    console.log(`  Added default 'read' permission`);
  }

  // Another sneaky mutation - converts to lowercase
  session.permissions = session.permissions.map((p) => p.toLowerCase());

  // BUG: Sets corruption flag if permissions were modified
  if (session.permissions.includes("admin")) {
    session.corrupted = true;
    console.log(`  ⚠️ Corruption detected: admin permission found`);
  }

  return true;
}

/**
 * BUG 3: Cache gets invalidated in the middle of operation
 */
const permissionCache: Map<string, Set<string>> = new Map();

function cachePermissions(userId: string, permissions: string[]): void {
  permissionCache.set(userId, new Set(permissions));
  console.log(`  Cached permissions for ${userId}: ${permissions.join(", ")}`);
}

function hasPermission(userId: string, permission: string): boolean {
  const cached = permissionCache.get(userId);
  if (cached) {
    return cached.has(permission);
  }

  // BUG: Loading from activeSessions might give stale data
  // because cache was just invalidated
  const session = activeSessions.get(userId);
  if (!session) {
    return false;
  }

  // Re-cache
  cachePermissions(userId, session.permissions);
  return session.permissions.includes(permission);
}

function invalidateCache(userId: string): void {
  console.log(`  Invalidating cache for ${userId}`);
  permissionCache.delete(userId);

  // BUG: Also invalidates nearby user IDs due to string comparison bug
  for (const [cachedUserId, _] of permissionCache.entries()) {
    if (cachedUserId.startsWith(userId.substring(0, 3))) {
      permissionCache.delete(cachedUserId);
      console.log(`  ⚠️ Also invalidated cache for ${cachedUserId} (prefix match)`);
    }
  }
}

function addPermission(userId: string, newPermission: string): void {
  console.log(`Adding permission '${newPermission}' to ${userId}...`);

  const session = activeSessions.get(userId);
  if (!session) {
    throw new Error(`User ${userId} not found`);
  }

  // Add the permission
  session.permissions.push(newPermission);

  // BUG: Invalidate cache BEFORE validating
  // This causes cache to be rebuilt with corrupted data
  invalidateCache(userId);

  // This validation mutates the session
  validateAndNormalizePermissions(session);

  // Now rebuild cache (but session was mutated!)
  cachePermissions(userId, session.permissions);

  console.log(`  Permission added for ${userId}`);
}

/**
 * Simulate some operations that expose the bugs
 */
async function simulateBuggyWorkflow(): Promise<void> {
  console.log("\n=== Simulating buggy workflow ===\n");

  // Create user1
  const user1 = createSession("user-001", "alice");
  console.log(`User1 permissions: ${user1.permissions.join(", ")}`);

  // Create user2 (will share same DEFAULT_SESSION reference!)
  const user2 = createSession("user-002", "bob");
  console.log(`User2 permissions: ${user2.permissions.join(", ")}`);

  // Check user1 - SURPRISE! It was modified by user2 creation
  console.log(`User1 name now: ${user1.username} (expected: alice, got: ${user1.username})`);

  // Add permission to user1
  addPermission("user-001", "WRITE"); // Will be lowercased

  // Check permission (cache bug)
  const hasWrite = hasPermission("user-001", "write");
  console.log(`User-001 has write: ${hasWrite}`);

  // Add admin to user2 (triggers corruption flag)
  addPermission("user-002", "admin");

  // Cache for user-001 was invalidated due to prefix match!
  const user1HasWrite = hasPermission("user-001", "write");
  console.log(`User-001 still has write: ${user1HasWrite} (cache was invalidated!)`);

  // Check corruption
  console.log(`\nUser1 corrupted: ${user1.corrupted}`);
  console.log(`User2 corrupted: ${user2.corrupted}`);
  console.log(
    `\n⚠️ BOTH share corrupted flag because they're the SAME OBJECT!\n`,
  );
}

// HTTP server
async function startServer() {
  console.log("Starting state corruption demo on http://localhost:8003");
  console.log("");
  console.log("Endpoints:");
  console.log("  POST /session       - Create user session (reference bug)");
  console.log("  POST /permission    - Add permission (mutation bug)");
  console.log("  GET  /check         - Check permission (cache bug)");
  console.log("  GET  /sessions      - View all sessions");
  console.log("  GET  /simulate      - Run buggy workflow");
  console.log("");
  console.log("Debugging tips:");
  console.log("  1. Set conditional breakpoint: break when session.corrupted === true");
  console.log("  2. Watch variable: DEFAULT_SESSION");
  console.log("  3. Watch expression: activeSessions.get('user-001').username");
  console.log("  4. Step through createSession() to see reference bug");
  console.log("");

  const listener = Deno.listen({ port: 8003 });

  for await (const conn of listener) {
    handleConnection(conn);
  }
}

async function handleConnection(conn: Deno.Conn) {
  const httpConn = Deno.serveHttp(conn);

  for await (const requestEvent of httpConn) {
    const url = new URL(requestEvent.request.url);

    try {
      if (url.pathname === "/session" && requestEvent.request.method === "POST") {
        const userId = url.searchParams.get("user") || `user-${Date.now()}`;
        const username = url.searchParams.get("name") || "guest";

        const session = createSession(userId, username);

        requestEvent.respondWith(
          new Response(
            JSON.stringify({
              success: true,
              session: {
                userId: session.userId,
                username: session.username,
                permissions: session.permissions,
                corrupted: session.corrupted,
              },
              warning: "⚠️ All sessions share the same object reference!",
            }, null, 2),
            {
              status: 201,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      } else if (url.pathname === "/permission" && requestEvent.request.method === "POST") {
        const userId = url.searchParams.get("user");
        const permission = url.searchParams.get("perm");

        if (!userId || !permission) {
          requestEvent.respondWith(
            new Response(
              JSON.stringify({ error: "Missing user or perm parameter" }),
              {
                status: 400,
                headers: { "content-type": "application/json" },
              },
            ),
          );
          continue;
        }

        addPermission(userId, permission);

        requestEvent.respondWith(
          new Response(
            JSON.stringify({
              success: true,
              message: "Permission added (but cache might be corrupted)",
            }, null, 2),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      } else if (url.pathname === "/check") {
        const userId = url.searchParams.get("user");
        const permission = url.searchParams.get("perm");

        if (!userId || !permission) {
          requestEvent.respondWith(
            new Response(
              JSON.stringify({ error: "Missing user or perm parameter" }),
              {
                status: 400,
                headers: { "content-type": "application/json" },
              },
            ),
          );
          continue;
        }

        const has = hasPermission(userId, permission);

        requestEvent.respondWith(
          new Response(
            JSON.stringify({
              userId,
              permission,
              hasPermission: has,
            }, null, 2),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      } else if (url.pathname === "/sessions") {
        const sessions = Array.from(activeSessions.entries()).map((
          [id, session],
        ) => ({
          userId: id,
          username: session.username,
          permissions: session.permissions,
          corrupted: session.corrupted,
          sameAsDefault: session === DEFAULT_SESSION,
        }));

        requestEvent.respondWith(
          new Response(
            JSON.stringify({
              sessions,
              count: sessions.length,
              defaultSession: {
                userId: DEFAULT_SESSION.userId,
                username: DEFAULT_SESSION.username,
                permissions: DEFAULT_SESSION.permissions,
                corrupted: DEFAULT_SESSION.corrupted,
              },
            }, null, 2),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      } else if (url.pathname === "/simulate") {
        await simulateBuggyWorkflow();

        requestEvent.respondWith(
          new Response(
            JSON.stringify({
              message: "Simulation complete - check console logs",
            }, null, 2),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      } else {
        const body = `
<html>
  <body>
    <h1>State Corruption Demo</h1>
    <p>This app has subtle bugs where shared state gets corrupted through unexpected mutations.</p>

    <h2>Test the buggy endpoints:</h2>
    <ul>
      <li><a href="/sessions">View all sessions</a></li>
      <li><a href="/simulate">Run buggy workflow</a></li>
    </ul>

    <h2>Trigger bugs with curl:</h2>
    <pre>
# Create sessions (they'll share the same object!)
curl -X POST 'http://localhost:8003/session?user=user-001&name=alice'
curl -X POST 'http://localhost:8003/session?user=user-002&name=bob'
curl 'http://localhost:8003/sessions'  # Alice's name is now "bob"!

# Add permissions (mutation bug)
curl -X POST 'http://localhost:8003/permission?user=user-001&perm=WRITE'
curl -X POST 'http://localhost:8003/permission?user=user-002&perm=admin'

# Check permission (cache bug)
curl 'http://localhost:8003/check?user=user-001&perm=write'
    </pre>

    <h2>How to debug:</h2>
    <ol>
      <li>Set breakpoint in createSession() at line where DEFAULT_SESSION is assigned</li>
      <li>Watch variable: DEFAULT_SESSION</li>
      <li>Watch expression: activeSessions.get('user-001').username</li>
      <li>Set conditional breakpoint: break when session.corrupted === true</li>
      <li>Step through and observe shared reference bug</li>
      <li>Use variable watches to see mutations</li>
    </ol>
  </body>
</html>
        `;

        requestEvent.respondWith(
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        );
      }
    } catch (error) {
      requestEvent.respondWith(
        new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      );
    }
  }
}

// Start the server
startServer();
