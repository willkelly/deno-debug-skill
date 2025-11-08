"""
Pytest configuration and shared fixtures.
"""

import sys
from pathlib import Path

import pytest

# Add scripts to path (from deno-debugger directory)
scripts_path = Path(__file__).parent.parent / "deno-debugger" / "scripts"
sys.path.insert(0, str(scripts_path))


@pytest.fixture
def sample_heap_data():
    """Minimal valid heap snapshot data for testing."""
    return {
        "snapshot": {
            "meta": {
                "node_fields": [
                    "type",
                    "name",
                    "id",
                    "self_size",
                    "edge_count",
                    "trace_node_id",
                ],
                "node_types": [
                    [
                        "hidden",
                        "array",
                        "string",
                        "object",
                        "code",
                        "closure",
                        "regexp",
                        "number",
                        "native",
                        "synthetic",
                    ],
                    [],
                ],
                "edge_fields": ["type", "name_or_index", "to_node"],
                "edge_types": [
                    [
                        "context",
                        "element",
                        "property",
                        "internal",
                        "hidden",
                        "shortcut",
                        "weak",
                    ],
                    [],
                ],
            }
        },
        "nodes": [
            # Node: type=9(synthetic), name=0, id=1, self_size=0, edge_count=1, trace_node_id=0
            9,
            0,
            1,
            0,
            1,
            0,
            # Node: type=3(object), name=1, id=2, self_size=100, edge_count=0, trace_node_id=0
            3,
            1,
            2,
            100,
            0,
            0,
        ],
        "edges": [
            # Edge: type=2(property), name_or_index=2, to_node=6
            2,
            2,
            6,
        ],
        "strings": ["(GC roots)", "Object", "myProperty"],
    }


@pytest.fixture
def sample_cpu_profile():
    """Minimal valid CPU profile data for testing."""
    return {
        "startTime": 0,
        "endTime": 1000000,  # 1 second in microseconds
        "nodes": [
            {
                "id": 1,
                "callFrame": {
                    "functionName": "(root)",
                    "scriptId": "0",
                    "url": "",
                    "lineNumber": -1,
                    "columnNumber": -1,
                },
                "hitCount": 5,
                "children": [2, 3],
            },
            {
                "id": 2,
                "callFrame": {
                    "functionName": "slowFunction",
                    "scriptId": "1",
                    "url": "file:///app.ts",
                    "lineNumber": 10,
                    "columnNumber": 0,
                },
                "hitCount": 50,
                "children": [],
            },
            {
                "id": 3,
                "callFrame": {
                    "functionName": "fastFunction",
                    "scriptId": "1",
                    "url": "file:///app.ts",
                    "lineNumber": 20,
                    "columnNumber": 0,
                },
                "hitCount": 10,
                "children": [],
            },
        ],
        "samples": [1, 2, 2, 2, 2, 2, 3, 3, 1, 1],  # Total 10 samples
        "timeDeltas": [100] * 10,
    }
