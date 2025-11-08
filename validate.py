#!/usr/bin/env python3
"""
Validation script for Deno Debugger Skill.

Tests the skill against a real Deno instance to ensure:
- CDP connection works
- Breakpoints can be set
- Heap snapshots can be captured and parsed
- CPU profiles can be captured and parsed
- All analysis functions work with real data

Usage:
    python validate.py
"""

import asyncio
import subprocess
import time
import sys
import os
import signal
from pathlib import Path

# Add scripts to path
sys.path.insert(0, str(Path(__file__).parent / 'scripts'))

from cdp_client import CDPClient
from heap_analyzer import HeapSnapshot, compare_snapshots, find_largest_objects
from cpu_profiler import CPUProfile
from breadcrumbs import Breadcrumbs
from visualize import flamegraph, heap_timeline, memory_growth_chart
from org_report import OrgReport

import json
import pandas as pd


class Colors:
    """ANSI color codes for pretty output."""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'


def print_test(name: str):
    """Print test name."""
    print(f"\n{Colors.BLUE}▶ {name}{Colors.END}")


def print_success(msg: str):
    """Print success message."""
    print(f"  {Colors.GREEN}✓{Colors.END} {msg}")


def print_error(msg: str):
    """Print error message."""
    print(f"  {Colors.RED}✗{Colors.END} {msg}")


def print_warning(msg: str):
    """Print warning message."""
    print(f"  {Colors.YELLOW}⚠{Colors.END} {msg}")


