#!/bin/bash

echo "================================"
echo "Event Loop Timing Debugging Scenario"
echo "================================"
echo ""
echo "This scenario demonstrates:"
echo "  - Understanding microtasks vs macrotasks"
echo "  - Stepping through async code to see execution order"
echo "  - Watching state changes in real-time"
echo "  - setTimeout(0) doesn't mean 'immediate'"
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
echo "  # Schedule task (will be pending!)"
echo "  curl -X POST 'http://localhost:8004/task/immediate?name=test1'"
echo ""
echo "  # See execution order confusion"
echo "  curl -X POST 'http://localhost:8004/mixed'"
echo ""
echo "  # Process batch (wrong order)"
echo "  curl -X POST 'http://localhost:8004/batch?count=5'"
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
