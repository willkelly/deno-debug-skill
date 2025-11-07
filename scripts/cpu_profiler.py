"""
CPU profiling and performance analysis.

Provides tools to:
- Start/stop CPU profiling via CDP
- Parse V8 CPU profiles
- Analyze hot paths and expensive functions
- Detect async/await bottlenecks
- Generate performance summaries
"""

import json
import asyncio
from typing import Dict, List, Any, Optional, Tuple
from collections import defaultdict, Counter
from dataclasses import dataclass
import pandas as pd


@dataclass
class ProfileNode:
    """Represents a node in the CPU profile call tree."""
    node_id: int
    function_name: str
    script_id: int
    url: str
    line_number: int
    column_number: int
    hit_count: int
    children: List[int]
    bailout_reason: str = ""
    deopt_reason: str = ""


class CPUProfile:
    """
    Parsed V8 CPU profile with analysis capabilities.

    CPU profiles are recorded as a tree of function calls with sample counts.
    """

    def __init__(self, profile_data: Dict[str, Any]):
        self.raw_data = profile_data
        self.nodes = []
        self.node_by_id = {}
        self.start_time = profile_data.get('startTime', 0)
        self.end_time = profile_data.get('endTime', 0)
        self.samples = profile_data.get('samples', [])
        self.time_deltas = profile_data.get('timeDeltas', [])

        # Parse nodes
        self._parse_nodes()

        # Build call tree structure
        self._build_call_tree()

        # Calculate sample counts
        self._calculate_sample_counts()

    def _parse_nodes(self):
        """Parse profile nodes."""
        for node_data in self.raw_data.get('nodes', []):
            node = ProfileNode(
                node_id=node_data.get('id'),
                function_name=node_data.get('callFrame', {}).get('functionName', '(anonymous)'),
                script_id=node_data.get('callFrame', {}).get('scriptId', 0),
                url=node_data.get('callFrame', {}).get('url', ''),
                line_number=node_data.get('callFrame', {}).get('lineNumber', -1),
                column_number=node_data.get('callFrame', {}).get('columnNumber', -1),
                hit_count=node_data.get('hitCount', 0),
                children=node_data.get('children', []),
                bailout_reason=node_data.get('bailoutReason', ''),
                deopt_reason=node_data.get('deoptReason', '')
            )
            self.nodes.append(node)
            self.node_by_id[node.node_id] = node

    def _build_call_tree(self):
        """Build parent-child relationships."""
        self.children_map = defaultdict(list)
        self.parent_map = {}

        for node in self.nodes:
            for child_id in node.children:
                self.children_map[node.node_id].append(child_id)
                self.parent_map[child_id] = node.node_id

    def _calculate_sample_counts(self):
        """Calculate total samples (including children) for each node."""
        self.total_samples = len(self.samples)
        self.sample_counts = Counter(self.samples)

        # Calculate inclusive time (including children)
        self.inclusive_samples = {}
        for node in self.nodes:
            self.inclusive_samples[node.node_id] = self._get_inclusive_samples(node.node_id)

    def _get_inclusive_samples(self, node_id: int, visited: Optional[set] = None) -> int:
        """Recursively calculate samples including all children."""
        if visited is None:
            visited = set()

        if node_id in visited:
            return 0
        visited.add(node_id)

        count = self.sample_counts.get(node_id, 0)

        for child_id in self.children_map.get(node_id, []):
            count += self._get_inclusive_samples(child_id, visited)

        return count

    def get_hot_functions(self, limit: int = 20) -> pd.DataFrame:
        """
        Get the hottest (most CPU-intensive) functions.

        Args:
            limit: Number of functions to return

        Returns:
            DataFrame with columns: function_name, url, line, self_samples, total_samples, self_pct, total_pct
        """
        data = []
        for node in self.nodes:
            if node.hit_count > 0 or self.inclusive_samples.get(node.node_id, 0) > 0:
                self_samples = node.hit_count
                total_samples = self.inclusive_samples.get(node.node_id, 0)

                data.append({
                    'function_name': node.function_name or '(anonymous)',
                    'url': node.url,
                    'line': node.line_number,
                    'self_samples': self_samples,
                    'total_samples': total_samples,
                    'self_pct': (self_samples / self.total_samples * 100) if self.total_samples > 0 else 0,
                    'total_pct': (total_samples / self.total_samples * 100) if self.total_samples > 0 else 0,
                    'bailout_reason': node.bailout_reason,
                    'deopt_reason': node.deopt_reason,
                })

        df = pd.DataFrame(data)
        if not df.empty:
            df = df.sort_values('total_samples', ascending=False).head(limit)

        return df

    def get_call_tree(self, root_id: Optional[int] = None, max_depth: int = 10) -> List[Dict]:
        """
        Get call tree starting from a node.

        Args:
            root_id: Start from this node (None = profile root)
            max_depth: Maximum depth to traverse

        Returns:
            Nested dict structure representing call tree
        """
        if root_id is None:
            # Find root node (node with no parent)
            root_candidates = [n.node_id for n in self.nodes if n.node_id not in self.parent_map]
            if not root_candidates:
                return []
            root_id = root_candidates[0]

        def build_tree(node_id: int, depth: int) -> Dict:
            if depth > max_depth:
                return None

            node = self.node_by_id.get(node_id)
            if not node:
                return None

            tree_node = {
                'function': node.function_name or '(anonymous)',
                'url': node.url,
                'line': node.line_number,
                'self_samples': node.hit_count,
                'total_samples': self.inclusive_samples.get(node_id, 0),
                'children': []
            }

            for child_id in self.children_map.get(node_id, []):
                child_tree = build_tree(child_id, depth + 1)
                if child_tree:
                    tree_node['children'].append(child_tree)

            return tree_node

        return [build_tree(root_id, 0)]

    def detect_optimization_issues(self) -> pd.DataFrame:
        """
        Detect functions that had optimization issues (bailout/deopt).

        Returns:
            DataFrame of functions with optimization problems
        """
        data = []
        for node in self.nodes:
            issues = []
            if node.bailout_reason:
                issues.append(f"Bailout: {node.bailout_reason}")
            if node.deopt_reason:
                issues.append(f"Deopt: {node.deopt_reason}")

            if issues:
                data.append({
                    'function_name': node.function_name or '(anonymous)',
                    'url': node.url,
                    'line': node.line_number,
                    'self_samples': node.hit_count,
                    'total_samples': self.inclusive_samples.get(node.node_id, 0),
                    'issues': '; '.join(issues)
                })

        df = pd.DataFrame(data)
        if not df.empty:
            df = df.sort_values('total_samples', ascending=False)

        return df

    def get_timing_summary(self) -> Dict[str, Any]:
        """
        Get overall timing summary.

        Returns:
            Dict with total_time, sample_count, sample_rate
        """
        total_time_us = self.end_time - self.start_time
        total_time_ms = total_time_us / 1000

        return {
            'total_time_ms': total_time_ms,
            'total_time_s': total_time_ms / 1000,
            'sample_count': self.total_samples,
            'sample_rate_hz': self.total_samples / (total_time_ms / 1000) if total_time_ms > 0 else 0,
        }


