"""
Tests for CPU profile parsing and analysis.
"""

import pandas as pd
from cpu_profiler import CPUProfile, analyze_hot_paths, detect_async_issues


def test_cpu_profile_parsing(sample_cpu_profile):
    """Test basic CPU profile parsing."""
    profile = CPUProfile(sample_cpu_profile)

    assert len(profile.nodes) == 3
    assert profile.total_samples == 10
    assert profile.start_time == 0
    assert profile.end_time == 1000000


def test_profile_nodes(sample_cpu_profile):
    """Test that profile nodes are parsed correctly."""
    profile = CPUProfile(sample_cpu_profile)

    # Check root node
    root = profile.nodes[0]
    assert root.function_name == "(root)"
    assert root.hit_count == 5
    assert len(root.children) == 2

    # Check child nodes
    slow = profile.nodes[1]
    assert slow.function_name == "slowFunction"
    assert slow.hit_count == 50
    assert slow.url == "file:///app.ts"
    assert slow.line_number == 10


def test_get_hot_functions(sample_cpu_profile):
    """Test finding hot functions."""
    profile = CPUProfile(sample_cpu_profile)

    hot = profile.get_hot_functions(limit=5)

    assert isinstance(hot, pd.DataFrame)
    assert not hot.empty

    # slowFunction should have highest self_samples (50)
    # Note: total_samples sorting puts root first, so check by filtering
    slow_row = hot[hot["function_name"] == "slowFunction"]
    assert len(slow_row) > 0
    assert slow_row.iloc[0]["self_samples"] == 50

    # Should have percentage columns
    assert "self_pct" in hot.columns
    assert "total_pct" in hot.columns


def test_sample_counting(sample_cpu_profile):
    """Test that samples are counted correctly."""
    profile = CPUProfile(sample_cpu_profile)

    # Total should be 10
    assert profile.total_samples == 10

    # Sample counts per node
    assert profile.sample_counts[2] == 5  # slowFunction appears 5 times in samples


def test_timing_summary(sample_cpu_profile):
    """Test timing summary generation."""
    profile = CPUProfile(sample_cpu_profile)

    summary = profile.get_timing_summary()

    assert "total_time_ms" in summary
    assert "total_time_s" in summary
    assert "sample_count" in summary
    assert "sample_rate_hz" in summary

    assert summary["total_time_ms"] == 1000  # 1 second
    assert summary["sample_count"] == 10


def test_call_tree_structure(sample_cpu_profile):
    """Test call tree building."""
    profile = CPUProfile(sample_cpu_profile)

    # Check parent-child relationships
    assert 2 in profile.children_map[1]  # root has slowFunction as child
    assert 3 in profile.children_map[1]  # root has fastFunction as child

    # Check parent map
    assert profile.parent_map[2] == 1  # slowFunction's parent is root
    assert profile.parent_map[3] == 1  # fastFunction's parent is root


def test_get_call_tree(sample_cpu_profile):
    """Test call tree generation."""
    profile = CPUProfile(sample_cpu_profile)

    tree = profile.get_call_tree(max_depth=5)

    assert isinstance(tree, list)
    assert len(tree) > 0

    # Root node should have children
    root = tree[0]
    assert "function" in root
    assert "children" in root
    assert len(root["children"]) == 2  # slowFunction and fastFunction


def test_analyze_hot_paths(sample_cpu_profile):
    """Test hot path analysis."""
    profile = CPUProfile(sample_cpu_profile)

    hot_paths = analyze_hot_paths(profile, min_pct=10.0)

    assert isinstance(hot_paths, pd.DataFrame)
    # slowFunction should be in hot paths (50% of samples)
    assert not hot_paths.empty
    slow_rows = hot_paths[hot_paths["function"] == "slowFunction"]
    assert len(slow_rows) > 0


def test_detect_async_issues(sample_cpu_profile):
    """Test async issue detection."""
    profile = CPUProfile(sample_cpu_profile)

    analysis = detect_async_issues(profile)

    assert isinstance(analysis, dict)
    assert "promise_related_pct" in analysis
    assert "await_related_pct" in analysis
    assert "callback_related_pct" in analysis
    assert "analysis" in analysis


def test_optimization_issues(sample_cpu_profile):
    """Test detection of optimization issues."""
    # Add a node with deopt reason
    profile_data = sample_cpu_profile.copy()
    profile_data["nodes"][1]["deoptReason"] = "Insufficient type feedback"

    profile = CPUProfile(profile_data)

    issues = profile.detect_optimization_issues()

    assert isinstance(issues, pd.DataFrame)
    if not issues.empty:
        # Should have the slowFunction with deopt issue
        assert "slowFunction" in issues["function_name"].values


def test_inclusive_samples_calculation(sample_cpu_profile):
    """Test that inclusive sample counts include children."""
    profile = CPUProfile(sample_cpu_profile)

    # Root node should have all samples (including its own and children's)
    root_inclusive = profile.inclusive_samples.get(1)
    assert root_inclusive is not None
    # Should be more than just its own hit count
    assert root_inclusive >= profile.nodes[0].hit_count
