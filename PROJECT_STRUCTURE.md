# Project Structure

This repository is organized to separate the **skill** (what users install) from **development/testing infrastructure**.

## 📦 What Users Get: `skill/`

This directory contains only what's needed to use the Deno debugger skill:

```
skill/
├── SKILL.md                    # Instructions Claude reads
├── README.md                   # Installation guide
├── requirements.txt            # Python deps (minimal)
└── scripts/
    ├── cdp_client.py          # CDP connection
    ├── heap_analyzer.py       # Heap analysis
    ├── cpu_profiler.py        # CPU profiling
    ├── breadcrumbs.py         # Investigation tracking
    ├── visualize.py           # Flamegraphs/charts
    └── org_report.py          # Report generation
```

**Installation:**
```bash
cd skill/
pip install -r requirements.txt
```

That's it! No tests, no examples, no validation scripts.

## 🔧 Development Infrastructure: Root Directory

Everything else is for developing and testing the skill:

```
.
├── skill/                      # The actual skill (above)
│
├── tests/                      # Test suite
│   ├── conftest.py            # Pytest fixtures
│   ├── test_breadcrumbs.py    # Unit tests (12)
│   ├── test_heap_parser.py    # Unit tests (10)
│   ├── test_cpu_parser.py     # Unit tests (11)
│   └── test_integration_cdp.py # Integration tests (Deno required)
│
├── examples/                   # Example apps and reports
│   ├── leaky_app.ts           # Demo app with memory leak
│   └── memory_leak_example.org # Example investigation
│
├── templates/                  # Report templates
│   └── investigation_template.org
│
├── .github/workflows/          # CI/CD
│   └── test.yml               # Automated testing
│
├── validate.py                 # Validation script
├── simulate_validation.py      # Simulation
├── run_tests.sh               # Test runner
├── requirements-dev.txt        # Dev dependencies (includes Playwright)
│
└── docs/                       # Documentation
    ├── README.md              # Main docs
    ├── TESTING.md             # Testing guide
    ├── CONTRIBUTING.md        # Contribution guide
    ├── VALIDATION_REPORT.md   # Validation status
    └── etc.
```

## 🎯 Why This Structure?

### For Users
- **Minimal install** - Only 6 Python files + deps
- **No clutter** - No test code, examples, or dev tools
- **Fast setup** - Just `pip install -r requirements.txt`

### For Developers
- **Complete testing** - Unit tests, integration tests, validation
- **Examples** - Real debugging scenarios
- **CI/CD** - Automated testing on every commit
- **Playwright** - Browser automation for advanced CDP testing

## 📋 Common Tasks

### Use the Skill
```bash
cd skill/
pip install -r requirements.txt
# Skill is now available to Claude
```

### Develop & Test
```bash
# Install dev dependencies (includes skill deps)
pip install -r requirements-dev.txt

# Install Playwright browsers
playwright install chromium

# Run unit tests
pytest tests/ -v

# Run integration tests (requires Deno)
pytest tests/test_integration_cdp.py -v

# Full validation
python validate.py
```

### Contribute
```bash
# Run all tests
./run_tests.sh

# Format code
black skill/scripts/ tests/
isort skill/scripts/ tests/

# Type check
mypy skill/scripts/ --ignore-missing-imports
```

## 🔄 Workflow

1. **Develop** in `skill/scripts/`
2. **Test** with `tests/`
3. **Validate** with `validate.py`
4. **Document** in markdown files
5. **Ship** the `skill/` directory

## 📦 Distribution

When ready to distribute:

```bash
# Just share the skill/ directory
tar -czf deno-debugger-skill.tar.gz skill/

# Or install directly
pip install -r skill/requirements.txt
```

Users never see tests, validation, examples, etc. - just the clean skill.

## 🧪 Testing Levels

| Level | Location | Purpose | Requires |
|-------|----------|---------|----------|
| **Unit** | `tests/test_*.py` | Fast, isolated tests | Nothing |
| **Integration** | `tests/test_integration_cdp.py` | Real Deno testing | Deno |
| **Validation** | `validate.py` | Full E2E workflow | Deno |
| **CI/CD** | `.github/workflows/` | Automated gates | GitHub Actions |

## 🎨 Adding Features

**Add to skill:**
- New analysis functions → `skill/scripts/`
- New capabilities → Update `skill/SKILL.md`
- New dependencies → Add to `skill/requirements.txt`

**Add to dev:**
- New tests → `tests/`
- New examples → `examples/`
- New docs → Root directory
- Dev tools → `requirements-dev.txt`

## 🚀 Why Playwright?

Added to `requirements-dev.txt` for advanced testing:
- Launch browser with DevTools
- Control CDP via browser automation
- Visual debugging of CDP interactions
- Test against Chrome/Edge/Webkit too
- Better error messages and debugging

Example:
```python
from playwright.async_api import async_playwright

async with async_playwright() as p:
    browser = await p.chromium.launch()
    # Use browser's CDP endpoint for testing
```

This structure keeps the skill lean while providing a robust development environment!
