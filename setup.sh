#!/bin/bash
# Setup script for Deno Debugger Skill

set -e

echo "🔧 Setting up Deno Debugger Skill..."
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not found"
    echo "   Please install Python 3.8 or higher"
    exit 1
fi

echo "✅ Python found: $(python3 --version)"

# Check Deno
if ! command -v deno &> /dev/null; then
    echo "⚠️  Deno not found"
    echo "   Install from: https://deno.land/manual/getting_started/installation"
    echo "   (Optional - only needed to run example apps)"
else
    echo "✅ Deno found: $(deno --version | head -n1)"
fi

echo ""
echo "📦 Installing Python dependencies..."

# Create virtual environment (optional but recommended)
if [ ! -d "venv" ]; then
    echo "   Creating virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate 2>/dev/null || true

# Install requirements
pip install -r requirements.txt --quiet

echo "✅ Dependencies installed"
echo ""

# Create data directories
echo "📁 Creating directories..."
mkdir -p data output

echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo ""
echo "1. Start a Deno app with inspector:"
echo "   deno run --inspect --allow-net examples/leaky_app.ts"
echo ""
echo "2. In another terminal, ask Claude:"
echo "   'Investigate the memory leak in this app'"
echo ""
echo "3. Claude will use this skill to debug!"
echo ""
echo "📖 See README.md for full documentation"
echo ""
