"""
Chrome DevTools Protocol (CDP) client for connecting to Deno's V8 Inspector.

Provides high-level interface for debugging operations:
- Connection management
- Breakpoint control
- Execution flow (resume, pause, step)
- Expression evaluation
- Call frame and scope inspection
- Heap snapshot capture
- CPU profiling
"""

import asyncio
import json
import websockets
from typing import Any, Dict, List, Optional, Callable
from dataclasses import dataclass


@dataclass
class Breakpoint:
    """Represents a breakpoint in source code."""
    breakpoint_id: str
    location: Dict[str, Any]


class CDPClient:
    """
    Chrome DevTools Protocol client for Deno debugging.

    Usage:
        client = CDPClient('127.0.0.1', 9229)
        await client.connect()
        await client.enable_debugger()
        bp = await client.set_breakpoint('file:///path/to/file.ts', 42)
        await client.resume()
    """

    def __init__(self, host: str = '127.0.0.1', port: int = 9229):
        self.host = host
        self.port = port
        self.ws = None
        self.next_id = 1
        self.pending_requests: Dict[int, asyncio.Future] = {}
        self.event_handlers: Dict[str, List[Callable]] = {}
        self.paused = False
        self.call_frames = []
        self.runtime_info = None  # Will store Deno vs Node detection

    async def connect(self):
        """Establish WebSocket connection to Deno/Node inspector."""
        # First, get the WebSocket debugger URL
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get(f'http://{self.host}:{self.port}/json') as resp:
                targets = await resp.json()
                if not targets:
                    raise Exception("No debugger targets found")

                target = targets[0]
                ws_url = target['webSocketDebuggerUrl']

                # Detect runtime from target info
                # Deno includes "Deno" in description, Node includes "node"
                description = target.get('description', '').lower()
                title = target.get('title', '').lower()
                self.runtime_info = {
                    'is_deno': 'deno' in description or 'deno' in title,
                    'is_node': 'node' in description or 'node' in title,
                    'description': target.get('description', ''),
                    'title': target.get('title', '')
                }

        # Connect to WebSocket
        self.ws = await websockets.connect(ws_url)

        # Start message handler
        asyncio.create_task(self._message_handler())

        return self

    async def _message_handler(self):
        """Handle incoming messages from CDP."""
        try:
            async for message in self.ws:
                data = json.loads(message)

                # Handle responses to our requests
                if 'id' in data:
                    msg_id = data['id']
                    if msg_id in self.pending_requests:
                        future = self.pending_requests.pop(msg_id)
                        if 'error' in data:
                            future.set_exception(Exception(data['error']['message']))
                        else:
                            future.set_result(data.get('result', {}))

                # Handle events
                elif 'method' in data:
                    method = data['method']
                    params = data.get('params', {})

                    # Debug: log all events (comment out for production)
                    if 'HeapProfiler' in method:
                        print(f"    [DEBUG] Event: {method}")

                    # Built-in event handling
                    if method == 'Debugger.paused':
                        self.paused = True
                        self.call_frames = params.get('callFrames', [])
                    elif method == 'Debugger.resumed':
                        self.paused = False
                        self.call_frames = []

                    # Notify registered handlers
                    if method in self.event_handlers:
                        for handler in self.event_handlers[method]:
                            asyncio.create_task(handler(params))

        except websockets.exceptions.ConnectionClosed:
            pass

    async def send_command(self, method: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Send a CDP command and wait for response.

        Args:
            method: CDP method name (e.g., 'Debugger.resume')
            params: Optional parameters dict

        Returns:
            Response result dict
        """
        msg_id = self.next_id
        self.next_id += 1

        message = {
            'id': msg_id,
            'method': method,
        }
        if params:
            message['params'] = params

        # Create future for response
        future = asyncio.Future()
        self.pending_requests[msg_id] = future

        # Send message
        await self.ws.send(json.dumps(message))

        # Wait for response
        return await future

    def on_event(self, event_name: str, handler: Callable):
        """
        Register an event handler.

        Args:
            event_name: CDP event name (e.g., 'Debugger.paused')
            handler: Async function to call with event params
        """
        if event_name not in self.event_handlers:
            self.event_handlers[event_name] = []
        self.event_handlers[event_name].append(handler)

    # Debugger Domain

    async def enable_debugger(self):
        """Enable the Debugger domain."""
        await self.send_command('Debugger.enable')
        # Also enable Runtime for evaluation
        await self.send_command('Runtime.enable')

    async def disable_debugger(self):
        """Disable the Debugger domain."""
        await self.send_command('Debugger.disable')

    async def set_breakpoint(
        self,
        url: str,
        line: int,
        column: int = 0,
        condition: Optional[str] = None
    ) -> Breakpoint:
        """
        Set a breakpoint in source code.

        Args:
            url: File URL (e.g., 'file:///path/to/file.ts')
            line: Line number (0-indexed)
            column: Column number (0-indexed)
            condition: Optional condition expression

        Returns:
            Breakpoint object
        """
        params = {
            'location': {
                'scriptUrl': url,
                'lineNumber': line,
                'columnNumber': column
            }
        }
        if condition:
            params['condition'] = condition

        result = await self.send_command('Debugger.setBreakpoint', params)

        return Breakpoint(
            breakpoint_id=result['breakpointId'],
            location=result['actualLocation']
        )

    async def set_breakpoint_by_url(
        self,
        url_regex: str,
        line: int,
        column: int = 0,
        condition: Optional[str] = None
    ) -> str:
        """
        Set breakpoint by URL pattern (useful when script hasn't loaded yet).

        Returns:
            Breakpoint ID
        """
        params = {
            'urlRegex': url_regex,
            'lineNumber': line,
            'columnNumber': column
        }
        if condition:
            params['condition'] = condition

        result = await self.send_command('Debugger.setBreakpointByUrl', params)
        return result['breakpointId']

    async def remove_breakpoint(self, breakpoint_id: str):
        """Remove a breakpoint."""
        await self.send_command('Debugger.removeBreakpoint', {
            'breakpointId': breakpoint_id
        })

    async def pause(self):
        """Pause execution."""
        await self.send_command('Debugger.pause')

    async def resume(self):
        """Resume execution."""
        await self.send_command('Debugger.resume')

    async def step_over(self):
        """Step over to next statement."""
        await self.send_command('Debugger.stepOver')

    async def step_into(self):
        """Step into function call."""
        await self.send_command('Debugger.stepInto')

    async def step_out(self):
        """Step out of current function."""
        await self.send_command('Debugger.stepOut')

    async def set_pause_on_exceptions(self, state: str = 'none'):
        """
        Set pause behavior for exceptions.

        Args:
            state: 'none', 'uncaught', or 'all'
        """
        await self.send_command('Debugger.setPauseOnExceptions', {
            'state': state
        })

    async def get_call_frames(self) -> List[Dict[str, Any]]:
        """
        Get current call frames (when paused).

        Returns:
            List of call frame objects
        """
        return self.call_frames

    async def evaluate(
        self,
        expression: str,
        call_frame_id: Optional[str] = None,
        context_id: Optional[int] = None
    ) -> Any:
        """
        Evaluate an expression.

        Args:
            expression: JavaScript/TypeScript expression
            call_frame_id: Evaluate in context of this call frame (when paused)
            context_id: Execution context ID (for global evaluation)

        Returns:
            Evaluation result
        """
        if call_frame_id:
            # Evaluate on call frame (when paused)
            result = await self.send_command('Debugger.evaluateOnCallFrame', {
                'callFrameId': call_frame_id,
                'expression': expression
            })
        else:
            # Evaluate in runtime context
            params = {'expression': expression}
            if context_id:
                params['contextId'] = context_id
            result = await self.send_command('Runtime.evaluate', params)

        if result.get('exceptionDetails'):
            raise Exception(f"Evaluation error: {result['exceptionDetails']}")

        return result['result']

    async def get_properties(self, object_id: str) -> List[Dict[str, Any]]:
        """
        Get properties of an object.

        Args:
            object_id: Remote object ID

        Returns:
            List of property descriptors
        """
        result = await self.send_command('Runtime.getProperties', {
            'objectId': object_id,
            'ownProperties': True
        })
        return result.get('result', [])

    async def get_scope_variables(self, call_frame_id: str) -> Dict[str, Any]:
        """
        Get all variables in scope for a call frame.

        Args:
            call_frame_id: Call frame ID

        Returns:
            Dict mapping variable names to values
        """
        frame = None
        for f in self.call_frames:
            if f['callFrameId'] == call_frame_id:
                frame = f
                break

        if not frame:
            return {}

        variables = {}

        # Get variables from each scope chain
        for scope in frame.get('scopeChain', []):
            scope_obj = scope['object']
            if 'objectId' in scope_obj:
                props = await self.get_properties(scope_obj['objectId'])
                for prop in props:
                    if prop.get('name'):
                        variables[prop['name']] = prop.get('value')

        return variables

    # Heap Profiler Domain

    async def enable_heap_profiler(self):
        """Enable heap profiler."""
        await self.send_command('HeapProfiler.enable')

    async def take_heap_snapshot(self, report_progress: bool = False) -> str:
        """
        Take a heap snapshot.

        ⚠️  KNOWN ISSUE: Deno's V8 inspector does NOT send heap snapshot chunks.
        This method will return empty string when connected to Deno.

        Workaround: Use Chrome DevTools UI to manually capture heap snapshots
        and export them as .heapsnapshot files for analysis.

        See docs/DENO_HEAP_SNAPSHOT_BUG.md for details.

        Returns:
            Heap snapshot as JSON string (can be large!)
            Returns empty string if connected to Deno due to known bug.
        """
        # Warn if connected to Deno
        if self.runtime_info and self.runtime_info.get('is_deno'):
            import warnings
            warnings.warn(
                "\n"
                "⚠️  HEAP SNAPSHOT LIMITATION: Deno's V8 inspector does not send heap snapshot chunks.\n"
                "   This is a known Deno bug. takeHeapSnapshot will return empty data.\n"
                "\n"
                "   Workaround: Use Chrome DevTools UI to manually capture heap snapshots:\n"
                "   1. Open chrome://inspect in Chrome\n"
                "   2. Click 'inspect' on your Deno process\n"
                "   3. Go to Memory tab\n"
                "   4. Click 'Take snapshot'\n"
                "   5. Right-click snapshot and 'Save as...'\n"
                "   6. Load the .heapsnapshot file with our HeapSnapshot class\n"
                "\n"
                "   See docs/DENO_HEAP_SNAPSHOT_BUG.md for full details.\n",
                UserWarning,
                stacklevel=2
            )

        await self.enable_heap_profiler()

        chunks = []
        done_event = asyncio.Event()
        progress_done = asyncio.Event()

        async def chunk_handler(params):
            if 'chunk' in params:
                chunks.append(params['chunk'])
                # Debug: print chunk progress
                if len(chunks) % 100 == 0:
                    print(f"    Received {len(chunks)} chunks...")

        async def progress_handler(params):
            # Debug: print progress
            done = params.get('done', 0)
            total = params.get('total', 0)
            print(f"    Progress: {done}/{total}")

            # When finished is True, snapshot is complete
            if params.get('finished'):
                print(f"    Snapshot complete!")
                progress_done.set()

        # Listen for heap snapshot chunks
        self.on_event('HeapProfiler.addHeapSnapshotChunk', chunk_handler)

        # Listen for progress (if reportProgress is True)
        if report_progress:
            self.on_event('HeapProfiler.reportHeapSnapshotProgress', progress_handler)

        # Request snapshot (don't await - command might not return until acknowledged)
        try:
            print(f"    Sending takeHeapSnapshot command...")
            # Send command in background - we'll wait for events instead
            asyncio.create_task(self.send_command('HeapProfiler.takeHeapSnapshot', {
                'reportProgress': report_progress
            }))

            # Wait for progress to indicate completion (if we're tracking progress)
            # Otherwise wait a bit for chunks
            if report_progress:
                print(f"    Waiting for progress completion...")
                await asyncio.wait_for(progress_done.wait(), timeout=30)
            else:
                # Wait for chunks to arrive - increase timeout for large heaps
                print(f"    Waiting for chunks...")
                await asyncio.sleep(5.0)

            print(f"    Got {len(chunks)} total chunks")

        except asyncio.TimeoutError:
            print(f"  Warning: Heap snapshot timed out, got {len(chunks)} chunks")

        finally:
            # Clean up event handlers
            if 'HeapProfiler.addHeapSnapshotChunk' in self.event_handlers:
                if chunk_handler in self.event_handlers['HeapProfiler.addHeapSnapshotChunk']:
                    self.event_handlers['HeapProfiler.addHeapSnapshotChunk'].remove(chunk_handler)
            if report_progress and 'HeapProfiler.reportHeapSnapshotProgress' in self.event_handlers:
                if progress_handler in self.event_handlers['HeapProfiler.reportHeapSnapshotProgress']:
                    self.event_handlers['HeapProfiler.reportHeapSnapshotProgress'].remove(progress_handler)

        return ''.join(chunks)

    # Profiler Domain (CPU profiling)

    async def enable_profiler(self):
        """Enable CPU profiler."""
        await self.send_command('Profiler.enable')

    async def start_profiling(self):
        """Start CPU profiling."""
        await self.enable_profiler()
        await self.send_command('Profiler.start')

    async def stop_profiling(self) -> Dict[str, Any]:
        """
        Stop CPU profiling and return profile.

        Returns:
            CPU profile data
        """
        result = await self.send_command('Profiler.stop')
        return result.get('profile', {})

    async def close(self):
        """Close the connection."""
        if self.ws:
            await self.ws.close()


# Synchronous wrapper for easier use in REPL/scripts
class CDPClientSync:
    """
    Synchronous wrapper around CDPClient for easier interactive use.

    Usage:
        client = CDPClientSync('127.0.0.1', 9229)
        client.enable_debugger()
        bp = client.set_breakpoint('file:///app.ts', 42)
        client.resume()
    """

    def __init__(self, host: str = '127.0.0.1', port: int = 9229):
        self.client = CDPClient(host, port)
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self.client.connect())

    def __getattr__(self, name):
        """Proxy all methods to async client, running them synchronously."""
        attr = getattr(self.client, name)
        if asyncio.iscoroutinefunction(attr):
            def sync_wrapper(*args, **kwargs):
                return self.loop.run_until_complete(attr(*args, **kwargs))
            return sync_wrapper
        return attr

    def close(self):
        """Close connection and event loop."""
        self.loop.run_until_complete(self.client.close())
        self.loop.close()


if __name__ == '__main__':
    # Example usage
    print("CDP Client - Example Usage")
    print("===========================")
    print()
    print("# Connect to Deno (launched with --inspect)")
    print("client = CDPClientSync('127.0.0.1', 9229)")
    print("client.enable_debugger()")
    print()
    print("# Set breakpoint")
    print("bp = client.set_breakpoint('file:///path/to/app.ts', 42)")
    print()
    print("# Resume execution")
    print("client.resume()")
    print()
    print("# When paused, inspect")
    print("frames = client.get_call_frames()")
    print("vars = client.get_scope_variables(frames[0]['callFrameId'])")
    print()
    print("# Evaluate expression")
    print("result = client.evaluate('myVariable', frames[0]['callFrameId'])")
