"""
Investigation breadcrumbs tracking system.

Records the investigation journey:
- Hypotheses formed
- Tests conducted
- Findings discovered
- Decisions made
- Data captured

Enables:
- Timeline generation
- Reproducible investigations
- Comprehensive reporting
"""

import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict
from enum import Enum


class BreadcrumbType(Enum):
    """Types of breadcrumbs that can be recorded."""
    HYPOTHESIS = "hypothesis"
    TEST = "test"
    FINDING = "finding"
    DECISION = "decision"
    DATA = "data"
    NOTE = "note"
    QUESTION = "question"


@dataclass
class Breadcrumb:
    """A single breadcrumb in the investigation."""
    timestamp: str
    type: str
    description: str
    details: Dict[str, Any]
    tags: List[str]

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return asdict(self)


class Breadcrumbs:
    """
    Investigation breadcrumbs tracker.

    Usage:
        bc = Breadcrumbs()
        bc.add_hypothesis("Upload handler may retain file buffers")
        bc.add_test("heap_snapshot_comparison", {"files": ["before.heap", "after.heap"]})
        bc.add_finding("ArrayBuffer growing by 50MB per upload", {"growth_rate": "50MB"})
        bc.save("investigation.json")
    """

    def __init__(self, investigation_name: Optional[str] = None):
        self.investigation_name = investigation_name or f"investigation_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.breadcrumbs: List[Breadcrumb] = []
        self.start_time = datetime.now()

    def _add_breadcrumb(
        self,
        crumb_type: BreadcrumbType,
        description: str,
        details: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None
    ):
        """Internal method to add a breadcrumb."""
        breadcrumb = Breadcrumb(
            timestamp=datetime.now().isoformat(),
            type=crumb_type.value,
            description=description,
            details=details or {},
            tags=tags or []
        )
        self.breadcrumbs.append(breadcrumb)
        return breadcrumb

    def add_hypothesis(self, description: str, rationale: Optional[str] = None, tags: Optional[List[str]] = None):
        """
        Record a hypothesis about what might be wrong.

        Args:
            description: The hypothesis statement
            rationale: Why you think this might be the issue
            tags: Optional tags for categorization
        """
        details = {}
        if rationale:
            details['rationale'] = rationale

        return self._add_breadcrumb(BreadcrumbType.HYPOTHESIS, description, details, tags)

    def add_test(
        self,
        test_name: str,
        description: str,
        details: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None
    ):
        """
        Record a test being conducted.

        Args:
            test_name: Name of the test
            description: What the test does
            details: Additional details (files, parameters, etc.)
            tags: Optional tags
        """
        test_details = details or {}
        test_details['test_name'] = test_name

        return self._add_breadcrumb(BreadcrumbType.TEST, description, test_details, tags)

    def add_finding(
        self,
        finding: str,
        data: Optional[Dict[str, Any]] = None,
        severity: Optional[str] = None,
        tags: Optional[List[str]] = None
    ):
        """
        Record a finding or discovery.

        Args:
            finding: What was discovered
            data: Supporting data
            severity: Optional severity (low, medium, high, critical)
            tags: Optional tags
        """
        details = data or {}
        if severity:
            details['severity'] = severity

        return self._add_breadcrumb(BreadcrumbType.FINDING, finding, details, tags)

    def add_decision(
        self,
        decision: str,
        rationale: str,
        alternatives: Optional[List[str]] = None,
        tags: Optional[List[str]] = None
    ):
        """
        Record a decision made during investigation.

        Args:
            decision: What decision was made
            rationale: Why this decision was made
            alternatives: Other options considered
            tags: Optional tags
        """
        details = {
            'rationale': rationale
        }
        if alternatives:
            details['alternatives'] = alternatives

        return self._add_breadcrumb(BreadcrumbType.DECISION, decision, details, tags)

    def add_data(
        self,
        data_type: str,
        location: str,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None
    ):
        """
        Record data captured during investigation.

        Args:
            data_type: Type of data (snapshot, profile, log, etc.)
            location: Where the data is stored
            description: Optional description
            metadata: Additional metadata
        """
        details = metadata or {}
        details['data_type'] = data_type
        details['location'] = location

        desc = description or f"{data_type} captured at {location}"

        return self._add_breadcrumb(BreadcrumbType.DATA, desc, details, tags)

    def add_note(self, note: str, tags: Optional[List[str]] = None):
        """Record a general note or observation."""
        return self._add_breadcrumb(BreadcrumbType.NOTE, note, {}, tags)

    def add_question(
        self,
        question: str,
        answer: Optional[str] = None,
        tags: Optional[List[str]] = None
    ):
        """
        Record a question (and optionally its answer).

        Args:
            question: The question
            answer: Optional answer (can be added later)
            tags: Optional tags
        """
        details = {}
        if answer:
            details['answer'] = answer

        return self._add_breadcrumb(BreadcrumbType.QUESTION, question, details, tags)

    def answer_question(self, question_index: int, answer: str):
        """Add an answer to a previously asked question."""
        if 0 <= question_index < len(self.breadcrumbs):
            crumb = self.breadcrumbs[question_index]
            if crumb.type == BreadcrumbType.QUESTION.value:
                crumb.details['answer'] = answer
                crumb.details['answered_at'] = datetime.now().isoformat()

    def get_timeline(self) -> List[Breadcrumb]:
        """Get all breadcrumbs in chronological order."""
        return self.breadcrumbs

    def get_by_type(self, crumb_type: BreadcrumbType) -> List[Breadcrumb]:
        """Get all breadcrumbs of a specific type."""
        return [bc for bc in self.breadcrumbs if bc.type == crumb_type.value]

    def get_by_tag(self, tag: str) -> List[Breadcrumb]:
        """Get all breadcrumbs with a specific tag."""
        return [bc for bc in self.breadcrumbs if tag in bc.tags]

    def get_summary(self) -> Dict[str, Any]:
        """Get a summary of the investigation."""
        duration = datetime.now() - self.start_time

        type_counts = {}
        for bc_type in BreadcrumbType:
            type_counts[bc_type.value] = len(self.get_by_type(bc_type))

        return {
            'investigation_name': self.investigation_name,
            'start_time': self.start_time.isoformat(),
            'duration_seconds': duration.total_seconds(),
            'breadcrumb_count': len(self.breadcrumbs),
            'type_counts': type_counts,
        }

    def to_org_timeline(self) -> str:
        """
        Generate an Org mode timeline of the investigation.

        Returns:
            Org mode formatted timeline
        """
        lines = [
            f"* Investigation Timeline: {self.investigation_name}",
            f"  :PROPERTIES:",
            f"  :START_TIME: {self.start_time.isoformat()}",
            f"  :END:",
            ""
        ]

        for i, bc in enumerate(self.breadcrumbs, 1):
            # Parse timestamp for org format
            ts = datetime.fromisoformat(bc.timestamp)
            org_ts = ts.strftime("[%Y-%m-%d %a %H:%M]")

            # Create heading
            icon = {
                'hypothesis': '❓',
                'test': '🧪',
                'finding': '🔍',
                'decision': '⚡',
                'data': '💾',
                'note': '📝',
                'question': '❔'
            }.get(bc.type, '•')

            lines.append(f"** {icon} {bc.type.upper()}: {bc.description}")
            lines.append(f"   {org_ts}")

            # Add details
            if bc.details:
                lines.append("   :PROPERTIES:")
                for key, value in bc.details.items():
                    # Format value for org properties
                    if isinstance(value, (list, dict)):
                        value = json.dumps(value, indent=2)
                    lines.append(f"   :{key.upper()}: {value}")
                lines.append("   :END:")

            # Add tags
            if bc.tags:
                lines.append(f"   Tags: {', '.join(bc.tags)}")

            lines.append("")

        return '\n'.join(lines)

    def to_markdown_timeline(self) -> str:
        """
        Generate a Markdown timeline of the investigation.

        Returns:
            Markdown formatted timeline
        """
        lines = [
            f"# Investigation Timeline: {self.investigation_name}",
            f"Started: {self.start_time.isoformat()}",
            ""
        ]

        for i, bc in enumerate(self.breadcrumbs, 1):
            ts = datetime.fromisoformat(bc.timestamp)

            icon = {
                'hypothesis': '❓',
                'test': '🧪',
                'finding': '🔍',
                'decision': '⚡',
                'data': '💾',
                'note': '📝',
                'question': '❔'
            }.get(bc.type, '•')

            lines.append(f"## {i}. {icon} {bc.type.upper()}: {bc.description}")
            lines.append(f"*{ts.strftime('%Y-%m-%d %H:%M:%S')}*")
            lines.append("")

            # Add details
            if bc.details:
                for key, value in bc.details.items():
                    lines.append(f"- **{key}**: {value}")
                lines.append("")

            # Add tags
            if bc.tags:
                lines.append(f"Tags: `{', '.join(bc.tags)}`")
                lines.append("")

        return '\n'.join(lines)

    def save(self, file_path: str):
        """
        Save breadcrumbs to JSON file.

        Args:
            file_path: Output file path
        """
        data = {
            'investigation_name': self.investigation_name,
            'start_time': self.start_time.isoformat(),
            'breadcrumbs': [bc.to_dict() for bc in self.breadcrumbs],
            'summary': self.get_summary()
        }

        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)

        print(f"Breadcrumbs saved to {file_path}")

    @classmethod
    def load(cls, file_path: str) -> 'Breadcrumbs':
        """
        Load breadcrumbs from JSON file.

        Args:
            file_path: Input file path

        Returns:
            Breadcrumbs instance
        """
        with open(file_path, 'r') as f:
            data = json.load(f)

        bc = cls(investigation_name=data['investigation_name'])
        bc.start_time = datetime.fromisoformat(data['start_time'])

        for crumb_data in data['breadcrumbs']:
            bc.breadcrumbs.append(Breadcrumb(**crumb_data))

        return bc


if __name__ == '__main__':
    print("Breadcrumbs - Example Usage")
    print("============================")
    print()
    print("# Initialize tracking")
    print("bc = Breadcrumbs('memory_leak_investigation')")
    print()
    print("# Record hypothesis")
    print("bc.add_hypothesis(")
    print("    'Upload handler retains file buffers in closure',")
    print("    rationale='Heap shows growing ArrayBuffer objects'")
    print(")")
    print()
    print("# Record test")
    print("bc.add_test(")
    print("    'heap_snapshot_comparison',")
    print("    'Compare heap before and after 10 uploads',")
    print("    details={'snapshots': ['before.heap', 'after.heap']}")
    print(")")
    print()
    print("# Record finding")
    print("bc.add_finding(")
    print("    'ArrayBuffer objects growing by 50MB per upload',")
    print("    data={'growth_rate': '50MB/upload', 'object_count': 1250},")
    print("    severity='high'")
    print(")")
    print()
    print("# Save and export")
    print("bc.save('investigation.json')")
    print("timeline = bc.to_org_timeline()")
    print("print(timeline)")
