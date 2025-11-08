/**
 * Example Deno application with intentional memory leak
 *
 * This app demonstrates a common memory leak pattern where
 * ArrayBuffer objects are retained in closures.
 *
 * To debug:
 * 1. deno run --inspect --allow-net examples/scenarios/1_memory_leak/app.ts
 * 2. Ask Claude to investigate memory growth
 */

// Simulated file upload handler with memory leak
const leakedBuffers: ArrayBuffer[] = [];

async function handleUpload(fileSize: number): Promise<string> {
  console.log(`Processing upload of ${fileSize} bytes...`);

  // Create a large buffer (simulating file content)
  const buffer = new ArrayBuffer(fileSize);

  // BUG: Buffer is retained in this array and never released
  leakedBuffers.push(buffer);

  // Simulate processing
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Process the buffer
  const result = await processBuffer(buffer);

  return result;
}

async function processBuffer(buffer: ArrayBuffer): Promise<string> {
  // Simulated buffer processing
  const view = new Uint8Array(buffer);
  view[0] = 42; // Do something with it

  return `Processed ${buffer.byteLength} bytes`;
}

// Start HTTP server with Deno 2.x API
console.log("Starting server on http://localhost:8000");
console.log("Visit http://localhost:8000/upload?size=50000000 to trigger memory leak");
console.log("Each request leaks ~50MB of memory");
console.log("");
console.log("To debug: Ask Claude to investigate why memory grows!");

Deno.serve({ port: 8000 }, (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/upload") {
    const sizeParam = url.searchParams.get("size");
    const size = sizeParam ? parseInt(sizeParam) : 50_000_000; // Default 50MB

    return handleUpload(size).then((result) => {
      const body = `
        <html>
          <body>
            <h1>Upload Complete</h1>
            <p>${result}</p>
            <p>Memory leak: ${leakedBuffers.length} buffers retained</p>
            <p>Total leaked: ${
        leakedBuffers.reduce((sum, b) => sum + b.byteLength, 0) / (1024 * 1024)
      } MB</p>
            <br>
            <a href="/upload?size=50000000">Upload another (leak more memory)</a>
            <br>
            <a href="/stats">View memory stats</a>
          </body>
        </html>
      `;

      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }).catch((error) => {
      return new Response(`Error: ${error}`, { status: 500 });
    });
  } else if (url.pathname === "/stats") {
    const memUsage = Deno.memoryUsage();

    const body = `
      <html>
        <body>
          <h1>Memory Statistics</h1>
          <pre>
Heap Used: ${(memUsage.heapUsed / (1024 * 1024)).toFixed(2)} MB
Heap Total: ${(memUsage.heapTotal / (1024 * 1024)).toFixed(2)} MB
External: ${(memUsage.external / (1024 * 1024)).toFixed(2)} MB

Leaked Buffers: ${leakedBuffers.length}
Leaked Memory: ${
      (leakedBuffers.reduce((sum, b) => sum + b.byteLength, 0) / (1024 * 1024)).toFixed(2)
    } MB
          </pre>
          <br>
          <a href="/upload?size=50000000">Trigger more leaks</a>
        </body>
      </html>
    `;

    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  } else {
    const body = `
      <html>
        <body>
          <h1>Leaky Upload Demo</h1>
          <p>This app has an intentional memory leak for debugging practice.</p>
          <ul>
            <li><a href="/upload?size=50000000">Trigger upload (leaks 50MB)</a></li>
            <li><a href="/stats">View memory stats</a></li>
          </ul>
          <h2>How to debug:</h2>
          <ol>
            <li>This app is running with <code>--inspect</code></li>
            <li>Trigger several uploads using the link above</li>
            <li>Ask Claude: "Investigate the memory leak in this app"</li>
            <li>Claude will connect via CDP, capture heap snapshots, and find the bug at line 22</li>
          </ol>
        </body>
      </html>
    `;

    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }
});
