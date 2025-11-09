#!/usr/bin/env bash

# WebSocket Memory Leak Scenario Runner
# This script helps you test the WebSocket chat server memory leak

set -e

echo "=== WebSocket Memory Leak Scenario ==="
echo ""
echo "This scenario demonstrates multiple memory leaks in a WebSocket chat server:"
echo "  1. Unbounded message history"
echo "  2. User session tracking never cleaned up"
echo "  3. Heartbeat intervals not cleared"
echo "  4. Growing connection statistics"
echo "  5. Message buffers not cleared"
echo ""

# Check if Deno is installed
if ! command -v deno &> /dev/null; then
    echo "❌ Deno is not installed"
    echo "   Install from: https://deno.land/"
    exit 1
fi

echo "Starting WebSocket chat server with inspector..."
echo ""
echo "Server will be available at:"
echo "  - Web UI:  http://localhost:8086"
echo "  - WebSocket: ws://localhost:8086/ws"
echo "  - Stats:   http://localhost:8086/stats"
echo "  - Inspector: ws://127.0.0.1:9229"
echo ""

# Start the server in background
deno run --inspect --allow-net app.ts &
SERVER_PID=$!

# Cleanup function
cleanup() {
    echo ""
    echo "Shutting down server..."
    kill $SERVER_PID 2>/dev/null || true
    exit
}

trap cleanup EXIT INT TERM

# Wait for server to start
sleep 2

# Check if server is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "❌ Server failed to start"
    exit 1
fi

echo "✓ Server is running (PID: $SERVER_PID)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Instructions:"
echo ""
echo "Option 1: Use the simulation script to trigger leaks automatically"
echo "  Terminal 2: deno run --allow-net simulate_connections.ts [num_clients]"
echo "  Example:    deno run --allow-net simulate_connections.ts 50"
echo ""
echo "Option 2: Use the web UI to manually connect/disconnect"
echo "  Open http://localhost:8086 in multiple browser tabs"
echo "  Send messages, then close tabs to disconnect"
echo ""
echo "Option 3: Ask Claude to investigate"
echo "  Prompt: 'My WebSocket chat server leaks memory. After clients connect"
echo "          and disconnect, memory stays high. Can you investigate?'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 To monitor memory growth:"
echo "  - Watch stats: watch -n 1 'curl -s http://localhost:8086/stats | jq'"
echo "  - Use Claude with heap snapshots"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Keep script running
wait $SERVER_PID