def load_profile(file_path: str) -> CPUProfile:
    """
    Load a CPU profile from file.

    Args:
        file_path: Path to .cpuprofile JSON file

    Returns:
        Parsed CPUProfile object
    """
    with open(file_path, 'r') as f:
        data = json.load(f)
    return CPUProfile(data)


async def start_profiling(cdp_client) -> None:
    """
    Start CPU profiling on a connected CDP client.

    Args:
        cdp_client: Connected CDPClient instance
    """
    await cdp_client.start_profiling()
    print("CPU profiling started")


async def stop_profiling(cdp_client, output_path: Optional[str] = None) -> CPUProfile:
    """
    Stop CPU profiling and retrieve the profile.

    Args:
        cdp_client: Connected CDPClient instance
        output_path: Optional path to save profile JSON

    Returns:
        Parsed CPUProfile object
    """
    profile_data = await cdp_client.stop_profiling()
    print("CPU profiling stopped")

    if output_path:
        with open(output_path, 'w') as f:
            json.dump(profile_data, f, indent=2)
        print(f"Profile saved to {output_path}")

    return CPUProfile(profile_data)


def analyze_hot_paths(profile: CPUProfile, min_pct: float = 1.0) -> pd.DataFrame:
    """
    Analyze hot paths (expensive call chains) in the profile.

    Args:
        profile: CPU profile
        min_pct: Minimum percentage of total time to include

    Returns:
        DataFrame of hot paths
    """
    # Find nodes that consume significant time
    hot_nodes = []
    for node in profile.nodes:
        total_samples = profile.inclusive_samples.get(node.node_id, 0)
        pct = (total_samples / profile.total_samples * 100) if profile.total_samples > 0 else 0

        if pct >= min_pct:
            # Build path from root to this node
            path = []
            current_id = node.node_id
            while current_id in profile.parent_map:
                current_node = profile.node_by_id[current_id]
                path.insert(0, f"{current_node.function_name}:{current_node.line_number}")
                current_id = profile.parent_map[current_id]

            hot_nodes.append({
                'function': node.function_name or '(anonymous)',
                'url': node.url,
                'line': node.line_number,
                'pct': pct,
                'samples': total_samples,
                'call_path': ' -> '.join(path) if path else node.function_name
            })

    df = pd.DataFrame(hot_nodes)
    if not df.empty:
        df = df.sort_values('pct', ascending=False)

    return df


