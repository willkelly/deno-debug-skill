#!/bin/bash

echo "================================"
echo "State Corruption Debugging Scenario"
echo "================================"
echo ""
echo "This scenario demonstrates using:"
echo "  - Conditional breakpoints (break when session.corrupted === true)"
echo "  - Variable watches (watch DEFAULT_SESSION mutations)"
echo "  - Watch expressions (track specific object properties)"
echo "  - Step-by-step debugging to find reference bugs"
echo ""
echo "Starting Deno app with --inspect..."
echo ""

# Start the Deno app with inspector
deno run --inspect --allow-net app.ts &
DENO_PID=$!

# Wait for server to start
sleep 2

echo ""
echo "========================================"
echo "App is running with inspector on port 9229"
echo "========================================"
echo ""
echo "Trigger the bugs with:"
echo ""
echo "  # Create two sessions"
echo "  curl -X POST 'http://localhost:8003/session?user=user-001&name=alice'"
echo "  curl -X POST 'http://localhost:8003/session?user=user-002&name=bob'"
echo "  curl 'http://localhost:8003/sessions'  # Alice is now 'bob'!"
echo ""
echo "  # Run full simulation"
echo "  curl 'http://localhost:8003/simulate'"
echo ""
echo "========================================"
echo "Now give Claude this prompt:"
echo "========================================"
echo ""
cat prompt.txt
echo ""
echo "========================================"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Wait for user to stop
wait $DENO_PID
