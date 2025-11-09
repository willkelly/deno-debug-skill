/**
 * Protocol Mismatch Test Script
 * Tests interaction between v1 and v2 clients to trigger protocol bugs
 */

interface TestResult {
  v1Sent: number;
  v2Sent: number;
  v1Received: number;
  v2Received: number;
  v1Errors: number;
  v2Errors: number;
  protocolErrors: number;
}

async function testProtocolMismatch(): Promise<TestResult> {
  console.log("=== WebSocket Protocol Mismatch Test ===\n");

  const result: TestResult = {
    v1Sent: 0,
    v2Sent: 0,
    v1Received: 0,
    v2Received: 0,
    v1Errors: 0,
    v2Errors: 0,
    protocolErrors: 0,
  };

  // Check server is running
  try {
    const response = await fetch("http://localhost:8087/health");
    if (!response.ok) throw new Error("Server not responding");
  } catch {
    console.error("❌ Server not running on http://localhost:8087");
    console.error("   Start it with: deno run --inspect --allow-net app.ts");
    Deno.exit(1);
  }

  // Get baseline stats
  const baselineStats = await fetch("http://localhost:8087/stats").then((r) =>
    r.json()
  );
  console.log("Baseline stats:", baselineStats);
  console.log("");

  // Connect V1 client
  console.log("Connecting V1 client...");
  const wsV1 = new WebSocket("ws://localhost:8087/ws?version=v1");

  await new Promise<void>((resolve) => {
    wsV1.onopen = () => {
      console.log("✓ V1 client connected\n");
      resolve();
    };
  });

  wsV1.onmessage = (event) => {
    result.v1Received++;
    try {
      const data = JSON.parse(event.data);

      // V1 client doesn't understand these v2 fields
      if (data.version !== undefined) {
        console.log(`⚠️  V1 received unexpected 'version' field: ${data.version}`);
        result.v1Errors++;
      }
      if (data.timestamp !== undefined) {
        console.log(`⚠️  V1 received unexpected 'timestamp' field`);
        result.v1Errors++;
      }

      // V1 expects flat coordinates, not nested
      if (data.position !== undefined) {
        console.log(
          `⚠️  V1 received 'position' object, expects x/y flat: ${JSON.stringify(data.position)}`,
        );
        result.v1Errors++;
      }

      // V1 expects action string, not object
      if (data.action && typeof data.action === "object") {
        console.log(
          `⚠️  V1 received action object, expects string: ${JSON.stringify(data.action)}`,
        );
        result.v1Errors++;
      }
    } catch (error) {
      console.error("❌ V1 parse error:", error);
      result.v1Errors++;
    }
  };

  // Connect V2 client
  console.log("Connecting V2 client...");
  const wsV2 = new WebSocket("ws://localhost:8087/ws?version=v2");

  await new Promise<void>((resolve) => {
    wsV2.onopen = () => {
      console.log("✓ V2 client connected\n");
      resolve();
    };
  });

  wsV2.onmessage = (event) => {
    result.v2Received++;
    try {
      const data = JSON.parse(event.data);

      // V2 expects these fields but might not get them from v1 clients
      if (data.type === "player_moved" && !data.position) {
        console.log(`⚠️  V2 received move without 'position' field`);
        result.v2Errors++;
      }

      if (data.type === "player_action" && typeof data.action === "string") {
        console.log(
          `⚠️  V2 received action as string, expects object: "${data.action}"`,
        );
        result.v2Errors++;
      }
    } catch (error) {
      console.error("❌ V2 parse error:", error);
      result.v2Errors++;
    }
  };

  // Wait for both clients to be ready
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log("Testing message exchange...\n");

  // V1 sends move (flat format)
  console.log("V1 → Server: Move (x,y flat format)");
  wsV1.send(JSON.stringify({
    type: "move",
    playerId: "v1-test",
    x: 10,
    y: 20,
  }));
  result.v1Sent++;

  await new Promise((resolve) => setTimeout(resolve, 200));

  // V2 sends move (nested format)
  console.log("V2 → Server: Move (position object format)");
  wsV2.send(JSON.stringify({
    type: "move",
    version: "v2",
    playerId: "v2-test",
    position: { x: 30, y: 40 },
    timestamp: Date.now(),
  }));
  result.v2Sent++;

  await new Promise((resolve) => setTimeout(resolve, 200));

  // V1 sends action (string format)
  console.log("V1 → Server: Action (string format)");
  wsV1.send(JSON.stringify({
    type: "action",
    playerId: "v1-test",
    action: "attack",
  }));
  result.v1Sent++;

  await new Promise((resolve) => setTimeout(resolve, 200));

  // V2 sends action (object format)
  console.log("V2 → Server: Action (object format)");
  wsV2.send(JSON.stringify({
    type: "action",
    version: "v2",
    playerId: "v2-test",
    action: { type: "defend", target: "base" },
    timestamp: Date.now(),
  }));
  result.v2Sent++;

  await new Promise((resolve) => setTimeout(resolve, 200));

  // V1 sends chat
  console.log("V1 → Server: Chat message");
  wsV1.send(JSON.stringify({
    type: "chat",
    playerId: "v1-test",
    message: "Hello from V1!",
  }));
  result.v1Sent++;

  await new Promise((resolve) => setTimeout(resolve, 200));

  // V2 sends chat
  console.log("V2 → Server: Chat message");
  wsV2.send(JSON.stringify({
    type: "chat",
    version: "v2",
    playerId: "v2-test",
    message: "Hello from V2!",
    timestamp: Date.now(),
  }));
  result.v2Sent++;

  // Wait for all messages to be processed
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Get final stats
  const finalStats = await fetch("http://localhost:8087/stats").then((r) =>
    r.json()
  );

  result.protocolErrors = finalStats.protocolErrors -
    baselineStats.protocolErrors;

  // Close connections
  wsV1.close();
  wsV2.close();

  await new Promise((resolve) => setTimeout(resolve, 500));

  return result;
}

