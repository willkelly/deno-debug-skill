.PHONY: help install test test-unit test-integration lint format clean

help:
	@echo "Deno Debugger Skill - Make Commands"
	@echo "===================================="
	@echo ""
	@echo "  make install          - Install dependencies"
	@echo "  make test             - Run all tests"
	@echo "  make test-unit        - Run unit tests only"
	@echo "  make test-integration - Run integration tests"
	@echo "  make lint             - Run code quality checks"
	@echo "  make format           - Format code with black/isort"
	@echo "  make clean            - Clean generated files"
	@echo ""

install:
	pip install -r requirements.txt

test:
	./run_tests.sh

test-unit:
	pytest tests/ -v

test-integration:
	python validate.py

lint:
	@echo "Running flake8..."
	flake8 scripts/ tests/ validate.py --max-line-length=120 --extend-ignore=E203,W503
	@echo "Checking code format..."
	black --check scripts/ tests/ validate.py
	@echo "Checking import order..."
	isort --check-only scripts/ tests/ validate.py

format:
	@echo "Formatting with black..."
	black scripts/ tests/ validate.py
	@echo "Sorting imports..."
	isort scripts/ tests/ validate.py

clean:
	@echo "Cleaning generated files..."
	rm -rf __pycache__
	rm -rf scripts/__pycache__
	rm -rf tests/__pycache__
	rm -rf .pytest_cache
	rm -rf htmlcov
	rm -rf .coverage
	rm -f data/validation_*
	rm -f output/validation_*
	@echo "Done!"
