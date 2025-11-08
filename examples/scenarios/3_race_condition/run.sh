#!/bin/bash
#
# Race Condition Investigation Scenario
#
# This script starts an app with async bugs and shows you how to have Claude investigate.
#

set -e

SCENARIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCENARIO_DIR/../../.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/data/scenarios/race_condition_$(date +%Y%m%d_%H%M%S)"

echo "================================================================================"
echo "SCENARIO 3: Race Condition Investigation"
echo "================================================================================"
echo ""
echo "This scenario demonstrates how Claude debugs async/race condition bugs."
echo ""
echo "Setting up..."
mkdir -p "$OUTPUT_DIR"

# Start the buggy async app
echo ""
echo "Starting Deno app with --inspect on port 9229..."
deno run --inspect=127.0.0.1:9229 --allow-net "$SCENARIO_DIR/app.ts" > "$OUTPUT_DIR/app.log" 2>&1 &
APP_PID=$!
echo "✓ App started (PID: $APP_PID)"
echo "  Logs: $OUTPUT_DIR/app.log"

sleep 2

echo ""
echo "App is running at http://localhost:8002"
echo "Inspector at ws://127.0.0.1:9229"
echo ""

echo "Demonstrating race conditions..."
echo "  Creating order (missing await bug)..."
curl -s -X POST "http://localhost:8002/order?product=widget&qty=5" > /dev/null
sleep 0.05
echo "  Checking orders immediately..."
curl -s "http://localhost:8002/orders" | grep -o '"count": [0-9]*' || echo "  (order not saved yet!)"
sleep 0.2
echo "  Checking orders again after delay..."
curl -s "http://localhost:8002/orders" | grep -o '"count": [0-9]*' || echo "  (now it appears)"
echo "✓ Confirmed race condition exists"

echo ""
echo "================================================================================"
echo "NOW ASK CLAUDE TO INVESTIGATE"
echo "================================================================================"
echo ""
echo "Copy and paste this prompt to Claude:"
echo ""
cat "$SCENARIO_DIR/prompt.txt"
echo ""
echo "================================================================================"
echo ""
echo "Claude will:"
echo "  1. Connect to the Deno inspector"
echo "  2. Set breakpoints at async boundaries (promise creation/resolution)"
echo "  3. Trace execution flow of problematic operations"
echo "  4. Identify issues:"
echo "     - createOrder() missing await (returns before saving)"
echo "     - updateOrderStatus() has race between load and save"
echo "     - processBatch() uses Promise.all() where order matters"
echo "  5. Use CPU profiling to analyze timing"
echo "  6. Recommend proper synchronization patterns"
echo ""
echo "All investigation artifacts will be saved to: $OUTPUT_DIR/"
echo ""
echo "Press Ctrl+C when done to clean up..."
echo ""

# Wait for user interrupt
trap "echo ''; echo 'Stopping app...'; kill $APP_PID 2>/dev/null; echo '✓ Cleanup complete'; echo ''; echo 'Investigation results saved to:'; echo "  $OUTPUT_DIR/"; exit 0" INT

wait $APP_PID
