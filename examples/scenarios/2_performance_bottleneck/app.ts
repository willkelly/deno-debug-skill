/**
 * Performance Bottleneck Example
 *
 * This app has an inefficient algorithm that causes slow API responses.
 * The issue: Expensive computation in request handler that could be optimized.
 *
 * To debug:
 * 1. deno run --inspect --allow-net examples/scenarios/2_performance_bottleneck/app.ts
 * 2. Ask Claude: "My API is slow, can you profile it?"
 */

// Inefficient prime checking (trial division)
function isPrime(n: number): boolean {
  if (n <= 1) return false;
  if (n <= 3) return true;

  // BUG: Unnecessarily checks all numbers up to n instead of sqrt(n)
  for (let i = 2; i < n; i++) {
    if (n % i === 0) return false;
  }

  return true;
}

// Inefficient Fibonacci calculation (exponential time)
function fibonacci(n: number): number {
  // BUG: Recursive without memoization - O(2^n) complexity
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// Synchronous blocking operation
function expensiveComputation(limit: number): number[] {
  console.log(`Computing primes up to ${limit}...`);
  const primes: number[] = [];

  // BUG: This blocks the event loop for large limits
  for (let i = 2; i <= limit; i++) {
    if (isPrime(i)) {
      primes.push(i);
    }
  }

  return primes;
}

// HTTP server
async function startServer() {
  console.log("Starting slow API server on http://localhost:8001");
  console.log("");
  console.log("Endpoints:");
  console.log("  GET /primes?limit=10000  - Find primes (slow for large limits)");
  console.log("  GET /fibonacci?n=35      - Calculate fibonacci (exponentially slow)");
  console.log("  GET /health              - Health check");
  console.log("");
  console.log("Try: curl 'http://localhost:8001/primes?limit=50000'");
  console.log("     curl 'http://localhost:8001/fibonacci?n=40'");
  console.log("");
  console.log("Then ask Claude to profile and find the bottlenecks!");

  const listener = Deno.listen({ port: 8001 });

  for await (const conn of listener) {
    handleConnection(conn);
  }
}

async function handleConnection(conn: Deno.Conn) {
  const httpConn = Deno.serveHttp(conn);

  for await (const requestEvent of httpConn) {
    const url = new URL(requestEvent.request.url);
    const start = performance.now();

    try {
      if (url.pathname === "/primes") {
        const limit = parseInt(url.searchParams.get("limit") || "1000");

        console.log(`[${new Date().toISOString()}] Computing primes up to ${limit}...`);

        const primes = expensiveComputation(limit);
        const duration = performance.now() - start;

        console.log(`[${new Date().toISOString()}] Completed in ${duration.toFixed(2)}ms`);

        const body = JSON.stringify({
          limit,
          count: primes.length,
          duration_ms: duration.toFixed(2),
          sample: primes.slice(0, 10),
          message: duration > 1000
            ? "⚠️ This is slow! Ask Claude to profile it."
            : "Response time OK"
        }, null, 2);

        requestEvent.respondWith(
          new Response(body, {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );

      } else if (url.pathname === "/fibonacci") {
        const n = parseInt(url.searchParams.get("n") || "30");

        if (n > 45) {
          requestEvent.respondWith(
            new Response(JSON.stringify({ error: "n too large (max 45)" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            })
          );
          continue;
        }

        console.log(`[${new Date().toISOString()}] Computing fibonacci(${n})...`);

        const result = fibonacci(n);
        const duration = performance.now() - start;

        console.log(`[${new Date().toISOString()}] Completed in ${duration.toFixed(2)}ms`);

        const body = JSON.stringify({
          n,
          result,
          duration_ms: duration.toFixed(2),
          message: duration > 500
            ? "⚠️ Exponential time complexity! Ask Claude to find the issue."
            : "Response time OK"
        }, null, 2);

        requestEvent.respondWith(
          new Response(body, {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );

      } else if (url.pathname === "/health") {
        requestEvent.respondWith(
          new Response(JSON.stringify({ status: "ok" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );

      } else {
        const body = `
          <html>
            <body>
              <h1>Performance Bottleneck Demo</h1>
              <p>This app has inefficient algorithms that cause slow responses.</p>

              <h2>Test the slow endpoints:</h2>
              <ul>
                <li><a href="/primes?limit=50000">Find primes up to 50,000 (slow!)</a></li>
                <li><a href="/fibonacci?n=40">Calculate fibonacci(40) (very slow!)</a></li>
                <li><a href="/health">Health check (fast)</a></li>
              </ul>

              <h2>How to debug:</h2>
              <ol>
                <li>This app is running with <code>--inspect</code></li>
                <li>Trigger a slow endpoint above</li>
                <li>Ask Claude: "My API is slow, can you profile it?"</li>
                <li>Claude will use CPU profiling to find the bottlenecks</li>
                <li>Claude will suggest optimizations (sqrt(n) for primes, memoization for fibonacci)</li>
              </ol>
            </body>
          </html>
        `;

        requestEvent.respondWith(
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/html" },
          })
        );
      }
    } catch (error) {
      requestEvent.respondWith(
        new Response(`Error: ${error}`, { status: 500 })
      );
    }
  }
}

// Start the server
startServer();
