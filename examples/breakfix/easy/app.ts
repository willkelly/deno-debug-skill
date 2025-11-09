/**
 * API Gateway Service
 *
 * A simple API gateway that proxies requests to multiple backend services.
 * Implements caching to reduce backend load.
 *
 * PROBLEM REPORT:
 * Users are reporting that they sometimes see stale data even after updating
 * their profiles. The issue is intermittent - sometimes they see fresh data,
 * sometimes stale. Cache invalidation on updates doesn't seem to help.
 *
 * TO TEST:
 * 1. Start the service: deno run --inspect --allow-net easy/app.ts
 * 2. Update user profile: curl -X POST http://localhost:8080/api/users/123/update
 * 3. Get user profile: curl http://localhost:8080/api/users/123
 * 4. Notice stale data sometimes appears
 */

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
}

class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTTL = 60000; // 1 minute

  get(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: unknown, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  invalidate(pattern: string): void {
    // BUG: Only invalidates exact matches or base keys, not keys with query params
    for (const key of this.cache.keys()) {
      // Only delete if exact match or if it ends with just a dash (no query params)
      const afterPattern = key.substring(pattern.length);
      if (key.startsWith(pattern) && (afterPattern === "" || afterPattern === "-")) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

// Simulated backend service
class BackendService {
  private users = new Map([
    ["123", { id: "123", name: "Alice", email: "alice@example.com", version: 1 }],
    ["456", { id: "456", name: "Bob", email: "bob@example.com", version: 1 }],
  ]);

  async getUser(id: string) {
    await new Promise((r) => setTimeout(r, 50)); // Simulate network delay
    return this.users.get(id) || null;
  }

  async updateUser(id: string, updates: Record<string, unknown>) {
    const user = this.users.get(id);
    if (!user) return null;

    const updated = { ...user, ...updates, version: user.version + 1 };
    this.users.set(id, updated);
    return updated;
  }
}

const cache = new ResponseCache();
const backend = new BackendService();

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // GET /api/users/:id
  const getUserMatch = path.match(/^\/api\/users\/(\w+)$/);
  if (getUserMatch && req.method === "GET") {
    const userId = getUserMatch[1];
    const cacheKey = `user-${userId}-${url.search}`; // Cache key includes query params

    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`Cache HIT for ${cacheKey}`);
      return Response.json(cached, {
        headers: { "X-Cache": "HIT" },
      });
    }

    console.log(`Cache MISS for ${cacheKey}`);
    const user = await backend.getUser(userId);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    cache.set(cacheKey, user);
    return Response.json(user, {
      headers: { "X-Cache": "MISS" },
    });
  }

  // POST /api/users/:id/update
  const updateMatch = path.match(/^\/api\/users\/(\w+)\/update$/);
  if (updateMatch && req.method === "POST") {
    const userId = updateMatch[1];
    const updates = await req.json().catch(() => ({}));

    const updated = await backend.updateUser(userId, updates);
    if (!updated) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Invalidate cache for this user
    cache.invalidate(`user-${userId}`);
    console.log(`Invalidated cache for user ${userId}`);

    return Response.json(updated);
  }

  // GET /stats
  if (path === "/stats") {
    return Response.json({
      message: "API Gateway Stats",
      endpoints: [
        "GET /api/users/:id - Get user profile",
        "POST /api/users/:id/update - Update user profile",
        "POST /clear-cache - Clear all caches",
      ],
    });
  }

  // POST /clear-cache
  if (path === "/clear-cache" && req.method === "POST") {
    cache.clear();
    return Response.json({ message: "Cache cleared" });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

console.log("🚀 API Gateway starting on http://localhost:8080");
console.log("   GET  /api/users/123");
console.log("   POST /api/users/123/update");
console.log("   POST /clear-cache");
console.log("");
console.log("⚠️  BUG: Users report seeing stale data after updates");
console.log("    Try: curl http://localhost:8080/api/users/123");
console.log("    Then: curl -X POST http://localhost:8080/api/users/123/update -d '{\"name\":\"Alice Updated\"}'");
console.log("    Then: curl http://localhost:8080/api/users/123");
console.log("    Sometimes you'll see the old data!");

Deno.serve({ port: 8080 }, handleRequest);
