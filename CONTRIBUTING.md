# Contributing to Deno Debugger Skill

Thank you for your interest in improving the Deno Debugger Skill! This document provides guidance on how to extend and enhance the skill.

## 🎯 Philosophy

This skill is designed around these principles:

1. **Pre-written Infrastructure**: Ship robust tools that Claude uses as building blocks
2. **Minimal Custom Code**: Claude writes investigation-specific code, not protocol handlers
3. **Breadcrumb Everything**: Track all investigation steps for reproducibility
4. **Org Mode Reports**: Professional, executable documentation
5. **Conversational**: Enable back-and-forth between user and Claude

## 🛠️ How to Extend

### Adding New Analysis Functions

**Example: Add leak detection for a specific object type**

Edit `scripts/heap_analyzer.py`:

```python
def detect_event_listener_leaks(snapshot: HeapSnapshot) -> pd.DataFrame:
    """
    Detect leaked event listeners.

    Returns:
        DataFrame of potentially leaked listeners
    """
    listeners = snapshot.get_nodes_by_name('EventListener')

    # Your analysis logic here
    data = []
    for listener in listeners:
        # Analyze retention, etc.
        data.append({...})

    return pd.DataFrame(data)
```

Then update `SKILL.md` to tell Claude about this function:

```markdown
### Detecting Event Listener Leaks

```python
from scripts.heap_analyzer import detect_event_listener_leaks

leaks = detect_event_listener_leaks(snapshot)
print(leaks)
```

### Adding New Debugging Patterns

Edit `SKILL.md` and add a new section:

```markdown
### WebSocket Connection Leak

1. **Capture connections**: Set breakpoint at WebSocket creation
2. **Track lifecycle**: Monitor open/close events via CDP
3. **Compare snapshots**: Look for growing WebSocket objects
4. **Check event listeners**: Verify cleanup on close
5. **Find retention**: Use retaining paths to see why connections stay alive
```

### Adding New Breadcrumb Types

Edit `scripts/breadcrumbs.py`:

```python
class BreadcrumbType(Enum):
    # ... existing types ...
    EXPERIMENT = "experiment"  # New type!

# Then add a method:
def add_experiment(
    self,
    experiment_name: str,
    description: str,
    results: Optional[Dict[str, Any]] = None
):
    """Record an experimental investigation approach."""
    details = {'experiment_name': experiment_name}
    if results:
        details['results'] = results
    return self._add_breadcrumb(BreadcrumbType.EXPERIMENT, description, details)
```

### Adding CDP Commands

Edit `scripts/cdp_client.py`:

```python
# Add to CDPClient class:

async def get_event_listeners(self, object_id: str) -> List[Dict]:
    """
    Get event listeners attached to an object.

    Args:
        object_id: Remote object ID

    Returns:
        List of event listener descriptors
    """
    result = await self.send_command('DOMDebugger.getEventListeners', {
        'objectId': object_id
    })
    return result.get('listeners', [])
```

## 📝 Documentation Standards

When adding features:

1. **Docstrings**: Every function needs clear docstring
2. **Type Hints**: Use Python type hints
3. **Examples**: Add example usage in `__main__` or docstring
4. **SKILL.md**: Update to tell Claude about new capabilities
5. **README**: Update if it's a major feature

## 🧪 Testing

### Testing New Analysis Functions

Create test data:

```python
# test_heap_analyzer.py
from scripts.heap_analyzer import your_new_function

# Use example snapshot
snapshot = load_snapshot('examples/test_snapshot.heapsnapshot')
result = your_new_function(snapshot)

assert not result.empty
assert 'expected_column' in result.columns
```

### Testing CDP Commands

Test against real Deno:

```bash
# Terminal 1: Start test app
deno run --inspect examples/leaky_app.ts

# Terminal 2: Test your code
python -c "
from scripts.cdp_client import CDPClientSync
client = CDPClientSync('127.0.0.1', 9229)
client.enable_debugger()

# Test your new command
result = client.your_new_command()
print(result)
"
```

## 🎨 Code Style

- Follow PEP 8 for Python
- Use clear, descriptive variable names
- Prefer explicit over implicit
- Comment complex algorithms
- Keep functions focused (single responsibility)

## 📦 Adding Dependencies

If you need a new Python library:

1. Add to `requirements.txt`
2. Document why it's needed
3. Use established, well-maintained libraries
4. Check license compatibility (prefer MIT/BSD/Apache)

## 🐛 Example: Adding WebSocket Debugging

Here's a complete example of adding a new feature:

### 1. Add Analysis Function

`scripts/websocket_analyzer.py`:

```python
"""WebSocket connection analysis."""

def find_open_websockets(snapshot: HeapSnapshot) -> pd.DataFrame:
    """Find all open WebSocket connections in heap."""
    ws_nodes = [n for n in snapshot.nodes if 'WebSocket' in n.name]
    # ... implementation ...
    return pd.DataFrame(data)
```

### 2. Update SKILL.md

```markdown
## WebSocket Connection Analysis

Check for WebSocket leaks:

```python
from scripts.websocket_analyzer import find_open_websockets

open_ws = find_open_websockets(snapshot)
print(f"Found {len(open_ws)} open WebSocket connections")
```
```

### 3. Add to Requirements (if needed)

```
# requirements.txt
websocket-client>=1.0.0  # For WebSocket inspection
```

### 4. Create Example

`examples/websocket_leak.org` - showing a real investigation

### 5. Update README

Add to features list:
- WebSocket connection leak detection

## 🤝 Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/websocket-analysis`
3. Make your changes
4. Test thoroughly
5. Update documentation
6. Commit with clear messages
7. Submit PR with description of changes

## 💡 Ideas for Contributions

Here are some ideas for enhancements:

### Analysis Functions
- Event listener leak detection
- Closure analysis (find captured variables)
- Promise leak detection
- Timer/interval leak detection
- DOM node retention analysis (for Deno with DOM)

### Visualizations
- Memory allocation timeline
- Async operation waterfall
- Call graph visualization
- Interactive flamegraphs (HTML)

### CDP Features
- Network inspection
- Console message capture
- Exception handling breakpoints
- Source map support improvements

### Reporting
- HTML report output (in addition to Org)
- Markdown output
- PDF generation
- Interactive dashboards

### Debugging Patterns
- Database connection leaks
- File handle leaks
- Worker thread issues
- Module loading performance

### Tooling
- CLI wrapper script
- VS Code extension integration
- Automated regression testing
- Performance benchmarking

## 📚 Resources

- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [V8 Heap Snapshot Format](https://github.com/v8/v8/wiki/Heap-Snapshot-Format)
- [Deno Runtime API](https://deno.land/api)
- [Org Mode Manual](https://orgmode.org/manual/)

## 🙏 Thank You!

Every contribution helps make debugging easier for everyone. Whether it's:
- A bug fix
- New analysis function
- Documentation improvement
- Example investigation
- Bug report

All contributions are valuable! 🎉
