"""
Heap snapshot analysis for memory leak detection.

Provides tools to:
- Capture and parse V8 heap snapshots
- Compare snapshots to find memory growth
- Find retaining paths (why objects are kept alive)
- Detect leak patterns
- Generate pandas DataFrames for analysis
"""

import json
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd


@dataclass
class HeapNode:
    """Represents a node in the heap snapshot."""

    node_id: int
    node_type: str
    name: str
    self_size: int
    edge_count: int
    trace_node_id: int


@dataclass
class HeapEdge:
    """Represents an edge (reference) between heap nodes."""

    edge_type: str
    name_or_index: Any
    to_node: int


class HeapSnapshot:
    """
    Parsed V8 heap snapshot with analysis capabilities.

    V8 heap snapshots use a compact format with parallel arrays.
    This class parses and indexes the snapshot for efficient queries.
    """

    def __init__(self, snapshot_data: Dict[str, Any]):
        self.raw_data = snapshot_data
        self.snapshot = snapshot_data.get("snapshot", {})
        self.nodes = []
        self.edges = []
        self.strings = snapshot_data.get("strings", [])
        self.trace_function_infos = snapshot_data.get("trace_function_infos", [])
        self.trace_tree = snapshot_data.get("trace_tree", [])

        # Parse nodes and edges
        self._parse_nodes()
        self._parse_edges()

        # Build indexes for fast lookup
        self.node_by_id = {node.node_id: node for node in self.nodes}
        self._build_retention_index()

    def _parse_nodes(self):
        """Parse the nodes array into HeapNode objects."""
        meta = self.snapshot.get("meta", {})
        node_fields = meta.get("node_fields", [])
        node_types = meta.get("node_types", [[]])[0]

        # Field indices
        type_idx = node_fields.index("type")
        name_idx = node_fields.index("name")
        id_idx = node_fields.index("id")
        self_size_idx = node_fields.index("self_size")
        edge_count_idx = node_fields.index("edge_count")
        trace_node_id_idx = node_fields.index("trace_node_id")

        node_field_count = len(node_fields)
        nodes_data = self.raw_data.get("nodes", [])

        for i in range(0, len(nodes_data), node_field_count):
            node_data = nodes_data[i : i + node_field_count]

            node = HeapNode(
                node_id=node_data[id_idx],
                node_type=node_types[node_data[type_idx]],
                name=self.strings[node_data[name_idx]],
                self_size=node_data[self_size_idx],
                edge_count=node_data[edge_count_idx],
                trace_node_id=node_data[trace_node_id_idx],
            )
            self.nodes.append(node)

    def _parse_edges(self):
        """Parse the edges array into HeapEdge objects."""
        meta = self.snapshot.get("meta", {})
        edge_fields = meta.get("edge_fields", [])
        edge_types = meta.get("edge_types", [[]])[0]

        # Field indices
        type_idx = edge_fields.index("type")
        name_or_index_idx = edge_fields.index("name_or_index")
        to_node_idx = edge_fields.index("to_node")

        edge_field_count = len(edge_fields)
        edges_data = self.raw_data.get("edges", [])

        for i in range(0, len(edges_data), edge_field_count):
            edge_data = edges_data[i : i + edge_field_count]

            # Name or index depends on edge type
            name_or_index = edge_data[name_or_index_idx]
            edge_type = edge_types[edge_data[type_idx]]

            if edge_type in ["property", "internal"]:
                name_or_index = self.strings[name_or_index]

            edge = HeapEdge(
                edge_type=edge_type,
                name_or_index=name_or_index,
                to_node=edge_data[to_node_idx],
            )
            self.edges.append(edge)

    def _build_retention_index(self):
        """Build index of what references each node (for retaining paths)."""
        self.retained_by = defaultdict(list)

        edge_idx = 0
        for node in self.nodes:
            for _ in range(node.edge_count):
                if edge_idx < len(self.edges):
                    edge = self.edges[edge_idx]
                    # Map target node -> (source node, edge)
                    target_node_idx = edge.to_node // len(
                        self.snapshot.get("meta", {}).get("node_fields", [])
                    )
                    if target_node_idx < len(self.nodes):
                        self.retained_by[self.nodes[target_node_idx].node_id].append(
                            (node.node_id, edge)
                        )
                    edge_idx += 1

    def get_nodes_by_type(self, node_type: str) -> List[HeapNode]:
        """Get all nodes of a specific type."""
        return [node for node in self.nodes if node.node_type == node_type]

    def get_nodes_by_name(self, name: str) -> List[HeapNode]:
        """Get all nodes with a specific name."""
        return [node for node in self.nodes if node.name == name]

    def get_node_size_summary(self) -> pd.DataFrame:
        """
        Get summary of heap usage by node type.

        Returns:
            DataFrame with columns: node_type, count, total_size, avg_size
        """
        summary = defaultdict(lambda: {"count": 0, "total_size": 0})

        for node in self.nodes:
            summary[node.node_type]["count"] += 1
            summary[node.node_type]["total_size"] += node.self_size

        data = []
        for node_type, stats in summary.items():
            data.append(
                {
                    "node_type": node_type,
                    "count": stats["count"],
                    "total_size": stats["total_size"],
                    "avg_size": (
                        stats["total_size"] / stats["count"]
                        if stats["count"] > 0
                        else 0
                    ),
                }
            )

        df = pd.DataFrame(data)
        return df.sort_values("total_size", ascending=False)

    def find_retaining_path(
        self, node_id: int, max_depth: int = 10
    ) -> List[Tuple[HeapNode, HeapEdge]]:
        """
        Find retaining path from root to a node (why it's alive).

        Returns:
            List of (node, edge) tuples showing the path
        """
        # BFS from node backwards to root
        visited = set()
        queue = [(node_id, [])]

        while queue:
            current_id, path = queue.pop(0)

            if current_id in visited or len(path) > max_depth:
                continue
            visited.add(current_id)

            current_node = self.node_by_id.get(current_id)
            if not current_node:
                continue

            # Check if this is a root node
            if (
                current_node.node_type == "synthetic"
                and current_node.name == "(GC roots)"
            ):
                return path

            # Follow retainers
            for retainer_id, edge in self.retained_by.get(current_id, []):
                retainer_node = self.node_by_id.get(retainer_id)
                if retainer_node:
                    new_path = [(retainer_node, edge)] + path
                    queue.append((retainer_id, new_path))

        return []  # No path found


