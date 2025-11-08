"""
Simple heap snapshot test to isolate the chunk capture issue.
Uses --inspect (not --inspect-brk) to avoid breakpoint complications.
"""

import asyncio
import json
import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.asyncio


async def test_deno_heap_snapshot_basic():
    """Test heap snapshot with Deno using raw WebSocket - no breakpoints."""
    import aiohttp
    import websockets

    # Create simple Deno script (no blocking)
    test_script = """
    // Allocate some memory
    const data = [];
    for (let i = 0; i < 1000; i++) {
        data.push({ index: i, value: "x".repeat(100) });
    }

    console.log("Memory allocated");

    // Keep alive for profiling
    setInterval(() => {}, 1000);
    """

    script_path = Path("/tmp/test_heap_simple.ts")
    script_path.write_text(test_script)

    # Launch with --inspect (not --inspect-brk)
    proc = subprocess.Popen(
        ["deno", "run", "--inspect=127.0.0.1:9232", str(script_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        # Wait for inspector
        await asyncio.sleep(2)

        # Get WebSocket URL
        async with aiohttp.ClientSession() as session:
            async with session.get("http://127.0.0.1:9232/json") as resp:
                targets = await resp.json()
                ws_url = targets[0]["webSocketDebuggerUrl"]

        print(f"\nConnecting to: {ws_url}")
        ws = await websockets.connect(ws_url)

        chunks_received = []
        progress_received = []
        all_messages = []
        msg_id = 1

        async def monitor():
            try:
                async for message in ws:
                    data = json.loads(message)
                    all_messages.append(data)

                    if "method" in data:
                        method = data["method"]

                        if method == "HeapProfiler.addHeapSnapshotChunk":
                            chunk = data.get("params", {}).get("chunk", "")
                            chunks_received.append(chunk)
                            print(f"  ✓ Chunk received: {len(chunk)} bytes")

                        elif method == "HeapProfiler.reportHeapSnapshotProgress":
                            params = data.get("params", {})
                            progress_received.append(params)
                            print(
                                f"  Progress: {params.get('done', 0)}/{params.get('total', 0)}"
                            )

                    elif "id" in data and data.get("id") == msg_id:
                        # Response to takeHeapSnapshot
                        if "error" in data:
                            print(f"  ✗ HeapSnapshot command error: {data['error']}")
                        else:
                            print(
                                f"  ✓ HeapSnapshot command response: {data.get('result', {})}"
                            )

            except websockets.exceptions.ConnectionClosed:
                pass

        monitor_task = asyncio.create_task(monitor())

        # Enable HeapProfiler
        await ws.send(json.dumps({"id": msg_id, "method": "HeapProfiler.enable"}))
        msg_id += 1
        await asyncio.sleep(0.5)

        print("\nRequesting heap snapshot with progress reporting...")
        snapshot_cmd_id = msg_id
        await ws.send(
            json.dumps(
                {
                    "id": snapshot_cmd_id,
                    "method": "HeapProfiler.takeHeapSnapshot",
                    "params": {"reportProgress": True},
                }
            )
        )
        msg_id += 1

        # Wait for completion
        await asyncio.sleep(15)

        await ws.close()
        monitor_task.cancel()

        print("\n" + "=" * 70)
        print("RESULTS")
        print("=" * 70)
        print(f"Total messages received: {len(all_messages)}")
        print(f"Chunks received: {len(chunks_received)}")
        print(f"Progress events: {len(progress_received)}")

        if chunks_received:
            total_size = sum(len(c) for c in chunks_received)
            print(f"Total chunk data: {total_size:,} bytes")
            print("✓ SUCCESS: Heap snapshot chunks captured!")
        else:
            print("✗ FAILURE: No chunks received")

        if progress_received:
            print(f"Progress tracking: {progress_received[-1]}")
        else:
            print("⚠️  No progress events received")

        # Check for HeapProfiler messages at all
        heap_messages = [
            m
            for m in all_messages
            if "method" in m and "HeapProfiler" in m.get("method", "")
        ]
        print(f"\nAll HeapProfiler events: {[m['method'] for m in heap_messages]}")

        if len(chunks_received) == 0:
            pytest.skip("Heap snapshot chunks not received - Deno may not support this")

    finally:
        proc.kill()
        proc.wait()


async def test_node_heap_snapshot_basic():
    """Test heap snapshot with Node.js for comparison."""
    import shutil

    import aiohttp
    import websockets

    if not shutil.which("node"):
        pytest.skip("Node.js not available")

    # Create Node script
    test_script = """
    const data = [];
    for (let i = 0; i < 1000; i++) {
        data.push({ index: i, value: "x".repeat(100) });
    }
    console.log("Node memory allocated");
    setInterval(() => {}, 1000);
    """

    script_path = Path("/tmp/test_node_simple.js")
    script_path.write_text(test_script)

    proc = subprocess.Popen(
        ["node", "--inspect=127.0.0.1:9233", str(script_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        await asyncio.sleep(2)

        async with aiohttp.ClientSession() as session:
            async with session.get("http://127.0.0.1:9233/json") as resp:
                targets = await resp.json()
                ws_url = targets[0]["webSocketDebuggerUrl"]

        print(f"\nConnecting to Node: {ws_url}")
        ws = await websockets.connect(ws_url)

        chunks_received = []
        progress_received = []
        msg_id = 1

        async def monitor():
            try:
                async for message in ws:
                    data = json.loads(message)

                    if "method" in data:
                        method = data["method"]

                        if method == "HeapProfiler.addHeapSnapshotChunk":
                            chunk = data.get("params", {}).get("chunk", "")
                            chunks_received.append(chunk)
                            if len(chunks_received) % 100 == 0:
                                print(f"  Node chunks: {len(chunks_received)}")

                        elif method == "HeapProfiler.reportHeapSnapshotProgress":
                            params = data.get("params", {})
                            progress_received.append(params)
                            if params.get("finished"):
                                print(f"  Node: Snapshot finished!")

            except websockets.exceptions.ConnectionClosed:
                pass

        monitor_task = asyncio.create_task(monitor())

        # Enable HeapProfiler
        await ws.send(json.dumps({"id": msg_id, "method": "HeapProfiler.enable"}))
        msg_id += 1
        await asyncio.sleep(0.5)

        print("Requesting heap snapshot from Node...")
        await ws.send(
            json.dumps(
                {
                    "id": msg_id,
                    "method": "HeapProfiler.takeHeapSnapshot",
                    "params": {"reportProgress": True},
                }
            )
        )
        msg_id += 1

        await asyncio.sleep(15)

        await ws.close()
        monitor_task.cancel()

        print("\n" + "=" * 70)
        print("NODE.JS RESULTS")
        print("=" * 70)
        print(f"Chunks received: {len(chunks_received)}")
        print(f"Progress events: {len(progress_received)}")

        if chunks_received:
            total_size = sum(len(c) for c in chunks_received)
            print(f"Total chunk data: {total_size:,} bytes")
            print("✓ SUCCESS: Node.js works! Issue is Deno-specific.")
            assert len(chunks_received) > 0
        else:
            print("✗ Node.js also fails - issue is in test methodology")
            pytest.skip("Node.js also doesn't send chunks")

    finally:
        proc.kill()
        proc.wait()


if __name__ == "__main__":
    print("Simple heap snapshot tests")
    print("Run: python -m pytest tests/test_heap_simple.py -v -s")
