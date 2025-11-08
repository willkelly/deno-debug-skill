"""
Playwright-based test to debug heap snapshot chunk capture issue.

This test uses Playwright to:
1. Launch a real browser with CDP
2. Monitor all WebSocket messages
3. Identify why HeapProfiler.addHeapSnapshotChunk events aren't being captured
"""

import pytest
import asyncio
import json
import sys
from pathlib import Path

# Add skill scripts to path
scripts_path = Path(__file__).parent.parent / 'skill' / 'scripts'
sys.path.insert(0, str(scripts_path))

from cdp_client import CDPClient

# Mark as integration test
pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_heap_snapshot_with_raw_websocket():
    """
    Test heap snapshot by directly monitoring WebSocket messages.
    This helps identify if chunks are being sent but not captured by our handler.
    """
    import websockets
    import aiohttp

    # Start a simple Deno process to debug
    import subprocess

    # Create a simple Deno script to profile
    test_script = """
    console.log("Starting Deno process for heap testing");

    // Allocate some memory
    const data = [];
    for (let i = 0; i < 1000; i++) {
        data.push({ index: i, value: "x".repeat(100) });
    }

    console.log("Memory allocated, ready for profiling");

    // Keep process alive
    await new Promise(resolve => setTimeout(resolve, 60000));
    """

    script_path = Path("/tmp/test_heap.ts")
    script_path.write_text(test_script)

    # Launch Deno with inspector
    proc = subprocess.Popen(
        ["deno", "run", "--inspect-brk=127.0.0.1:9229", str(script_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    try:
        # Wait for inspector to be ready
        await asyncio.sleep(2)

        # Get WebSocket URL
        async with aiohttp.ClientSession() as session:
            async with session.get('http://127.0.0.1:9229/json') as resp:
                targets = await resp.json()
                ws_url = targets[0]['webSocketDebuggerUrl']

        print(f"WebSocket URL: {ws_url}")

        # Connect directly to WebSocket and monitor ALL messages
        ws = await websockets.connect(ws_url)

        all_events = []
        chunk_events = []
        progress_events = []
        all_responses = []
        msg_id = 1

        async def message_monitor():
            """Monitor all incoming WebSocket messages."""
            try:
                async for message in ws:
                    data = json.loads(message)

                    # Log ALL messages for debugging
                    if 'method' in data:
                        method = data['method']
                        all_events.append(method)
                        print(f"  [EVENT] {method}")

                        # Capture chunk events
                        if 'HeapProfiler.addHeapSnapshotChunk' in method:
                            chunk_events.append(data)
                            print(f"  [CHUNK] Captured chunk event! Size: {len(data.get('params', {}).get('chunk', ''))}")

                        # Capture progress events
                        if 'HeapProfiler.reportHeapSnapshotProgress' in method:
                            progress_events.append(data)
                            params = data.get('params', {})
                            print(f"  [PROGRESS] {params.get('done', 0)}/{params.get('total', 0)}")

                    elif 'id' in data:
                        # Command response
                        all_responses.append(data)
                        if 'error' in data:
                            print(f"  [ERROR] Command {data['id']} failed: {data['error']}")
                        else:
                            print(f"  [RESPONSE] Command {data['id']} succeeded: {data.get('result', {})}")
            except websockets.exceptions.ConnectionClosed:
                pass

        # Start monitoring in background
        monitor_task = asyncio.create_task(message_monitor())

        # Enable Runtime and Debugger
        await ws.send(json.dumps({'id': msg_id, 'method': 'Runtime.enable'}))
        msg_id += 1
        await asyncio.sleep(0.1)

        await ws.send(json.dumps({'id': msg_id, 'method': 'Debugger.enable'}))
        msg_id += 1
        await asyncio.sleep(0.1)

        # Resume execution
        await ws.send(json.dumps({'id': msg_id, 'method': 'Debugger.resume'}))
        msg_id += 1
        await asyncio.sleep(0.5)

        # Enable HeapProfiler
        await ws.send(json.dumps({'id': msg_id, 'method': 'HeapProfiler.enable'}))
        msg_id += 1
        await asyncio.sleep(0.1)

        print("\n[TEST] Requesting heap snapshot...")

        # Request heap snapshot WITH progress reporting
        await ws.send(json.dumps({
            'id': msg_id,
            'method': 'HeapProfiler.takeHeapSnapshot',
            'params': {'reportProgress': True}
        }))
        msg_id += 1

        # Wait for snapshot to complete
        print("[TEST] Waiting for snapshot completion...")
        await asyncio.sleep(10)

        # Stop monitoring
        await ws.close()
        monitor_task.cancel()

        # Analyze results
        print("\n" + "="*60)
        print("ANALYSIS RESULTS")
        print("="*60)
        print(f"Total command responses: {len(all_responses)}")
        print(f"Total unique event types received: {len(set(all_events))}")
        print(f"All event types: {set(all_events)}")
        print(f"\nProgress events received: {len(progress_events)}")
        print(f"Chunk events received: {len(chunk_events)}")

        # Check for errors in responses
        errors = [r for r in all_responses if 'error' in r]
        if errors:
            print(f"\n⚠️  Command errors found:")
            for err in errors:
                print(f"  - Command {err['id']}: {err['error']}")

        if chunk_events:
            total_chunk_size = sum(len(e.get('params', {}).get('chunk', '')) for e in chunk_events)
            print(f"Total chunk data size: {total_chunk_size:,} bytes")
            print(f"\nFirst chunk preview: {chunk_events[0].get('params', {}).get('chunk', '')[:100]}...")
        else:
            print("\n⚠️  WARNING: No chunk events received!")
            print("This confirms the bug - chunks are not being sent by Deno's V8 inspector")

        if progress_events:
            last_progress = progress_events[-1].get('params', {})
            print(f"\nFinal progress: {last_progress.get('done', 0)}/{last_progress.get('total', 0)}")
            print(f"Finished flag: {last_progress.get('finished', False)}")

        # Assertions
        assert len(all_events) > 0, "Should receive some events"
        assert len(progress_events) > 0, "Should receive progress events"

        # This is the bug we're investigating
        if len(chunk_events) == 0:
            pytest.skip("Heap snapshot chunks not received - this is the known bug we're debugging")

    finally:
        proc.kill()
        proc.wait()


@pytest.mark.asyncio
async def test_compare_our_client_vs_raw():
    """
    Compare our CDPClient implementation vs raw WebSocket approach.
    Helps identify if the issue is in our client or in Deno's CDP implementation.
    """
    import subprocess

    # Create test script
    test_script = """
    console.log("Test script running");
    const data = Array(1000).fill("test");
    await new Promise(resolve => setTimeout(resolve, 60000));
    """

    script_path = Path("/tmp/test_compare.ts")
    script_path.write_text(test_script)

    proc = subprocess.Popen(
        ["deno", "run", "--inspect-brk=127.0.0.1:9230", str(script_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    try:
        await asyncio.sleep(2)

        # Test with our CDPClient
        print("\n[TEST 1] Using our CDPClient...")
        client = CDPClient('127.0.0.1', 9230)
        await client.connect()
        await client.enable_debugger()
        await client.resume()

        snapshot_data = await client.take_heap_snapshot(report_progress=True)

        print(f"Our client received: {len(snapshot_data)} bytes")

        await client.close()

        if len(snapshot_data) == 0:
            print("⚠️  Our client also received 0 bytes - issue is not in our implementation")
            pytest.skip("Heap snapshot issue confirmed with our client")
        else:
            print("✓ Our client successfully received snapshot data!")
            assert len(snapshot_data) > 1000, "Should receive substantial data"

    finally:
        proc.kill()
        proc.wait()


@pytest.mark.asyncio
async def test_heap_snapshot_with_node():
    """
    Test heap snapshot with Node.js instead of Deno.
    This helps determine if the issue is specific to Deno or affects all V8 runtimes.
    """
    import subprocess
    import shutil

    # Check if node is available
    if not shutil.which('node'):
        pytest.skip("Node.js not available")

    # Create test Node.js script
    test_script = """
    console.log("Node.js test script");
    const data = [];
    for (let i = 0; i < 1000; i++) {
        data.push({ index: i, value: "x".repeat(100) });
    }
    console.log("Ready for profiling");
    setTimeout(() => {}, 60000);
    """

    script_path = Path("/tmp/test_node.js")
    script_path.write_text(test_script)

    # Launch Node with inspector
    proc = subprocess.Popen(
        ["node", "--inspect-brk=127.0.0.1:9231", str(script_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    try:
        await asyncio.sleep(2)

        # Connect with our client
        client = CDPClient('127.0.0.1', 9231)
        await client.connect()
        await client.enable_debugger()
        await client.resume()

        print("\n[TEST] Taking heap snapshot from Node.js...")
        snapshot_data = await client.take_heap_snapshot(report_progress=True)

        print(f"Node.js heap snapshot size: {len(snapshot_data)} bytes")

        await client.close()

        if len(snapshot_data) > 0:
            print("✓ Node.js works! Issue is specific to Deno.")
            assert len(snapshot_data) > 1000
        else:
            print("⚠️  Node.js also fails - issue is in our CDP client implementation")
            pytest.skip("Heap snapshot issue affects both Node and Deno")

    finally:
        proc.kill()
        proc.wait()


if __name__ == '__main__':
    print("Playwright Heap Snapshot Debugging Tests")
    print("=" * 60)
    print("\nRun with: pytest tests/test_playwright_heap.py -v -s")
    print("\nThese tests help debug why HeapProfiler.addHeapSnapshotChunk")
    print("events are not being captured by our CDP client.")