def load_snapshot(file_path: str) -> HeapSnapshot:
    """
    Load a heap snapshot from file.

    Args:
        file_path: Path to .heapsnapshot JSON file

    Returns:
        Parsed HeapSnapshot object
    """
    with open(file_path, "r") as f:
        data = json.load(f)
    return HeapSnapshot(data)


async def capture_snapshot(
    cdp_client, output_path: Optional[str] = None
) -> HeapSnapshot:
    """
    Capture a heap snapshot from a connected CDP client.

    Args:
        cdp_client: Connected CDPClient instance
        output_path: Optional path to save snapshot JSON

    Returns:
        Parsed HeapSnapshot object
    """
    print("Capturing heap snapshot... (this may take a few seconds)")
    snapshot_json = await cdp_client.take_heap_snapshot()

    if output_path:
        with open(output_path, "w") as f:
            f.write(snapshot_json)
        print(f"Snapshot saved to {output_path}")

    data = json.loads(snapshot_json)
    return HeapSnapshot(data)


def compare_snapshots(before: HeapSnapshot, after: HeapSnapshot) -> pd.DataFrame:
    """
    Compare two snapshots to find memory growth.

    Args:
        before: Earlier snapshot
        after: Later snapshot

    Returns:
        DataFrame showing objects that grew, with columns:
        - node_type: Type of object
        - name: Object name/constructor
        - count_before: Count in before snapshot
        - count_after: Count in after snapshot
        - count_delta: Change in count
        - size_before: Total size before
        - size_after: Total size after
        - size_delta: Change in size
    """

    # Build summaries by (type, name)
    def summarize(snapshot):
        summary = defaultdict(lambda: {"count": 0, "size": 0})
        for node in snapshot.nodes:
            key = (node.node_type, node.name)
            summary[key]["count"] += 1
            summary[key]["size"] += node.self_size
        return summary

    before_summary = summarize(before)
    after_summary = summarize(after)

    # Find all keys that exist in either snapshot
    all_keys = set(before_summary.keys()) | set(after_summary.keys())

    data = []
    for key in all_keys:
        node_type, name = key
        before_stats = before_summary.get(key, {"count": 0, "size": 0})
        after_stats = after_summary.get(key, {"count": 0, "size": 0})

        count_delta = after_stats["count"] - before_stats["count"]
        size_delta = after_stats["size"] - before_stats["size"]

        # Only include if there's actual growth
        if count_delta > 0 or size_delta > 0:
            data.append(
                {
                    "node_type": node_type,
                    "name": name,
                    "count_before": before_stats["count"],
                    "count_after": after_stats["count"],
                    "count_delta": count_delta,
                    "size_before": before_stats["size"],
                    "size_after": after_stats["size"],
                    "size_delta": size_delta,
                }
            )

    df = pd.DataFrame(data)
    if not df.empty:
        df = df.sort_values("size_delta", ascending=False)

    return df


