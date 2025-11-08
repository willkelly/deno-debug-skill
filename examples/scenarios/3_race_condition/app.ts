/**
 * Race Condition / Async Bug Example
 *
 * This app has async operations that complete in the wrong order,
 * causing inconsistent behavior.
 *
 * The bugs:
 * 1. Missing await causes operations to run out of order
 * 2. Shared state accessed without proper synchronization
 * 3. Promise.all() used when sequential execution needed
 *
 * To debug:
 * 1. deno run --inspect --allow-net examples/scenarios/3_race_condition/app.ts
 * 2. Ask Claude: "Sometimes operations complete in the wrong order, can you investigate?"
 */

// Shared state (intentionally problematic)
let orderCounter = 0;
const orders: Map<string, any> = new Map();

// Simulated async database operations
async function saveToDatabase(key: string, value: any, delay: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, delay));
  orders.set(key, value);
  console.log(`  [DB] Saved ${key}: ${JSON.stringify(value)}`);
}

async function loadFromDatabase(key: string, delay: number): Promise<any> {
  await new Promise(resolve => setTimeout(resolve, delay));
  return orders.get(key);
}

// BUG 1: Missing await causes race condition
async function createOrder(productId: string, quantity: number): Promise<string> {
  const orderId = `order-${++orderCounter}`;

  console.log(`Creating ${orderId}...`);

  // BUG: Not awaiting this operation!
  // The function returns before the order is saved
  saveToDatabase(orderId, {
    productId,
    quantity,
    status: 'pending',
    createdAt: new Date().toISOString()
  }, 100);  // 100ms delay

  console.log(`  ${orderId} created (but not saved yet!)`);

  return orderId;
}

// BUG 2: Race condition in status updates
async function updateOrderStatus(orderId: string, newStatus: string): Promise<void> {
  console.log(`Updating ${orderId} to ${newStatus}...`);

  // Load the order
  const order = await loadFromDatabase(orderId, 50);

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  // BUG: Another update could happen between load and save
  // causing the first update to be lost

  await new Promise(resolve => setTimeout(resolve, 50)); // Simulate processing

  order.status = newStatus;
  order.updatedAt = new Date().toISOString();

  await saveToDatabase(orderId, order, 50);

  console.log(`  ${orderId} updated to ${newStatus}`);
}

// BUG 3: Using Promise.all when order matters
async function processBatch(orderIds: string[]): Promise<void> {
  console.log(`Processing batch of ${orderIds.length} orders...`);

  // BUG: Promise.all() doesn't guarantee order
  // These should be processed sequentially
  await Promise.all(orderIds.map(async (orderId, index) => {
    const delay = Math.random() * 200; // Random delay
    await new Promise(resolve => setTimeout(resolve, delay));
    console.log(`  Processed ${orderId} (delay: ${delay.toFixed(0)}ms)`);
  }));

  console.log(`Batch processing complete`);
}

// HTTP server
function startServer() {
  console.log("Starting async bug demo server on http://localhost:8002");
  console.log("");
  console.log("Endpoints:");
  console.log("  POST /order        - Create order (missing await bug)");
  console.log("  POST /update       - Update status (race condition bug)");
  console.log("  POST /batch        - Process batch (ordering bug)");
  console.log("  GET  /orders       - List all orders");
  console.log("");
  console.log("Try running:");
  console.log("  curl -X POST 'http://localhost:8002/order?product=widget&qty=5'");
  console.log("  curl 'http://localhost:8002/orders'  # Order not saved yet!");
  console.log("");
  console.log("Then ask Claude to investigate the race conditions!");

  Deno.serve({ port: 8002 }, async (req) => {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/order" && req.method === "POST") {
        const productId = url.searchParams.get("product") || "unknown";
        const quantity = parseInt(url.searchParams.get("qty") || "1");

        // BUG: Not awaiting createOrder, so it returns before saving!
        const orderId = await createOrder(productId, quantity);

        // This response is sent before the order is actually saved
        return new Response(
          JSON.stringify({
            success: true,
            orderId,
            message: "Order created",
            warning: "⚠️ Actually, the order might not be saved yet due to missing await!",
          }, null, 2),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        );
      } else if (url.pathname === "/update" && req.method === "POST") {
        const orderId = url.searchParams.get("order");
        const status = url.searchParams.get("status") || "processing";

        if (!orderId) {
          return new Response(
            JSON.stringify({ error: "Missing order parameter" }),
            {
              status: 400,
              headers: { "content-type": "application/json" },
            },
          );
        }

        // Try updating status twice simultaneously to trigger race
        await Promise.all([
          updateOrderStatus(orderId, status),
          updateOrderStatus(orderId, `${status}-2`),
        ]);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Status updated (but which one won the race?)",
          }, null, 2),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      } else if (url.pathname === "/batch" && req.method === "POST") {
        const count = parseInt(url.searchParams.get("count") || "5");

        // Create some orders first (with bugs)
        const orderIds: string[] = [];
        for (let i = 0; i < count; i++) {
          const orderId = await createOrder(`product-${i}`, i + 1);
          orderIds.push(orderId);
        }

        // Wait a bit for them to be saved
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Process batch (with ordering bug)
        await processBatch(orderIds);

        return new Response(
          JSON.stringify({
            success: true,
            processed: orderIds,
            message: "Batch processed (but in what order?)",
          }, null, 2),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      } else if (url.pathname === "/orders") {
        const allOrders = Array.from(orders.entries()).map(([id, data]) => ({
          id,
          ...data,
        }));

        return new Response(
          JSON.stringify({
            orders: allOrders,
            count: allOrders.length,
            message: allOrders.length === 0
              ? "No orders yet (they might still be saving!)"
              : "Orders found",
          }, null, 2),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      } else {
        const body = `
          <html>
            <body>
              <h1>Race Condition Demo</h1>
              <p>This app has async bugs that cause operations to complete in the wrong order.</p>

              <h2>Test the buggy endpoints:</h2>
              <ul>
                <li><a href="/orders">View orders</a></li>
              </ul>

              <h2>Trigger bugs with curl:</h2>
              <pre>
# Create order (returns before saving - missing await)
curl -X POST 'http://localhost:8002/order?product=widget&qty=5'
curl 'http://localhost:8002/orders'  # Order not there yet!

# Update race condition (concurrent updates)
curl -X POST 'http://localhost:8002/update?order=order-1&status=shipped'

# Batch processing (wrong order)
curl -X POST 'http://localhost:8002/batch?count=5'
              </pre>

              <h2>How to debug:</h2>
              <ol>
                <li>This app is running with <code>--inspect</code></li>
                <li>Trigger some operations above</li>
                <li>Ask Claude: "My async operations complete in the wrong order"</li>
                <li>Claude will set breakpoints at promise boundaries</li>
                <li>Claude will identify missing awaits and race conditions</li>
              </ol>
            </body>
          </html>
        `;

        return new Response(body, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ error: String(error) }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      );
    }
  });
}

// Start the server
startServer();
