# Installation Guide

## For Users: Installing the Skill

If you just want to use the Deno debugger skill, you only need the `skill/` directory:

```bash
# Clone or download
git clone https://github.com/YOUR_USERNAME/deno-debug-skill.git
cd deno-debug-skill/skill

# Install dependencies
pip install -r requirements.txt
```

That's it! The skill is now available for Claude to use.

### Minimal Install (No Git)

If someone sends you just the `skill/` directory:

```bash
cd skill/
pip install -r requirements.txt
```

## For Developers: Full Development Setup

If you want to contribute, test, or modify the skill:

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/deno-debug-skill.git
cd deno-debug-skill

# Install development dependencies (includes skill deps + testing tools)
pip install -r requirements-dev.txt

# Install Playwright browsers (for advanced testing)
playwright install chromium

# Install Deno (if not already installed)
npm install -g deno

# Run tests to verify everything works
pytest tests/ -v

# Run full validation
python validate.py
```

## Dependencies

### Skill Dependencies (User)
- Python 3.9+
- pandas, numpy (data analysis)
- matplotlib, seaborn (visualization)
- websockets, aiohttp (CDP connection)
- See `skill/requirements.txt` for complete list

### Development Dependencies (Developer)
- All skill dependencies
- pytest, pytest-asyncio (testing)
- playwright (browser automation)
- black, isort, flake8 (code quality)
- mypy (type checking)
- See `requirements-dev.txt` for complete list

### Runtime Dependencies (Both)
- **Deno** - Required to debug Deno applications
  - Install: `npm install -g deno` or https://deno.land/

## Verification

### User Verification
```bash
# From skill/ directory
python -c "from scripts.cdp_client import CDPClient; print('✓ Skill ready')"
```

### Developer Verification
```bash
# From project root
./run_tests.sh
# Should show: 33 unit tests passing
```

## Structure

```
deno-debug-skill/
├── skill/              ← Users only need this
│   ├── SKILL.md
│   ├── scripts/
│   └── requirements.txt
│
└── (dev infrastructure)  ← Developers need full repo
    ├── tests/
    ├── examples/
    ├── validate.py
    └── requirements-dev.txt
```

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for complete details.

## Troubleshooting

**Import errors:**
```bash
# Make sure you're in the right directory
cd skill/
pip install -r requirements.txt
```

**Deno not found:**
```bash
# Install Deno
npm install -g deno

# Or use official installer
curl -fsSL https://deno.land/install.sh | sh
```

**Tests fail:**
```bash
# Install dev dependencies
pip install -r requirements-dev.txt

# Make sure Deno is installed
deno --version
```

## Next Steps

- **Users**: See `skill/README.md` for usage
- **Developers**: See `TESTING.md` for testing guide
- **Contributors**: See `CONTRIBUTING.md` for contribution guide
