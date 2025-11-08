# Tests

Quick reference for running tests.

## Run All Tests

```bash
./run_tests.sh
```

## Run Unit Tests Only

```bash
pytest tests/ -v
```

## Run Specific Tests

```bash
# One test file
pytest tests/test_breadcrumbs.py -v

# One specific test
pytest tests/test_breadcrumbs.py::test_add_hypothesis -v

# Tests matching a pattern
pytest tests/ -k "snapshot" -v
```

## Run Integration Tests

```bash
python validate.py
```

## With Coverage

```bash
pytest tests/ --cov=scripts --cov-report=html
open htmlcov/index.html
```

## Test Structure

- `conftest.py` - Shared fixtures (sample heap data, CPU profiles)
- `test_breadcrumbs.py` - Breadcrumb tracking (12 tests)
- `test_heap_parser.py` - Heap snapshot parsing (10 tests)
- `test_cpu_parser.py` - CPU profile parsing (11 tests)
- `test_integration_cdp.py` - Integration tests with real Deno

## Adding Tests

1. Create `test_*.py` file
2. Import module: `from my_module import my_function`
3. Write test: `def test_my_function():`
4. Use fixtures: `def test_with_data(sample_heap_data):`
5. Assert results: `assert result == expected`

See [../TESTING.md](../TESTING.md) for detailed guide.
