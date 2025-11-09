/**
 * Distributed Lock Manager Service
 *
 * A service that manages distributed locks for coordinating access to shared
 * resources across multiple clients. Supports lock acquisition, renewal,
 * and automatic expiration.
 *
 * PROBLEM REPORT:
 * In production, we're seeing intermittent data corruption. Logs show that
 * sometimes TWO clients successfully acquire the same lock simultaneously.
 * This should be impossible with our locking logic. The issue is rare but
 * reproducible under high load (happens ~1% of attempts).
 *
 * Symptoms:
 * - Lock state shows "acquired" by client A
 * - Milliseconds later, also shows "acquired" by client B
 * - Both clients think they have exclusive access
 * - No errors are logged during acquisition
 *
 * TO TEST:
 * 1. Start: deno run --inspect --allow-net medium/app.ts
 * 2. Run concurrent acquisitions:
 *    for i in {1..50}; do curl -X POST http://localhost:8081/acquire -d '{"lockId":"resource-1","clientId":"client-A"}' & done
 *    for i in {1..50}; do curl -X POST http://localhost:8081/acquire -d '{"lockId":"resource-1","clientId":"client-B"}' & done
 * 3. Check locks: curl http://localhost:8081/locks
 * 4. Occasionally see both clients listed as owner
 *
 * DEBUGGING HINT:
 * Set breakpoints in the acquire() method at these locations:
 * - Line where we check if lock exists
 * - Line where we check if lock is held
 * - Line where we set the new owner
 *
 * Watch these variables:
 * - lock.owner
 * - lock.state
 * - lock.acquiredAt
 *
 * Run 100+ concurrent requests and step through to catch the race.
 * The bug involves checking state and updating it in separate steps.
 */

type LockState = "available" | "acquiring" | "acquired" | "releasing";

interface Lock {
  id: string;
  owner: string | null;
  state: LockState;
  acquiredAt: number | null;
  expiresAt: number | null;
  renewCount: number;
  version: number; // Optimistic locking version
}

interface LockRequest {
  lockId: string;
  clientId: string;
  ttl?: number;
}

interface LockStats {
  totalAcquires: number;
  totalReleases: number;
  totalRenewals: number;
  totalExpired: number;
  totalRejected: number;
  currentHeld: number;
  doubleAcquireDetected: number;
}

class LockManager {
  private locks = new Map<string, Lock>();
  private stats: LockStats = {
    totalAcquires: 0,
    totalReleases: 0,
    totalRenewals: 0,
    totalExpired: 0,
    totalRejected: 0,
    currentHeld: 0,
    doubleAcquireDetected: 0,
  };
  private readonly defaultTTL = 30000; // 30 seconds
  private readonly maxTTL = 300000; // 5 minutes

  constructor() {
    // Background task to clean up expired locks
    setInterval(() => this.cleanupExpiredLocks(), 1000);
  }

  /**
   * Attempt to acquire a lock
   * BUG: Race condition between checking state and updating it
   */
  async acquire(request: LockRequest): Promise<{ success: boolean; lock?: Lock; error?: string }> {
    const { lockId, clientId, ttl = this.defaultTTL } = request;

    // Validate TTL
    if (ttl > this.maxTTL) {
      return { success: false, error: `TTL exceeds maximum of ${this.maxTTL}ms` };
    }

    // Get or create lock
    let lock = this.locks.get(lockId);
    if (!lock) {
      lock = {
        id: lockId,
        owner: null,
        state: "available",
        acquiredAt: null,
        expiresAt: null,
        renewCount: 0,
        version: 0,
      };
      this.locks.set(lockId, lock);
    }

    // Check if already owned by this client
    if (lock.owner === clientId && lock.state === "acquired") {
      // Renew the lock
      return this.renew(lockId, clientId, ttl);
    }

    // Simulate some async processing delay (represents network/IO)
    await this.simulateAsyncDelay();

    // BUG: TOCTOU (Time-Of-Check-Time-Of-Use) vulnerability
    // Between checking state and setting it, another request could modify it

    // Check if lock is available
    if (lock.state !== "available") {
      this.stats.totalRejected++;
      return {
        success: false,
        error: `Lock is ${lock.state} by ${lock.owner}`,
      };
    }

    // Check if lock has expired (owner still set but past expiration)
    const now = Date.now();
    if (lock.expiresAt && now > lock.expiresAt) {
      console.log(`Lock ${lockId} expired, releasing from ${lock.owner}`);
      lock.state = "available";
      lock.owner = null;
      lock.acquiredAt = null;
      lock.expiresAt = null;
      this.stats.totalExpired++;
    }

    // Another async delay (database write, etc.)
    await this.simulateAsyncDelay();

    // BUG IS HERE: Between the state check above and this update,
    // another concurrent request might have also passed the check
    // and both will proceed to acquire the lock!

    // Mark as acquiring (intermediate state)
    lock.state = "acquiring";

    // Simulate lock acquisition work
    await this.simulateAsyncDelay();

    // Finalize acquisition
    lock.owner = clientId;
    lock.state = "acquired";
    lock.acquiredAt = now;
    lock.expiresAt = now + ttl;
    lock.version++;

    this.stats.totalAcquires++;
    this.stats.currentHeld++;

    console.log(`✓ Lock ${lockId} acquired by ${clientId} (expires in ${ttl}ms)`);

    // Detect double-acquire bug (for monitoring)
    this.detectDoubleAcquire(lockId);

    return {
      success: true,
      lock: { ...lock },
    };
  }

