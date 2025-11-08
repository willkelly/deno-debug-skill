"""
Integration tests for CDP client using real Deno instance.

These tests require Deno to be installed. Run with:
    pytest tests/test_integration_cdp.py -v
"""

import pytest
import asyncio
import subprocess
import time
import signal
import sys
from pathlib import Path

# Add scripts to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'skill' / 'scripts'))

from cdp_client import CDPClient

# Skip all tests if Deno not available
try:
    subprocess.run(['deno', '--version'], capture_output=True, check=True)
    DENO_AVAILABLE = True
except (FileNotFoundError, subprocess.CalledProcessError):
    DENO_AVAILABLE = False

pytestmark = pytest.mark.skipif(not DENO_AVAILABLE, reason="Deno not installed")


@pytest.fixture
async def deno_process():
    """Start a Deno process with inspector for testing."""
    # Simple test script
    script = """
    console.log("Test server running");
    Deno.serve({ port: 8123 }, () => new Response("OK"));
    """

    # Start Deno with inspector
    proc = subprocess.Popen(
        ['deno', 'eval', '--inspect=127.0.0.1:9229', '--allow-net', script],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    # Wait for inspector to be ready
    time.sleep(2)

    yield proc

    # Cleanup
    proc.send_signal(signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.mark.asyncio
async def test_cdp_connection(deno_process):
    """Test basic CDP connection to Deno."""
    client = CDPClient('127.0.0.1', 9229)

    await client.connect()
    assert client.ws is not None

    await client.close()


@pytest.mark.asyncio
async def test_enable_debugger(deno_process):
    """Test enabling the debugger domain."""
    client = CDPClient('127.0.0.1', 9229)
    await client.connect()

    await client.enable_debugger()
    # If no exception, it worked

    await client.close()


@pytest.mark.asyncio
async def test_breakpoint_operations(deno_process):
    """Test setting and removing breakpoints."""
    client = CDPClient('127.0.0.1', 9229)
    await client.connect()
    await client.enable_debugger()

    # Set breakpoint by URL pattern
    bp_id = await client.set_breakpoint_by_url(
        url_regex='.*',
        line=1
    )

    assert bp_id is not None
    assert isinstance(bp_id, str)

    # Remove breakpoint
    await client.remove_breakpoint(bp_id)

    await client.close()


@pytest.mark.asyncio
@pytest.mark.timeout(30)
async def test_heap_snapshot_basic(deno_process):
    """Test basic heap snapshot capture (without full parsing)."""
    client = CDPClient('127.0.0.1', 9229)
    await client.connect()

    # Try to capture snapshot
    snapshot_json = await client.take_heap_snapshot(report_progress=False)

    # Should get some data
    assert snapshot_json is not None
    assert len(snapshot_json) > 0, "Snapshot should not be empty"

    # Should be valid JSON
    import json
    data = json.loads(snapshot_json)
    assert 'snapshot' in data or 'nodes' in data

    await client.close()


@pytest.mark.asyncio
@pytest.mark.timeout(30)
async def test_cpu_profiling(deno_process):
    """Test CPU profiling start/stop."""
    client = CDPClient('127.0.0.1', 9229)
    await client.connect()

    await client.start_profiling()

    # Let it profile for a bit
    await asyncio.sleep(0.5)

    profile_data = await client.stop_profiling()

    assert profile_data is not None
    assert 'nodes' in profile_data

    await client.close()


@pytest.mark.asyncio
async def test_evaluate_expression(deno_process):
    """Test evaluating expressions in global context."""
    client = CDPClient('127.0.0.1', 9229)
    await client.connect()
    await client.enable_debugger()

    # Evaluate a simple expression
    result = await client.evaluate('1 + 1')

    assert result is not None
    assert 'value' in result
    assert result['value'] == 2

    await client.close()
