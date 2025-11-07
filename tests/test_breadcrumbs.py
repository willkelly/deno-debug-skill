"""
Tests for breadcrumbs tracking system.
"""

import pytest
import json
import tempfile
from datetime import datetime
from breadcrumbs import Breadcrumbs, BreadcrumbType


def test_breadcrumbs_initialization():
    """Test creating a Breadcrumbs instance."""
    bc = Breadcrumbs('test_investigation')
    assert bc.investigation_name == 'test_investigation'
    assert len(bc.breadcrumbs) == 0
    assert bc.start_time is not None


def test_add_hypothesis():
    """Test adding a hypothesis."""
    bc = Breadcrumbs('test')
    bc.add_hypothesis("Memory leak in handler", rationale="Heap growing")

    assert len(bc.breadcrumbs) == 1
    assert bc.breadcrumbs[0].type == BreadcrumbType.HYPOTHESIS.value
    assert bc.breadcrumbs[0].description == "Memory leak in handler"
    assert bc.breadcrumbs[0].details['rationale'] == "Heap growing"


def test_add_test():
    """Test adding a test."""
    bc = Breadcrumbs('test')
    bc.add_test('heap_comparison', 'Compare snapshots', details={'file': 'test.heap'})

    assert len(bc.breadcrumbs) == 1
    crumb = bc.breadcrumbs[0]
    assert crumb.type == BreadcrumbType.TEST.value
    assert crumb.details['test_name'] == 'heap_comparison'
    assert crumb.details['file'] == 'test.heap'


def test_add_finding():
    """Test adding a finding."""
    bc = Breadcrumbs('test')
    bc.add_finding("Found the leak", data={'size': '50MB'}, severity='high')

    assert len(bc.breadcrumbs) == 1
    crumb = bc.breadcrumbs[0]
    assert crumb.type == BreadcrumbType.FINDING.value
    assert crumb.details['severity'] == 'high'
    assert crumb.details['size'] == '50MB'


def test_add_decision():
    """Test adding a decision."""
    bc = Breadcrumbs('test')
    bc.add_decision(
        "Set breakpoint in handler",
        rationale="Need to inspect closure",
        alternatives=["Use heap snapshot", "Add logging"]
    )

    assert len(bc.breadcrumbs) == 1
    crumb = bc.breadcrumbs[0]
    assert crumb.type == BreadcrumbType.DECISION.value
    assert crumb.details['rationale'] == "Need to inspect closure"
    assert len(crumb.details['alternatives']) == 2


def test_get_by_type():
    """Test filtering breadcrumbs by type."""
    bc = Breadcrumbs('test')
    bc.add_hypothesis("Hypothesis 1")
    bc.add_test("test1", "Test 1")
    bc.add_hypothesis("Hypothesis 2")
    bc.add_finding("Finding 1")

    hypotheses = bc.get_by_type(BreadcrumbType.HYPOTHESIS)
    assert len(hypotheses) == 2

    tests = bc.get_by_type(BreadcrumbType.TEST)
    assert len(tests) == 1


def test_get_by_tag():
    """Test filtering breadcrumbs by tag."""
    bc = Breadcrumbs('test')
    bc.add_hypothesis("H1", tags=['memory'])
    bc.add_hypothesis("H2", tags=['performance'])
    bc.add_finding("F1", tags=['memory', 'critical'])

    memory_crumbs = bc.get_by_tag('memory')
    assert len(memory_crumbs) == 2

    perf_crumbs = bc.get_by_tag('performance')
    assert len(perf_crumbs) == 1


def test_save_and_load():
    """Test saving and loading breadcrumbs."""
    bc = Breadcrumbs('test_investigation')
    bc.add_hypothesis("Test hypothesis")
    bc.add_finding("Test finding", severity='high')

    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        temp_path = f.name

    try:
        bc.save(temp_path)

        # Load it back
        loaded = Breadcrumbs.load(temp_path)
        assert loaded.investigation_name == 'test_investigation'
        assert len(loaded.breadcrumbs) == 2
        assert loaded.breadcrumbs[0].description == "Test hypothesis"
        assert loaded.breadcrumbs[1].description == "Test finding"
    finally:
        import os
        os.unlink(temp_path)


def test_org_timeline():
    """Test Org mode timeline generation."""
    bc = Breadcrumbs('test_investigation')
    bc.add_hypothesis("Memory leak suspected")
    bc.add_test("snapshot_test", "Capture snapshots")
    bc.add_finding("Leak confirmed")

    timeline = bc.to_org_timeline()

    assert 'Investigation Timeline' in timeline
    assert 'HYPOTHESIS' in timeline
    assert 'TEST' in timeline
    assert 'FINDING' in timeline
    assert 'Memory leak suspected' in timeline


def test_markdown_timeline():
    """Test Markdown timeline generation."""
    bc = Breadcrumbs('test')
    bc.add_hypothesis("Test hypothesis")
    bc.add_finding("Test finding")

    timeline = bc.to_markdown_timeline()

    assert '# Investigation Timeline' in timeline
    assert 'HYPOTHESIS' in timeline
    assert 'FINDING' in timeline


def test_get_summary():
    """Test summary generation."""
    bc = Breadcrumbs('test')
    bc.add_hypothesis("H1")
    bc.add_hypothesis("H2")
    bc.add_test("T1", "Test")
    bc.add_finding("F1")

    summary = bc.get_summary()

    assert summary['investigation_name'] == 'test'
    assert summary['breadcrumb_count'] == 4
    assert summary['type_counts']['hypothesis'] == 2
    assert summary['type_counts']['test'] == 1
    assert summary['type_counts']['finding'] == 1


def test_multiple_breadcrumbs_chronological():
    """Test that breadcrumbs maintain chronological order."""
    bc = Breadcrumbs('test')

    import time
    bc.add_hypothesis("First")
    time.sleep(0.01)
    bc.add_test("test", "Second")
    time.sleep(0.01)
    bc.add_finding("Third")

    timeline = bc.get_timeline()
    assert len(timeline) == 3

    # Verify chronological order
    t1 = datetime.fromisoformat(timeline[0].timestamp)
    t2 = datetime.fromisoformat(timeline[1].timestamp)
    t3 = datetime.fromisoformat(timeline[2].timestamp)

    assert t1 < t2 < t3