  /**
   * Renew an existing lock
   */
  async renew(lockId: string, clientId: string, ttl: number): Promise<{ success: boolean; lock?: Lock; error?: string }> {
    const lock = this.locks.get(lockId);

    if (!lock) {
      return { success: false, error: "Lock does not exist" };
    }

    if (lock.owner !== clientId) {
      return { success: false, error: `Lock is owned by ${lock.owner}` };
    }

    if (lock.state !== "acquired") {
      return { success: false, error: `Lock is in state ${lock.state}` };
    }

    const now = Date.now();
    lock.expiresAt = now + ttl;
    lock.renewCount++;
    lock.version++;

    this.stats.totalRenewals++;

    console.log(`↻ Lock ${lockId} renewed by ${clientId} (renew #${lock.renewCount})`);

    return {
      success: true,
      lock: { ...lock },
    };
  }

  /**
   * Release a lock
   */
  async release(lockId: string, clientId: string): Promise<{ success: boolean; error?: string }> {
    const lock = this.locks.get(lockId);

    if (!lock) {
      return { success: false, error: "Lock does not exist" };
    }

    if (lock.owner !== clientId) {
      return { success: false, error: `Lock is owned by ${lock.owner}, not ${clientId}` };
    }

    lock.state = "releasing";

    await this.simulateAsyncDelay();

    lock.state = "available";
    lock.owner = null;
    lock.acquiredAt = null;
    lock.expiresAt = null;
    lock.renewCount = 0;
    lock.version++;

    this.stats.totalReleases++;
    this.stats.currentHeld--;

    console.log(`✗ Lock ${lockId} released by ${clientId}`);

    return { success: true };
  }

  /**
   * Get all locks
   */
  getLocks(): Lock[] {
    return Array.from(this.locks.values()).map((lock) => ({ ...lock }));
  }

  /**
   * Get lock by ID
   */
  getLock(lockId: string): Lock | null {
    const lock = this.locks.get(lockId);
    return lock ? { ...lock } : null;
  }

  /**
   * Get statistics
   */
  getStats(): LockStats {
    return { ...this.stats };
  }

