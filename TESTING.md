# Testing Guide

This document describes the testing strategy for the Deno Debugger Skill.

## Test Structure

```
tests/
├── conftest.py              # Pytest configuration and fixtures
├── test_breadcrumbs.py      # Breadcrumb tracking tests (unit)
├── test_heap_parser.py      # Heap snapshot parsing tests (unit)
├── test_cpu_parser.py       # CPU profile parsing tests (unit)
└── fixtures/                # Test data (coming soon)

validate.py                  # Integration test against live Deno
run_tests.sh                 # Test runner script
.github/workflows/test.yml   # CI/CD configuration
```

## Types of Tests

### 1. Unit Tests (pytest)

Test individual components without requiring a running Deno instance.

**Run:**
```bash
pytest tests/ -v
```

**What's tested:**
- ✅ Breadcrumb tracking and timeline generation
- ✅ Heap snapshot parsing with minimal fixtures
- ✅ CPU profile parsing with minimal fixtures
- ✅ Data structure validation
- ✅ Analysis functions (with mock data)

**Coverage:**
- `scripts/breadcrumbs.py` - Full coverage
- `scripts/heap_analyzer.py` - Parser logic
- `scripts/cpu_profiler.py` - Parser logic
- `scripts/org_report.py` - (TODO)
- `scripts/visualize.py` - (TODO)

### 2. Integration Tests (validate.py)

Test against a real Deno instance to ensure CDP protocol works correctly.

**Run:**
```bash
python validate.py
```

**What's tested:**
- ✅ CDP WebSocket connection
- ✅ Debugger enable/disable
- ✅ Breakpoint set/remove
- ✅ Heap snapshot capture from real Deno
- ✅ CPU profile capture from real Deno
- ✅ Parsing real V8 data (not just fixtures)
- ✅ Snapshot comparison
- ✅ Visualization generation
- ✅ Org report generation
- ✅ End-to-end workflow

**Requirements:**
- Deno installed (any recent version)
- All Python dependencies installed

### 3. CI/CD Tests (GitHub Actions)

Automated testing on every push.

**What's tested:**
- Unit tests across Python 3.9, 3.10, 3.11
- Integration tests across Deno 1.40.x, 1.41.x, 1.42.x
- Code quality (black, isort, flake8)
- Type checking (mypy)

## Running Tests Locally

### Quick Start

```bash
# Run everything
./run_tests.sh
```

### Unit Tests Only

```bash
# Install dependencies
pip install -r requirements.txt

# Run all unit tests
pytest tests/ -v

# Run specific test file
pytest tests/test_breadcrumbs.py -v

# Run specific test
pytest tests/test_breadcrumbs.py::test_add_hypothesis -v

# With coverage
pytest tests/ --cov=scripts --cov-report=html
```

### Integration Tests

```bash
# Ensure Deno is installed
deno --version

# Run validation
python validate.py
```

**Expected output:**
```
🔧 Deno Debugger Skill Validation
==================================

✓ Deno found: deno 1.41.0
✓ Deno started (PID: 12345)
✓ Connected to CDP
✓ Debugger enabled
✓ Breakpoint set: bp123...
✓ Breakpoint removed
✓ Snapshot captured (1234567 bytes)
✓ Saved to data/validation_snapshot.heapsnapshot
...
✓ Validation Complete!
```

## Test Data and Fixtures

### Current Fixtures (Synthetic)

Located in `tests/conftest.py`:
- `sample_heap_data` - Minimal valid V8 heap snapshot
- `sample_cpu_profile` - Minimal valid V8 CPU profile

These are hand-crafted minimal examples that follow the V8 format specification.

### Real Fixtures (TODO)

Once validation passes, we'll capture real data:

```bash
# After successful validation run:
cp data/validation_snapshot.heapsnapshot tests/fixtures/real_snapshot.heapsnapshot
cp data/validation_profile.cpuprofile tests/fixtures/real_profile.cpuprofile
```