def detect_leaks(
    snapshots: List[HeapSnapshot], threshold_mb: float = 1.0
) -> pd.DataFrame:
    """
    Detect potential memory leaks from a series of snapshots.

    Looks for objects that grow consistently across snapshots.

    Args:
        snapshots: List of snapshots taken over time
        threshold_mb: Only report objects growing more than this (in MB)

    Returns:
        DataFrame of likely leaking objects
    """
    if len(snapshots) < 2:
        return pd.DataFrame()

    # Track growth trends
    growth_trends = defaultdict(list)

    for i in range(len(snapshots) - 1):
        comparison = compare_snapshots(snapshots[i], snapshots[i + 1])
        for _, row in comparison.iterrows():
            key = (row["node_type"], row["name"])
            growth_trends[key].append(row["size_delta"])

    # Find objects with consistent growth
    leaks = []
    threshold_bytes = threshold_mb * 1024 * 1024

    for key, deltas in growth_trends.items():
        # Check if consistently growing
        if all(d > 0 for d in deltas):
            total_growth = sum(deltas)
            if total_growth > threshold_bytes:
                node_type, name = key
                leaks.append(
                    {
                        "node_type": node_type,
                        "name": name,
                        "total_growth_mb": total_growth / (1024 * 1024),
                        "growth_per_snapshot_mb": (total_growth / len(deltas))
                        / (1024 * 1024),
                        "snapshots_growing": len(deltas),
                    }
                )

    df = pd.DataFrame(leaks)
    if not df.empty:
        df = df.sort_values("total_growth_mb", ascending=False)

    return df


def find_largest_objects(snapshot: HeapSnapshot, limit: int = 20) -> pd.DataFrame:
    """
    Find the largest objects in a snapshot.

    Args:
        snapshot: Heap snapshot
        limit: Number of objects to return

    Returns:
        DataFrame of largest objects
    """
    data = []
    for node in snapshot.nodes:
        if node.self_size > 0:
            data.append(
                {
                    "node_id": node.node_id,
                    "node_type": node.node_type,
                    "name": node.name,
                    "size_bytes": node.self_size,
                    "size_mb": node.self_size / (1024 * 1024),
                }
            )

    df = pd.DataFrame(data)
    if not df.empty:
        df = df.sort_values("size_bytes", ascending=False).head(limit)

    return df


if __name__ == "__main__":
    print("Heap Analyzer - Example Usage")
    print("==============================")
    print()
    print("# Load snapshot from file")
    print("snapshot = load_snapshot('heap.heapsnapshot')")
    print()
    print("# Get size summary by type")
    print("summary = snapshot.get_node_size_summary()")
    print("print(summary)")
    print()
    print("# Find largest objects")
    print("large = find_largest_objects(snapshot)")
    print("print(large)")
    print()
    print("# Compare two snapshots")
    print("before = load_snapshot('before.heapsnapshot')")
    print("after = load_snapshot('after.heapsnapshot')")
    print("growth = compare_snapshots(before, after)")
    print("print(growth.head(10))")
    print()
    print("# Detect leaks over time")
    print("snapshots = [load_snapshot(f'snap_{i}.heapsnapshot') for i in range(5)]")
    print("leaks = detect_leaks(snapshots)")
    print("print(leaks)")
