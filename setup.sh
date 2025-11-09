#!/bin/bash
# Setup script for Deno Debugger Skill

set -e

echo "🔧 Setting up Deno Debugger Skill..."
echo ""

# Check Deno
if ! command -v deno &> /dev/null; then
    echo "❌ Deno is required but not found"
    echo ""
    echo "Install Deno:"
    echo "  curl -fsSL https://deno.land/install.sh | sh"
    echo ""
    echo "Or see: https://deno.land/"
    exit 1
fi

echo "✅ Deno found: $(deno --version | head -n1)"
echo ""

# Create data directories
echo "📁 Creating output directories..."
mkdir -p data output investigation_output

echo "✅ Directories created"
echo ""

# Verify TypeScript files compile
echo "🔍 Verifying TypeScript compilation..."
cd deno-debugger/scripts
if deno check *.ts; then
    echo "✅ All TypeScript files compile successfully"
else
    echo "❌ TypeScript compilation failed"
    exit 1
fi
cd ../..
echo ""

echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo ""
echo "1. Try running the test suite:"
echo "   ./run_tests.sh"
echo ""
echo "2. Or try a scenario:"
echo "   cd examples/scenarios/1_memory_leak"
echo "   ./run.sh"
echo ""
echo "3. Install the skill to Claude Code:"
echo "   cp -r deno-debugger ~/.claude/skills/"
echo ""
echo "4. Start your Deno app with inspector:"
echo "   deno run --inspect --allow-net your-app.ts"
echo ""
echo "5. Ask Claude to investigate!"
echo ""
echo "📖 See README.md for full documentation"
echo ""