async function main() {
  const result = await testProtocolMismatch();

  console.log("\n" + "=".repeat(60));
  console.log("TEST RESULTS");
  console.log("=".repeat(60));
  console.log("");
  console.log("Message Exchange:");
  console.log(`  V1 sent:        ${result.v1Sent}`);
  console.log(`  V1 received:    ${result.v1Received}`);
  console.log(`  V2 sent:        ${result.v2Sent}`);
  console.log(`  V2 received:    ${result.v2Received}`);
  console.log("");
  console.log("Protocol Errors:");
  console.log(`  V1 client errors:     ${result.v1Errors}`);
  console.log(`  V2 client errors:     ${result.v2Errors}`);
  console.log(`  Server protocol errors: ${result.protocolErrors}`);
  console.log("");

  const totalErrors = result.v1Errors + result.v2Errors + result.protocolErrors;

  if (totalErrors > 0) {
    console.log(`❌ Protocol mismatches detected! (${totalErrors} total errors)`);
    console.log("");
    console.log("Common issues:");
    if (result.v1Errors > 0) {
      console.log("  - V1 client receiving V2-formatted messages");
      console.log("  - Unexpected 'version' and 'timestamp' fields");
      console.log("  - 'position' object instead of flat x/y");
      console.log("  - 'action' object instead of string");
    }
    if (result.v2Errors > 0) {
      console.log("  - V2 client receiving V1-formatted messages");
      console.log("  - Missing 'position' field (has x/y instead)");
      console.log("  - 'action' as string instead of object");
    }
    console.log("");
    console.log("💡 Root cause: Server broadcasts V2 format to all clients,");
    console.log("   regardless of client protocol version.");
    console.log("");
    console.log("🔍 Time to investigate with breakpoints and source analysis!");
  } else {
    console.log("✅ No protocol errors detected!");
    console.log("   (Either the server was fixed, or test needs adjustment)");
  }

  console.log("");
  console.log("=".repeat(60));
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error("Test failed:", error);
    Deno.exit(1);
  }
}