  /**
   * Clean up expired locks
   */
  private cleanupExpiredLocks(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [lockId, lock] of this.locks.entries()) {
      if (lock.expiresAt && now > lock.expiresAt && lock.state === "acquired") {
        console.log(`⏰ Auto-releasing expired lock ${lockId} (was owned by ${lock.owner})`);
        lock.state = "available";
        lock.owner = null;
        lock.acquiredAt = null;
        lock.expiresAt = null;
        lock.renewCount = 0;
        this.stats.totalExpired++;
        this.stats.currentHeld--;
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned ${cleaned} expired locks`);
    }
  }

  /**
   * Detect double-acquire bug (for monitoring)
   */
  private detectDoubleAcquire(lockId: string): void {
    // Slight delay to let any concurrent acquires complete
    setTimeout(() => {
      const lock = this.locks.get(lockId);
      if (!lock) return;

      // Count how many clients think they own this lock
      // (In a real system this would check across multiple servers)
      // For our simulation, we'll check if state transitions happened too quickly
      if (lock.acquiredAt && lock.version > 1) {
        const timeSinceAcquire = Date.now() - lock.acquiredAt;
        if (timeSinceAcquire < 5) {
          // Version incremented very quickly - possible race
          console.warn(`⚠️  POSSIBLE DOUBLE-ACQUIRE on ${lockId}! Version jumped to ${lock.version} in ${timeSinceAcquire}ms`);
          this.stats.doubleAcquireDetected++;
        }
      }
    }, 10);
  }

  /**
   * Simulate async delay (network, IO, etc.)
   */
  private async simulateAsyncDelay(): Promise<void> {
    // Random delay between 1-5ms
    const delay = Math.random() * 4 + 1;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Reset all locks (for testing)
   */
  reset(): void {
    this.locks.clear();
    this.stats = {
      totalAcquires: 0,
      totalReleases: 0,
      totalRenewals: 0,
      totalExpired: 0,
      totalRejected: 0,
      currentHeld: 0,
      doubleAcquireDetected: 0,
    };
  }
}

const lockManager = new LockManager();

// HTTP server
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // POST /acquire - Acquire a lock
  if (url.pathname === "/acquire" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const result = await lockManager.acquire({
      lockId: body.lockId || "default-lock",
      clientId: body.clientId || "anonymous",
      ttl: body.ttl,
    });
    return Response.json(result);
  }

  // POST /renew - Renew a lock
  if (url.pathname === "/renew" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const result = await lockManager.renew(
      body.lockId || "default-lock",
      body.clientId || "anonymous",
      body.ttl || 30000
    );
    return Response.json(result);
  }

  // POST /release - Release a lock
  if (url.pathname === "/release" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const result = await lockManager.release(
      body.lockId || "default-lock",
      body.clientId || "anonymous"
    );
    return Response.json(result);
  }

  // GET /locks - Get all locks
  if (url.pathname === "/locks") {
    return Response.json(lockManager.getLocks());
  }

  // GET /locks/:id - Get specific lock
  const lockMatch = url.pathname.match(/^\/locks\/(.+)$/);
  if (lockMatch) {
    const lock = lockManager.getLock(lockMatch[1]);
    if (lock) {
      return Response.json(lock);
    }
    return Response.json({ error: "Lock not found" }, { status: 404 });
  }

  // GET /stats - Get statistics
  if (url.pathname === "/stats") {
    return Response.json(lockManager.getStats());
  }

  // POST /reset - Reset all locks
  if (url.pathname === "/reset" && req.method === "POST") {
    lockManager.reset();
    return Response.json({ message: "All locks reset" });
  }

  // GET /
  return new Response(
    `Distributed Lock Manager

Endpoints:
  POST /acquire   - Acquire a lock
                    Body: {"lockId":"resource-1","clientId":"client-A","ttl":30000}
  POST /renew     - Renew a lock
                    Body: {"lockId":"resource-1","clientId":"client-A","ttl":30000}
  POST /release   - Release a lock
                    Body: {"lockId":"resource-1","clientId":"client-A"}
  GET  /locks     - List all locks
  GET  /locks/:id - Get specific lock
  GET  /stats     - View statistics
  POST /reset     - Reset all locks

Debugging the Race Condition:
  1. Set breakpoints in acquire() method:
     - After "Check if lock is available" comment
     - After "BUG IS HERE" comment
     - Before "Finalize acquisition" comment

  2. Watch these variables:
     - lock.state
     - lock.owner
     - lock.version

  3. Run concurrent requests:
     for i in {1..100}; do
       curl -X POST http://localhost:8081/acquire \\
         -d '{"lockId":"resource-1","clientId":"client-'$i'"}' &
     done

  4. Step through breakpoints and observe:
     - Multiple clients passing the "available" check
     - Both updating the same lock object
     - Race between check and update

The bug is subtle and timing-dependent!
Variable watches will show you the state corruption as it happens.

Try:
  curl -X POST http://localhost:8081/acquire -d '{"lockId":"resource-1","clientId":"client-A"}'
  curl http://localhost:8081/locks
  curl http://localhost:8081/stats
`,
    { headers: { "content-type": "text/plain" } }
  );
}

console.log("🔒 Distributed Lock Manager starting on http://localhost:8081");
console.log("   POST /acquire - Acquire lock");
console.log("   POST /release - Release lock");
console.log("   GET  /locks - View all locks");
console.log("   GET  /stats - View statistics");
console.log("");
console.log("⚠️  RACE CONDITION BUG:");
console.log("   Under high concurrency, multiple clients can acquire same lock");
console.log("   Happens ~1% of the time with 100+ concurrent requests");
console.log("");
console.log("🔍 Debug workflow:");
console.log("   1. Set breakpoints in acquire() method");
console.log("   2. Watch: lock.state, lock.owner, lock.version");
console.log("   3. Run 100+ concurrent acquire requests");
console.log("   4. Step through to see race condition");
console.log("");
console.log("Code reading won't easily reveal this!");
console.log("You need breakpoints + variable watches to see the timing issue.");

Deno.serve({ port: 8081 }, handleRequest);
