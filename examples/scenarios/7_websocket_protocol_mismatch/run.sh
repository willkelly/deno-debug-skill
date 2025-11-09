#!/usr/bin/env bash

# WebSocket Protocol Mismatch Scenario Runner

set -e

echo "=== WebSocket Protocol Mismatch Scenario ==="
echo ""
echo "This scenario demonstrates protocol version compatibility bugs:"
echo "  1. V2 messages broadcast to V1 clients (parsing failures)"
echo "  2. Action format mismatch (string vs object)"
echo "  3. Coordinate format mismatch (flat vs nested)"
echo "  4. Protocol detection changes mid-session"
echo "  5. Missing translation layer"
echo ""

# Check if Deno is installed
if ! command -v deno &> /dev/null; then
    echo "❌ Deno is not installed"
    echo "   Install from: https://deno.land/"
    exit 1
fi

echo "Starting WebSocket game server with inspector..."
echo ""
echo "Server will be available at:"
echo "  - Web UI:  http://localhost:8087"
echo "  - WebSocket V1: ws://localhost:8087/ws?version=v1"
echo "  - WebSocket V2: ws://localhost:8087/ws?version=v2"
echo "  - Stats:   http://localhost:8087/stats"
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
echo "Option 1: Use the test script to trigger protocol bugs"
echo "  Terminal 2: deno run --allow-net test_protocol_mismatch.ts"
echo ""
echo "Option 2: Use the web UI to manually test both clients"
echo "  Open http://localhost:8087"
echo "  Connect both V1 and V2 clients"
echo "  Send moves and actions from both"
echo "  Watch the message log for errors"
echo ""
echo "Option 3: Ask Claude to investigate"
echo "  Prompt: 'My multiplayer game server supports v1 and v2 protocols,"
echo "          but v1 and v2 clients can't play together. V1 clients get"
echo "          parsing errors, actions are corrupted, and state is inconsistent."
echo "          Can you investigate the protocol handling?'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Key issues to observe:"
echo "  - V1 clients receive 'version' and 'timestamp' fields (unexpected)"
echo "  - V1 expects x/y flat, receives position:{x,y} nested"
echo "  - V1 expects action:'attack' string, receives action:{type:'attack'} object"
echo "  - V2 clients receive incomplete data (missing timestamps)"
echo ""
echo "🔍 Debugging approach:"
echo "  - Set breakpoints in handleMessage() and broadcastToAll()"
echo "  - Watch variables: player.protocol, detectedProtocol"
echo "  - Examine message translation (or lack thereof)"
echo "  - Check if translation functions are ever called (they're not!)"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Keep script running
wait $SERVER_PID