Then add tests that use these real fixtures to ensure parsing handles all real-world edge cases.

## Known Issues / Limitations

### Current Test Coverage

| Component | Unit Tests | Integration Tests | Coverage |
|-----------|-----------|-------------------|----------|
| cdp_client.py | ❌ | ✅ | ~50% |
| heap_analyzer.py | ✅ | ✅ | ~70% |
| cpu_profiler.py | ✅ | ✅ | ~70% |
| breadcrumbs.py | ✅ | ✅ | ~95% |
| visualize.py | ❌ | ✅ | ~30% |
| org_report.py | ❌ | ✅ | ~40% |

### What's Not Tested Yet

- ❌ CDP client edge cases (disconnection, errors)
- ❌ Retaining path analysis (complex heap structures)
- ❌ Large heap snapshot performance
- ❌ All visualization types
- ❌ Org report with complex structures
- ❌ Error handling in parsers
- ❌ Memory leak detection over multiple snapshots

## Adding New Tests

### Adding a Unit Test

```python
# tests/test_my_feature.py
import pytest
from my_module import my_function

def test_my_function():
    """Test description."""
    result = my_function(input_data)
    assert result == expected_output
```

### Adding an Integration Test

Add a test function to `validate.py`:

```python
async def validate_my_feature(client: CDPClient):
    """Test my new CDP feature."""
    print_test("Testing my feature")

    try:
        result = await client.my_new_command()
        print_success(f"Feature works: {result}")
        return True
    except Exception as e:
        print_error(f"Feature failed: {e}")
        return False

# Then call it in run_validation():
await validate_my_feature(client)
```

### Adding a Fixture

```python
# tests/conftest.py
@pytest.fixture
def my_test_data():
    """Description of test data."""
    return {
        'field': 'value',
        # ...
    }

# Use in test:
def test_with_fixture(my_test_data):
    assert my_test_data['field'] == 'value'
```

## CI/CD

Tests run automatically on:
- Every push to `main`, `develop`, or `claude/*` branches
- Every pull request

View results: https://github.com/YOUR_USERNAME/deno-debug-skill/actions

### Local CI Simulation

Run the same checks that CI runs:

```bash
# Code formatting
black --check scripts/ tests/ validate.py

# Import sorting
isort --check-only scripts/ tests/ validate.py

# Linting
flake8 scripts/ tests/ validate.py --max-line-length=120

# Type checking
mypy scripts/ --ignore-missing-imports

# Unit tests
pytest tests/ -v

# Integration tests
python validate.py
```

## Debugging Test Failures

### Unit Test Fails

```bash
# Run with more detail
pytest tests/test_failing.py -vv -s

# Drop into debugger on failure
pytest tests/test_failing.py --pdb

# Show local variables
pytest tests/test_failing.py -l
```

### Integration Test Fails

```bash
# Check Deno is running
ps aux | grep deno

# Check inspector port
netstat -an | grep 9229

# Run with Python debugger
python -m pdb validate.py

# Check Deno logs
# (validate.py captures stdout/stderr)
```

### Viewing Generated Artifacts

After a successful validation run:

```bash
# View snapshot
cat data/validation_snapshot.heapsnapshot | jq . | less

# View profile
cat data/validation_profile.cpuprofile | jq . | less

# View flamegraph
open output/validation_flamegraph.png

# View report
emacs output/validation_report.org
```

## Performance Testing

Currently no performance tests. Future additions:

- Benchmark heap snapshot parsing time
- Test with large (>100MB) heap snapshots
- Measure CDP command latency
- Profile memory usage of analyzers

## Contributing Tests

When adding new features:

1. **Write unit tests first** (TDD)
2. **Add integration test** if feature uses CDP
3. **Update this document** with coverage info
4. **Ensure CI passes** before PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## Resources

- [pytest documentation](https://docs.pytest.org/)
- [V8 Heap Snapshot Format](https://github.com/v8/v8/wiki/Heap-Snapshot-Format)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Deno Runtime API](https://deno.land/api)