def detect_async_issues(profile: CPUProfile) -> Dict[str, Any]:
    """
    Detect potential async/await performance issues.

    Returns:
        Dict with analysis of async patterns
    """
    # Look for common async patterns
    promise_nodes = [n for n in profile.nodes if 'Promise' in n.function_name or 'async' in n.url.lower()]
    await_nodes = [n for n in profile.nodes if 'await' in n.function_name.lower()]
    callback_nodes = [n for n in profile.nodes if 'callback' in n.function_name.lower()]

    promise_samples = sum(profile.inclusive_samples.get(n.node_id, 0) for n in promise_nodes)
    await_samples = sum(profile.inclusive_samples.get(n.node_id, 0) for n in await_nodes)
    callback_samples = sum(profile.inclusive_samples.get(n.node_id, 0) for n in callback_nodes)

    total = profile.total_samples

    return {
        'promise_related_pct': (promise_samples / total * 100) if total > 0 else 0,
        'await_related_pct': (await_samples / total * 100) if total > 0 else 0,
        'callback_related_pct': (callback_samples / total * 100) if total > 0 else 0,
        'promise_node_count': len(promise_nodes),
        'await_node_count': len(await_nodes),
        'callback_node_count': len(callback_nodes),
        'analysis': _interpret_async_metrics(promise_samples, await_samples, callback_samples, total)
    }


def _interpret_async_metrics(promise_samples: int, await_samples: int, callback_samples: int, total: int) -> str:
    """Interpret async metrics and provide analysis."""
    issues = []

    promise_pct = (promise_samples / total * 100) if total > 0 else 0
    if promise_pct > 20:
        issues.append(f"High Promise overhead ({promise_pct:.1f}% of time) - consider reducing async operations")

    await_pct = (await_samples / total * 100) if total > 0 else 0
    if await_pct > 15:
        issues.append(f"Significant time in await ({await_pct:.1f}%) - check for blocking async operations")

    callback_pct = (callback_samples / total * 100) if total > 0 else 0
    if callback_pct > 10:
        issues.append(f"Callback overhead detected ({callback_pct:.1f}%) - consider using async/await")

    if not issues:
        return "No significant async performance issues detected"

    return "; ".join(issues)


def get_function_times(profile: CPUProfile, url_filter: Optional[str] = None) -> pd.DataFrame:
    """
    Get time spent in each function.

    Args:
        profile: CPU profile
        url_filter: Optional URL substring to filter by (e.g., 'file:///app/')

    Returns:
        DataFrame with function timing information
    """
    data = []
    for node in profile.nodes:
        if url_filter and url_filter not in node.url:
            continue

        self_samples = node.hit_count
        total_samples = profile.inclusive_samples.get(node.node_id, 0)

        if total_samples > 0:
            data.append({
                'function': node.function_name or '(anonymous)',
                'url': node.url,
                'line': node.line_number,
                'self_time_pct': (self_samples / profile.total_samples * 100) if profile.total_samples > 0 else 0,
                'total_time_pct': (total_samples / profile.total_samples * 100) if profile.total_samples > 0 else 0,
                'self_samples': self_samples,
                'total_samples': total_samples,
            })

    df = pd.DataFrame(data)
    if not df.empty:
        df = df.sort_values('total_time_pct', ascending=False)

    return df


if __name__ == '__main__':
    print("CPU Profiler - Example Usage")
    print("=============================")
    print()
    print("# Start profiling")
    print("from scripts.cdp_client import CDPClientSync")
    print("client = CDPClientSync('127.0.0.1', 9229)")
    print("await start_profiling(client)")
    print()
    print("# ... let code run ...")
    print()
    print("# Stop and analyze")
    print("profile = await stop_profiling(client, 'profile.cpuprofile')")
    print("hot = profile.get_hot_functions()")
    print("print(hot)")
    print()
    print("# Find hot paths")
    print("hot_paths = analyze_hot_paths(profile)")
    print("print(hot_paths)")
    print()
    print("# Check async issues")
    print("async_analysis = detect_async_issues(profile)")
    print("print(async_analysis)")
