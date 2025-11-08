"""
Tests for heap snapshot parsing and analysis.
"""

import pandas as pd
from heap_analyzer import HeapSnapshot, compare_snapshots, find_largest_objects


def test_heap_snapshot_parsing(sample_heap_data):
    """Test basic heap snapshot parsing."""
    snapshot = HeapSnapshot(sample_heap_data)

    assert len(snapshot.nodes) == 2
    assert len(snapshot.edges) == 1
    assert len(snapshot.strings) == 3


def test_heap_snapshot_node_types(sample_heap_data):
    """Test that node types are parsed correctly."""
    snapshot = HeapSnapshot(sample_heap_data)

    # First node should be synthetic (type 9)
    assert snapshot.nodes[0].node_type == "synthetic"
    assert snapshot.nodes[0].name == "(GC roots)"

    # Second node should be object (type 3)
    assert snapshot.nodes[1].node_type == "object"
    assert snapshot.nodes[1].name == "Object"


def test_get_nodes_by_type(sample_heap_data):
    """Test filtering nodes by type."""
    snapshot = HeapSnapshot(sample_heap_data)

    objects = snapshot.get_nodes_by_type("object")
    assert len(objects) == 1
    assert objects[0].name == "Object"

    synthetics = snapshot.get_nodes_by_type("synthetic")
    assert len(synthetics) == 1


def test_get_nodes_by_name(sample_heap_data):
    """Test filtering nodes by name."""
    snapshot = HeapSnapshot(sample_heap_data)

    objects = snapshot.get_nodes_by_name("Object")
    assert len(objects) == 1
    assert objects[0].self_size == 100


def test_node_size_summary(sample_heap_data):
    """Test node size summary generation."""
    snapshot = HeapSnapshot(sample_heap_data)

    summary = snapshot.get_node_size_summary()

    assert isinstance(summary, pd.DataFrame)
    assert "node_type" in summary.columns
    assert "count" in summary.columns
    assert "total_size" in summary.columns
    assert "avg_size" in summary.columns

    # Should have 2 types
    assert len(summary) == 2


def test_compare_snapshots_growth(sample_heap_data):
    """Test snapshot comparison detects growth."""
    # Create before snapshot
    before = HeapSnapshot(sample_heap_data)

    # Create after snapshot with more objects
    after_data = sample_heap_data.copy()
    after_data["nodes"] = sample_heap_data["nodes"] + [
        # Add another Object with 200 bytes
        3,
        1,
        3,
        200,
        0,
        0,
    ]
    after = HeapSnapshot(after_data)

    # Compare
    comparison = compare_snapshots(before, after)

    assert isinstance(comparison, pd.DataFrame)
    assert not comparison.empty

    # Should show Object type grew
    object_row = comparison[comparison["name"] == "Object"]
    assert len(object_row) == 1
    assert object_row.iloc[0]["count_delta"] == 1
    assert object_row.iloc[0]["size_delta"] == 200


def test_compare_snapshots_no_growth(sample_heap_data):
    """Test snapshot comparison when nothing grows."""
    before = HeapSnapshot(sample_heap_data)
    after = HeapSnapshot(sample_heap_data)

    comparison = compare_snapshots(before, after)

    # Should be empty (no growth)
    assert isinstance(comparison, pd.DataFrame)
    assert comparison.empty or comparison["size_delta"].sum() == 0


def test_find_largest_objects(sample_heap_data):
    """Test finding largest objects."""
    snapshot = HeapSnapshot(sample_heap_data)

    largest = find_largest_objects(snapshot, limit=10)

    assert isinstance(largest, pd.DataFrame)
    assert not largest.empty

    # Should have Object with 100 bytes at top
    assert largest.iloc[0]["name"] == "Object"
    assert largest.iloc[0]["size_bytes"] == 100


def test_node_indexing(sample_heap_data):
    """Test that nodes are properly indexed by ID."""
    snapshot = HeapSnapshot(sample_heap_data)

    # Should be able to look up nodes by ID
    assert 1 in snapshot.node_by_id
    assert 2 in snapshot.node_by_id

    node1 = snapshot.node_by_id[1]
    assert node1.name == "(GC roots)"

    node2 = snapshot.node_by_id[2]
    assert node2.name == "Object"


def test_edge_parsing(sample_heap_data):
    """Test edge parsing."""
    snapshot = HeapSnapshot(sample_heap_data)

    assert len(snapshot.edges) == 1

    edge = snapshot.edges[0]
    assert edge.edge_type == "property"
    assert edge.name_or_index == "myProperty"
