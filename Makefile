.PHONY: help install install-dev install-skill test test-unit test-integration validate clean format lint package

help:
	@echo "Deno Debugger Skill - Make Commands"
	@echo "===================================="
	@echo ""
	@echo "User Commands:"
	@echo "  make install-skill    - Install just the skill (minimal)"
	@echo ""
	@echo "Developer Commands:"
	@echo "  make install-dev      - Install all dev dependencies"
	@echo "  make test             - Run all tests"
	@echo "  make test-unit        - Run unit tests only"
	@echo "  make test-integration - Run integration tests (requires Deno)"
	@echo "  make validate         - Run full validation"
	@echo "  make format           - Format code with black/isort"
	@echo "  make lint             - Run code quality checks"
	@echo "  make clean            - Clean generated files"
	@echo "  make package          - Package skill for distribution"
	@echo ""

# User: Install just the skill
install-skill:
	@echo "Installing Deno Debugger Skill..."
	cd deno-debugger && pip install -r requirements.txt
	@echo "✓ Skill installed!"

# Developer: Install everything
install-dev:
	@echo "Installing development dependencies..."
	pip install -r requirements-dev.txt
	@echo "Installing Playwright browsers..."
	playwright install chromium
	@echo "✓ Development environment ready!"

# Shorthand
install: install-dev

# Run all tests
test:
	pytest tests/ -v

# Unit tests only (fast, no Deno required)
test-unit:
	pytest tests/test_breadcrumbs.py tests/test_heap_parser.py tests/test_cpu_parser.py -v

# Integration tests (requires Deno)
test-integration:
	pytest tests/test_integration_cdp.py -v

# Full validation
validate:
	python validate.py

# Code formatting
format:
	@echo "Formatting with black..."
	black deno-debugger/scripts/ tests/ validate.py
	@echo "Sorting imports..."
	isort deno-debugger/scripts/ tests/ validate.py

# Linting
lint:
	@echo "Running flake8..."
	flake8 deno-debugger/scripts/ tests/ validate.py --max-line-length=120 --extend-ignore=E203,W503
	@echo "Checking code format..."
	black --check deno-debugger/scripts/ tests/ validate.py
	@echo "Checking import order..."
	isort --check-only deno-debugger/scripts/ tests/ validate.py

# Clean up
clean:
	@echo "Cleaning generated files..."
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	rm -rf .pytest_cache htmlcov .coverage
	rm -rf .playwright playwright-report test-results
	rm -f data/validation_* output/validation_*
	@echo "Done!"

# Package the skill for distribution
package:
	@echo "Packaging skill..."
	cd deno-debugger && tar -czf ../deno-debugger-skill.tar.gz .
	@echo "✓ Created deno-debugger-skill.tar.gz"
