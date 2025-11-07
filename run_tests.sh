#!/bin/bash
# Test runner for Deno Debugger Skill

set -e

echo "🧪 Deno Debugger Skill Test Suite"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if in virtual environment
if [[ -z "${VIRTUAL_ENV}" ]]; then
    echo "💡 Tip: Consider activating a virtual environment first"
    echo "   python -m venv venv && source venv/bin/activate"
    echo ""
fi

# Install dependencies if needed
if ! python -c "import pytest" 2>/dev/null; then
    echo "📦 Installing test dependencies..."
    pip install -q -r requirements.txt
fi

# Run unit tests
echo -e "${BLUE}Running unit tests...${NC}"
pytest tests/ -v --tb=short

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Unit tests passed${NC}"
else
    echo "✗ Unit tests failed"
    exit 1
fi

echo ""

# Ask if user wants to run integration tests
if command -v deno &> /dev/null; then
    echo -e "${BLUE}Deno detected. Run integration tests? (y/n)${NC}"
    read -r response

    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo ""
        echo -e "${BLUE}Running integration tests...${NC}"
        python validate.py

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Integration tests passed${NC}"
        else
            echo "✗ Integration tests failed"
            exit 1
        fi
    fi
else
    echo "⚠️  Deno not found. Skipping integration tests."
    echo "   Install from: https://deno.land/"
fi

echo ""
echo -e "${GREEN}✓ All tests completed${NC}"
