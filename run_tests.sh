#!/bin/bash
# Test runner for Deno Debugger Skill

set -e

echo "🧪 Deno Debugger Skill Test Suite"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Deno is installed
if ! command -v deno &> /dev/null; then
    echo "❌ Deno is not installed"
    echo "Install from: https://deno.land/"
    echo ""
    echo "Quick install:"
    echo "  curl -fsSL https://deno.land/install.sh | sh"
    exit 1
fi

echo -e "${BLUE}Using Deno version:${NC}"
deno --version
echo ""

# Change to deno-debugger directory
cd deno-debugger

# Run formatting check
echo -e "${BLUE}Checking code formatting...${NC}"
if deno fmt --check; then
    echo -e "${GREEN}✓ Code formatting check passed${NC}"
else
    echo -e "${YELLOW}⚠ Code formatting issues found. Run 'deno fmt' to fix${NC}"
fi
echo ""

# Run linting
echo -e "${BLUE}Running linter...${NC}"
if deno lint; then
    echo -e "${GREEN}✓ Linting passed${NC}"
else
    echo "✗ Linting failed"
    exit 1
fi
echo ""

# Run type checking
echo -e "${BLUE}Type checking scripts...${NC}"
cd scripts
if deno check *.ts; then
    echo -e "${GREEN}✓ Type check passed${NC}"
else
    echo "✗ Type check failed"
    exit 1
fi
cd ..
echo ""

# Run unit tests
echo -e "${BLUE}Running unit tests...${NC}"
if deno task test; then
    echo -e "${GREEN}✓ Unit tests passed${NC}"
else
    echo "✗ Unit tests failed"
    exit 1
fi
echo ""

# Ask if user wants to run integration tests
echo -e "${BLUE}Run integration tests with example scenarios? (y/n)${NC}"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${BLUE}Checking example scenarios compile...${NC}"

    cd ../examples/scenarios

    scenarios=("1_memory_leak" "2_performance_bottleneck" "3_race_condition" "4_state_corruption" "5_event_loop_timing")

    for scenario in "${scenarios[@]}"; do
        if [ -d "$scenario" ]; then
            echo "  Checking $scenario/app.ts..."
            cd "$scenario"
            if deno check app.ts; then
                echo -e "    ${GREEN}✓${NC}"
            else
                echo -e "    ✗ Failed"
                exit 1
            fi
            cd ..
        fi
    done

    echo -e "${GREEN}✓ All scenarios compile successfully${NC}"
    echo ""
    echo -e "${BLUE}To run a full integration test with a scenario:${NC}"
    echo "  cd examples/scenarios/1_memory_leak"
    echo "  ./run.sh"
fi

echo ""
echo -e "${GREEN}✓ All automated tests completed successfully!${NC}"
