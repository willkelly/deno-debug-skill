.PHONY: help install install-dev install-skill test test-watch typecheck validate clean format lint package

help:
	@echo "Deno Debugger Skill - Make Commands"
	@echo "===================================="
	@echo ""
	@echo "User Commands:"
	@echo "  make install-skill    - Install the skill (just copy it - no deps needed!)"
	@echo ""
	@echo "Developer Commands:"
	@echo "  make install-dev      - Check Deno installation"
	@echo "  make test             - Run all tests"
	@echo "  make test-watch       - Run tests in watch mode"
	@echo "  make typecheck        - Type check all TypeScript files"
	@echo "  make format           - Format code with deno fmt"
	@echo "  make lint             - Run code quality checks (deno lint + fmt check)"
	@echo "  make clean            - Clean generated files"
	@echo "  make package          - Package skill for distribution"
	@echo ""

# User: Install just the skill
install-skill:
	@echo "Installing Deno Debugger Skill..."
	@echo "No dependencies to install - pure TypeScript using Deno stdlib!"
	@echo "Just copy deno-debugger/ to ~/.claude/skills/"
	@echo "✓ Skill ready to use!"

# Developer: Check Deno installation
install-dev:
	@echo "Checking Deno installation..."
	@which deno > /dev/null || (echo "❌ Please install Deno: curl -fsSL https://deno.land/install.sh | sh" && exit 1)
	@echo "✓ Deno is installed: $$(deno --version | head -1)"

# Shorthand
install: install-dev

# Run all tests
test:
	@echo "Running all tests..."
	cd deno-debugger && deno task test

# Run tests in watch mode
test-watch:
	@echo "Running tests in watch mode..."
	cd deno-debugger && deno task test:watch

# Type check all TypeScript files
typecheck:
	@echo "Type checking all TypeScript files..."
	cd deno-debugger/scripts && deno check *.ts
	@echo "✓ Type check passed!"

# Full validation (examples compilation check)
validate:
	@echo "Validating example scenarios..."
	@cd examples/scenarios/1_memory_leak && deno check app.ts
	@cd examples/scenarios/2_performance && deno check app.ts
	@echo "✓ All examples are valid!"

# Code formatting
format:
	@echo "Formatting with deno fmt..."
	cd deno-debugger && deno fmt
	@echo "✓ Code formatted!"

# Linting
lint:
	@echo "Running deno lint..."
	cd deno-debugger && deno lint
	@echo "Checking code format..."
	cd deno-debugger && deno fmt --check
	@echo "✓ Linting passed!"

# Clean up
clean:
	@echo "Cleaning generated files..."
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	rm -rf .pytest_cache htmlcov .coverage
	rm -rf investigation_output/
	rm -f *.heapsnapshot *.cpuprofile
	@echo "✓ Cleaned!"

# Package the skill for distribution
package:
	@echo "Packaging skill..."
	cd deno-debugger && tar -czf ../deno-debugger-skill.tar.gz \
		--exclude="*.pyc" --exclude="__pycache__" --exclude="*.py" \
		SKILL.md README.md deno.json scripts/*.ts
	@echo "✓ Created deno-debugger-skill.tar.gz"
