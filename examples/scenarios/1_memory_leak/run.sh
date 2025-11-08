#!/bin/bash
#
# Memory Leak Investigation Scenario
#
# This script starts the buggy app and shows you how to have Claude investigate it.
#

set -e

SCENARIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCENARIO_DIR/../../.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/data/scenarios/memory_leak_$(date +%Y%m%d_%H%M%S)"

echo "================================================================================"
echo "SCENARIO 1: Memory Leak Investigation"
echo "================================================================================"
echo ""
echo "This scenario demonstrates how Claude debugs a memory leak."
echo ""
echo "Setting up..."
mkdir -p "$OUTPUT_DIR"

# Start the buggy app
echo ""
echo "Starting Deno app with --inspect on port 9229..."
deno run --inspect=127.0.0.1:9229 --allow-net "$SCENARIO_DIR/app.ts" > "$OUTPUT_DIR/app.log" 2>&1 &
APP_PID=$!
echo "✓ App started (PID: $APP_PID)"
echo "  Logs: $OUTPUT_DIR/app.log"

sleep 2

echo ""
echo "App is running at http://localhost:8000"
echo "Inspector at ws://127.0.0.1:9229"
echo ""

# Trigger some leaks
echo "Triggering memory leaks..."
for i in {1..3}; do
  echo "  Upload $i/3..."
  curl -s "http://localhost:8000/upload?size=50000000" > /dev/null
done
echo "✓ Triggered 3 uploads (~150MB leaked)"

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
echo "  1. Connect to the Deno inspector at ws://127.0.0.1:9229"
echo "  2. Capture baseline heap snapshot"
echo "  3. Trigger more uploads or analyze existing memory state"
echo "  4. Capture comparison snapshot"
echo "  5. Analyze heap growth"
echo "  6. Identify the leakedBuffers array retaining ArrayBuffer objects"
echo "  7. Generate investigation report in Org mode format"
echo ""
echo "All investigation artifacts will be saved to: $OUTPUT_DIR/"
echo ""
echo "Press Ctrl+C when done to clean up..."
echo ""

# Wait for user interrupt
trap "echo ''; echo 'Stopping app...'; kill $APP_PID 2>/dev/null; echo '✓ Cleanup complete'; echo ''; echo 'Investigation results saved to:'; echo "  $OUTPUT_DIR/"; exit 0" INT

wait $APP_PID