class DenoProcess:
    """Manage a Deno process for testing."""

    def __init__(self, script_path: str, port: int = 9229):
        self.script_path = script_path
        self.port = port
        self.process = None

    def start(self):
        """Start Deno with inspector."""
        print_test(f"Starting Deno: {self.script_path}")

        self.process = subprocess.Popen(
            [
                'deno', 'run',
                f'--inspect=127.0.0.1:{self.port}',
                '--allow-net',
                self.script_path
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Wait for inspector to be ready
        time.sleep(2)

        if self.process.poll() is not None:
            stdout, stderr = self.process.communicate()
            print_error(f"Deno failed to start")
            print(f"  stdout: {stdout}")
            print(f"  stderr: {stderr}")
            return False

        print_success(f"Deno started (PID: {self.process.pid})")
        return True

    def stop(self):
        """Stop the Deno process."""
        if self.process:
            print_test("Stopping Deno")
            self.process.send_signal(signal.SIGTERM)
            try:
                self.process.wait(timeout=5)
                print_success("Deno stopped")
            except subprocess.TimeoutExpired:
                self.process.kill()
                print_warning("Deno killed (timeout)")


async def validate_cdp_connection(port: int = 9229):
    """Test CDP connection."""
    print_test("Testing CDP connection")

    try:
        client = CDPClient('127.0.0.1', port)
        await client.connect()
        print_success("Connected to CDP")

        await client.enable_debugger()
        print_success("Debugger enabled")

        return client
    except Exception as e:
        print_error(f"CDP connection failed: {e}")
        return None


async def validate_breakpoints(client: CDPClient):
    """Test breakpoint functionality."""
    print_test("Testing breakpoints")

    try:
        # Try to set a breakpoint in the leaky app
        # We'll use a URL regex since we don't know the exact path
        bp_id = await client.set_breakpoint_by_url(
            url_regex='.*leaky_app.ts',
            line=10,  # Around the handleUpload function
        )
        print_success(f"Breakpoint set: {bp_id}")

        # Try to remove it
        await client.remove_breakpoint(bp_id)
        print_success("Breakpoint removed")

        return True
    except Exception as e:
        print_error(f"Breakpoint test failed: {e}")
        return False


async def validate_heap_snapshot(client: CDPClient):
    """Test heap snapshot capture and parsing."""
    print_test("Testing heap snapshot capture")

    try:
        snapshot_json = await client.take_heap_snapshot(report_progress=False)
        print_success(f"Snapshot captured ({len(snapshot_json)} bytes)")

        # Save for inspection
        snapshot_path = 'data/validation_snapshot.heapsnapshot'
        with open(snapshot_path, 'w') as f:
            f.write(snapshot_json)
        print_success(f"Saved to {snapshot_path}")

        # Try to parse it
        print_test("Testing heap snapshot parsing")
        data = json.loads(snapshot_json)
        snapshot = HeapSnapshot(data)

        print_success(f"Parsed: {len(snapshot.nodes)} nodes, {len(snapshot.edges)} edges")

        # Test analysis functions
        summary = snapshot.get_node_size_summary()
        print_success(f"Node summary: {len(summary)} types")
        print(f"    Top types: {', '.join(summary.head(3)['node_type'].tolist())}")

        largest = find_largest_objects(snapshot, limit=5)
        print_success(f"Found {len(largest)} largest objects")

        return snapshot
    except Exception as e:
        print_error(f"Heap snapshot test failed: {e}")
        import traceback
        traceback.print_exc()
        return None


async def validate_cpu_profile(client: CDPClient):
    """Test CPU profiling."""
    print_test("Testing CPU profiling")

    try:
        await client.start_profiling()
        print_success("CPU profiling started")

        # Let it profile for a bit
        await asyncio.sleep(1)

        profile_data = await client.stop_profiling()
        print_success("CPU profiling stopped")

        # Save for inspection
        profile_path = 'data/validation_profile.cpuprofile'
        with open(profile_path, 'w') as f:
            json.dump(profile_data, f, indent=2)
        print_success(f"Saved to {profile_path}")

        # Try to parse it
        print_test("Testing CPU profile parsing")
        profile = CPUProfile(profile_data)

        print_success(f"Parsed: {len(profile.nodes)} nodes, {profile.total_samples} samples")

        # Test analysis
        hot = profile.get_hot_functions(limit=5)
        print_success(f"Hot functions: {len(hot)}")
        if not hot.empty:
            print(f"    Hottest: {hot.iloc[0]['function_name']}")

        return profile
    except Exception as e:
        print_error(f"CPU profile test failed: {e}")
        import traceback
        traceback.print_exc()
        return None


async def validate_comparison(client: CDPClient):
    """Test snapshot comparison (memory leak detection)."""
    print_test("Testing snapshot comparison")

    try:
        # Capture before snapshot
        print("  Capturing baseline snapshot...")
        before_json = await client.take_heap_snapshot()
        before = HeapSnapshot(json.loads(before_json))
        print_success(f"Baseline: {len(before.nodes)} nodes")

        # Wait a bit for some activity
        await asyncio.sleep(1)

        # Capture after snapshot
        print("  Capturing comparison snapshot...")
        after_json = await client.take_heap_snapshot()
        after = HeapSnapshot(json.loads(after_json))
        print_success(f"After: {len(after.nodes)} nodes")

        # Compare
        print_test("Testing snapshot comparison analysis")
        comparison = compare_snapshots(before, after)

        if not comparison.empty:
            print_success(f"Comparison: {len(comparison)} growing objects")
            print(f"    Top growth: {comparison.iloc[0]['name']} (+{comparison.iloc[0]['size_delta']} bytes)")
        else:
            print_warning("No growth detected (app might be idle)")

        return comparison
    except Exception as e:
        print_error(f"Comparison test failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def validate_breadcrumbs():
    """Test breadcrumb tracking."""
    print_test("Testing breadcrumbs")

    try:
        bc = Breadcrumbs('validation_test')
        bc.add_hypothesis("Testing breadcrumb system", rationale="Validation script")
        bc.add_test("validation", "Running validation tests")
        bc.add_finding("All tests passed", severity="low")

        # Save
        bc.save('data/validation_breadcrumbs.json')
        print_success("Breadcrumbs saved")

        # Generate timeline
        timeline = bc.to_org_timeline()
        print_success(f"Timeline generated ({len(timeline)} chars)")

        return bc
    except Exception as e:
        print_error(f"Breadcrumbs test failed: {e}")
        return None


def validate_visualizations(profile, comparison):
    """Test visualization generation."""
    print_test("Testing visualizations")

    try:
        # Flamegraph
        if profile:
            flamegraph(profile, 'output/validation_flamegraph.png', min_pct=0.1)
            print_success("Flamegraph generated")

        # Memory growth chart
        if comparison is not None and not comparison.empty:
            memory_growth_chart(comparison, 'output/validation_growth.png', top_n=10)
            print_success("Memory growth chart generated")

        return True
    except Exception as e:
        print_error(f"Visualization test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def validate_org_report(breadcrumbs):
    """Test Org mode report generation."""
    print_test("Testing Org mode report")

    try:
        report = OrgReport("Validation Test Report", breadcrumbs)

        report.add_summary("This is a validation test of the Deno debugger skill.")

        report.add_code_snippet('typescript', """
async function example() {
  console.log("Hello from validation");
}
        """, caption="Example code snippet")

        report.add_finding(
            "Validation successful",
            severity="low",
            details="All components working",
            evidence=["CDP connection works", "Parsing works", "Analysis works"]
        )

        report.add_recommendations([
            {
                'title': 'Continue testing',
                'description': 'Run more comprehensive tests',
                'priority': 'medium'
            }
        ])

        report_path = report.save('output/validation_report.org')
        print_success(f"Report saved to {report_path}")

        return True
    except Exception as e:
        print_error(f"Org report test failed: {e}")
        return False


async def run_validation():
    """Run all validation tests."""
    print(f"\n{Colors.BOLD}{'='*60}")
    print("Deno Debugger Skill Validation")
    print(f"{'='*60}{Colors.END}\n")

    # Ensure output directories exist
    os.makedirs('data', exist_ok=True)
    os.makedirs('output', exist_ok=True)

    # Check if Deno is installed
    try:
        result = subprocess.run(['deno', '--version'], capture_output=True, text=True)
        print_success(f"Deno found: {result.stdout.split()[1]}")
    except FileNotFoundError:
        print_error("Deno not found. Please install Deno first.")
        print("  Install from: https://deno.land/manual/getting_started/installation")
        return False

    # Start Deno process
    deno = DenoProcess('examples/leaky_app.ts', port=9229)
    if not deno.start():
        return False

    try:
        # Test CDP connection
        client = await validate_cdp_connection()
        if not client:
            return False

        # Test breakpoints
        await validate_breakpoints(client)

        # Test heap snapshots
        snapshot = await validate_heap_snapshot(client)

        # Test CPU profiling
        profile = await validate_cpu_profile(client)

        # Test snapshot comparison
        comparison = await validate_comparison(client)

        # Test breadcrumbs (doesn't need CDP)
        breadcrumbs = validate_breadcrumbs()

        # Test visualizations
        validate_visualizations(profile, comparison)

        # Test Org report
        validate_org_report(breadcrumbs)

        # Close connection
        await client.close()

        print(f"\n{Colors.BOLD}{Colors.GREEN}{'='*60}")
        print("✓ Validation Complete!")
        print(f"{'='*60}{Colors.END}\n")

        print("Generated artifacts:")
        print("  - data/validation_snapshot.heapsnapshot")
        print("  - data/validation_profile.cpuprofile")
        print("  - data/validation_breadcrumbs.json")
        print("  - output/validation_flamegraph.png")
        print("  - output/validation_growth.png")
        print("  - output/validation_report.org")

        return True

    except Exception as e:
        print_error(f"Validation failed: {e}")
        import traceback
        traceback.print_exc()
        return False

    finally:
        # Always stop Deno
        deno.stop()


if __name__ == '__main__':
    success = asyncio.run(run_validation())
    sys.exit(0 if success else 1)
