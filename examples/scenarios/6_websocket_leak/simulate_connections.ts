/**
 * WebSocket Connection Simulator
 * Simulates multiple clients connecting, sending messages, and disconnecting
 * to trigger memory leaks in the chat server.
 */

async function connectClient(
  clientId: number,
  messagesPerClient: number,
  duration: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://localhost:8086/ws");
    let messagesSent = 0;

    ws.onopen = () => {
      console.log(`Client ${clientId}: Connected`);

      // Send messages periodically
      const interval = setInterval(() => {
        if (messagesSent >= messagesPerClient) {
          clearInterval(interval);
          ws.close();
          return;
        }

        try {
          ws.send(JSON.stringify({
            content: `Message ${messagesSent + 1} from client ${clientId}`,
          }));
          messagesSent++;
        } catch (error) {
          clearInterval(interval);
          reject(error);
        }
      }, duration / messagesPerClient);
    };

    ws.onmessage = (event) => {
      // Receive messages (adds to memory via message history)
      const data = JSON.parse(event.data);
      if (data.type !== "ping") {
        // console.log(`Client ${clientId}: Received message`);
      }
    };

    ws.onerror = (error) => {
      console.error(`Client ${clientId}: Error`, error);
      reject(error);
    };

    ws.onclose = () => {
      console.log(`Client ${clientId}: Disconnected`);
      resolve();
    };

    // Ensure cleanup after duration
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, duration + 1000);
  });
}

async function runSimulation(
  numClients: number,
  messagesPerClient: number,
  clientDuration: number,
  staggerDelay: number,
) {
  console.log("=== WebSocket Connection Simulator ===");
  console.log(`Configuration:`);
  console.log(`  - Clients: ${numClients}`);
  console.log(`  - Messages per client: ${messagesPerClient}`);
  console.log(`  - Client duration: ${clientDuration}ms`);
  console.log(`  - Stagger delay: ${staggerDelay}ms`);
  console.log("");

  const startTime = Date.now();

  // Check if server is running
  try {
    const response = await fetch("http://localhost:8086/health");
    if (!response.ok) {
      throw new Error("Server not responding");
    }
  } catch {
    console.error("❌ Server not running on http://localhost:8086");
    console.error("   Start it with: deno run --inspect --allow-net app.ts");
    Deno.exit(1);
  }

  // Get baseline stats
  const baselineStats = await fetch("http://localhost:8086/stats").then((r) =>
    r.json()
  );
  console.log("Baseline stats:", baselineStats);
  console.log("");

  // Launch clients with stagger
  const clientPromises: Promise<void>[] = [];

  for (let i = 1; i <= numClients; i++) {
    clientPromises.push(
      connectClient(i, messagesPerClient, clientDuration),
    );

    // Stagger client connections
    if (i < numClients) {
      await new Promise((resolve) => setTimeout(resolve, staggerDelay));
    }
  }

  console.log(`\nAll ${numClients} clients launched, waiting for completion...`);

  // Wait for all clients to finish
  await Promise.all(clientPromises);

  const elapsed = Date.now() - startTime;
  console.log(`\n✓ All clients disconnected after ${elapsed}ms`);

  // Wait a bit for server to process
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Get final stats
  const finalStats = await fetch("http://localhost:8086/stats").then((r) =>
    r.json()
  );

  console.log("\n=== Final Statistics ===");
  console.log(`Active connections:       ${finalStats.activeConnections}`);
  console.log(
    `Total connections:        ${finalStats.totalConnections} (was ${baselineStats.totalConnections})`,
  );
  console.log(
    `Messages sent:            ${finalStats.messagesSent} (was ${baselineStats.messagesSent})`,
  );
  console.log(
    `Bytes transferred:        ${finalStats.bytesTransferred.toLocaleString()} (was ${baselineStats.bytesTransferred.toLocaleString()})`,
  );
  console.log("");
  console.log("🐛 Memory leak indicators:");
  console.log(
    `  - Message history size:  ${finalStats.messageHistorySize} (was ${baselineStats.messageHistorySize})`,
  );
  console.log(
    `  - User sessions size:    ${finalStats.userSessionsSize} (was ${baselineStats.userSessionsSize})`,
  );
  console.log(
    `  - Connection durations:  ${finalStats.connectionDurationsTracked} (was ${baselineStats.connectionDurationsTracked})`,
  );
  console.log("");

  // Calculate growth
  const messageGrowth = finalStats.messageHistorySize -
    baselineStats.messageHistorySize;
  const sessionGrowth = finalStats.userSessionsSize -
    baselineStats.userSessionsSize;
  const durationGrowth = finalStats.connectionDurationsTracked -
    baselineStats.connectionDurationsTracked;

  if (
    messageGrowth > 0 || sessionGrowth > 0 ||
    durationGrowth > numClients * 1.1
  ) {
    console.log("❌ Memory leaks detected:");
    if (messageGrowth > 0) {
      console.log(`   - Message history grew by ${messageGrowth} messages`);
    }
    if (sessionGrowth > 0) {
      console.log(`   - User sessions grew by ${sessionGrowth} sessions`);
    }
    if (durationGrowth > numClients * 1.1) {
      console.log(
        `   - Connection durations grew by ${durationGrowth} entries (expected ${numClients})`,
      );
    }
    console.log("");
    console.log("💡 These leaks will accumulate with each connection cycle.");
    console.log("   Time to investigate with heap snapshots!");
  } else {
    console.log(
      "✅ No obvious leaks detected (or server was fixed!)");
  }
}

// Main execution
if (import.meta.main) {
  const numClients = parseInt(Deno.args[0]) || 20;
  const messagesPerClient = parseInt(Deno.args[1]) || 5;
  const clientDuration = parseInt(Deno.args[2]) || 3000;
  const staggerDelay = parseInt(Deno.args[3]) || 100;

  try {
    await runSimulation(
      numClients,
      messagesPerClient,
      clientDuration,
      staggerDelay,
    );
  } catch (error) {
    console.error("Simulation failed:", error);
    Deno.exit(1);
  }
}
