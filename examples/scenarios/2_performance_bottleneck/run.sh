#!/bin/bash
#
# Performance Bottleneck Investigation Scenario
#
# This script starts a slow API and shows you how to have Claude profile it.
#

set -e

SCENARIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCENARIO_DIR/../../.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/data/scenarios/performance_$(date +%Y%m%d_%H%M%S)"

echo "================================================================================"
echo "SCENARIO 2: Performance Bottleneck Investigation"
echo "================================================================================"
echo ""
echo "This scenario demonstrates how Claude profiles slow APIs."
echo ""
echo "Setting up..."
mkdir -p "$OUTPUT_DIR"

# Start the slow API
echo ""
echo "Starting Deno app with --inspect on port 9229..."
deno run --inspect=127.0.0.1:9229 --allow-net "$SCENARIO_DIR/app.ts" > "$OUTPUT_DIR/app.log" 2>&1 &
APP_PID=$!
echo "✓ App started (PID: $APP_PID)"
echo "  Logs: $OUTPUT_DIR/app.log"

sleep 2

echo ""
echo "App is running at http://localhost:8001"
echo "Inspector at ws://127.0.0.1:9229"
echo ""

echo "Testing slow endpoints..."
echo "  Testing /primes?limit=10000 ..."
curl -s "http://localhost:8001/primes?limit=10000" | grep -o '"duration_ms": "[^"]*"' || echo "  (request completed)"
echo "  Testing /fibonacci?n=35 ..."
curl -s "http://localhost:8001/fibonacci?n=35" | grep -o '"duration_ms": "[^"]*"' || echo "  (request completed)"
echo "✓ Confirmed endpoints are slow"

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
echo "  2. Start CPU profiling"
echo "  3. Trigger slow endpoints (or ask you to)"
echo "  4. Stop profiling and analyze hot paths"
echo "  5. Identify inefficient algorithms:"
echo "     - isPrime() checking all numbers instead of sqrt(n)"
echo "     - fibonacci() using exponential recursion without memoization"
echo "  6. Generate flamegraph visualization"
echo "  7. Provide optimization recommendations"
echo ""
echo "All investigation artifacts will be saved to: $OUTPUT_DIR/"
echo ""
echo "Press Ctrl+C when done to clean up..."
echo ""

# Wait for user interrupt
trap "echo ''; echo 'Stopping app...'; kill $APP_PID 2>/dev/null; echo '✓ Cleanup complete'; echo ''; echo 'Investigation results saved to:'; echo "  $OUTPUT_DIR/"; exit 0" INT

wait $APP_PID
