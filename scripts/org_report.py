"""
Org mode report generation for debugging investigations.

Generates comprehensive reports with:
- Executive summary
- Investigation timeline from breadcrumbs
- Code snippets (TypeScript/JavaScript)
- Executable analysis blocks (Python)
- Visualizations
- Actionable recommendations
"""

from datetime import datetime
from typing import Any, Dict, List, Optional


class OrgReport:
    """
    Org mode report builder for debugging investigations.

    Usage:
        report = OrgReport("Memory Leak Investigation", breadcrumbs)
        report.add_summary("Found memory leak in upload handler...")
        report.add_timeline()
        report.add_code_snippet("typescript", code, "src/upload.ts:42")
        report.add_analysis("Heap Growth", python_code, "data/")
        report.save("investigation_report.org")
    """

    def __init__(self, title: str, breadcrumbs=None):
        self.title = title
        self.breadcrumbs = breadcrumbs
        self.sections = []
        self.created_at = datetime.now()

    def add_summary(self, text: str):
        """
        Add executive summary section.

        Args:
            text: Summary text
        """
        section = {"type": "summary", "content": text}
        self.sections.append(section)

    def add_timeline(self):
        """Add investigation timeline from breadcrumbs."""
        if not self.breadcrumbs:
            return

        section = {"type": "timeline", "content": self.breadcrumbs.to_org_timeline()}
        self.sections.append(section)

    def add_section(self, heading: str, content: str, level: int = 2):
        """
        Add a custom section.

        Args:
            heading: Section heading
            content: Section content
            level: Heading level (1-6)
        """
        section = {
            "type": "custom",
            "heading": heading,
            "content": content,
            "level": level,
        }
        self.sections.append(section)

    def add_code_snippet(
        self,
        language: str,
        code: str,
        caption: Optional[str] = None,
        line_numbers: bool = True,
    ):
        """
        Add a code snippet.

        Args:
            language: Language (typescript, javascript, python, etc.)
            code: Code content
            caption: Optional caption
            line_numbers: Whether to show line numbers
        """
        section = {
            "type": "code",
            "language": language,
            "code": code,
            "caption": caption,
            "line_numbers": line_numbers,
        }
        self.sections.append(section)

    def add_analysis(
        self,
        name: str,
        python_code: str,
        data_path: Optional[str] = None,
        description: Optional[str] = None,
    ):
        """
        Add an executable Python analysis block.

        Args:
            name: Name of the analysis
            python_code: Python code to execute
            data_path: Optional path to data files
            description: Optional description
        """
        section = {
            "type": "analysis",
            "name": name,
            "code": python_code,
            "data_path": data_path,
            "description": description,
        }
        self.sections.append(section)

    def add_visualization(
        self,
        image_path: str,
        caption: Optional[str] = None,
        description: Optional[str] = None,
    ):
        """
        Add a visualization image.

        Args:
            image_path: Path to image file
            caption: Optional caption
            description: Optional description
        """
        section = {
            "type": "visualization",
            "image_path": image_path,
            "caption": caption,
            "description": description,
        }
        self.sections.append(section)

    def add_finding(
        self,
        finding: str,
        severity: str = "medium",
        details: Optional[str] = None,
        evidence: Optional[List[str]] = None,
    ):
        """
        Add a key finding.

        Args:
            finding: The finding description
            severity: Severity level (low, medium, high, critical)
            details: Additional details
            evidence: List of evidence items
        """
        section = {
            "type": "finding",
            "finding": finding,
            "severity": severity,
            "details": details,
            "evidence": evidence or [],
        }
        self.sections.append(section)

    def add_recommendations(self, recommendations: List[Dict[str, str]]):
        """
        Add actionable recommendations.

        Args:
            recommendations: List of dicts with 'title', 'description', 'priority'
        """
        section = {"type": "recommendations", "items": recommendations}
        self.sections.append(section)

    def add_table(
        self,
        data: List[List[str]],
        headers: Optional[List[str]] = None,
        caption: Optional[str] = None,
    ):
        """
        Add a table.

        Args:
            data: Table data as list of rows
            headers: Optional column headers
            caption: Optional caption
        """
        section = {
            "type": "table",
            "data": data,
            "headers": headers,
            "caption": caption,
        }
        self.sections.append(section)

    def _render_header(self) -> str:
        """Render document header."""
        lines = [
            f"#+TITLE: {self.title}",
            f"#+AUTHOR: Claude (AI Debugger)",
            f"#+DATE: {self.created_at.strftime('%Y-%m-%d %H:%M')}",
            "#+OPTIONS: toc:2 num:t",
            "#+STARTUP: overview",
            "",
            "* Executive Summary",
            "",
        ]
        return "\n".join(lines)

    def _render_section(self, section: Dict[str, Any]) -> str:
        """Render a single section."""
        if section["type"] == "summary":
            return section["content"] + "\n"

        elif section["type"] == "timeline":
            return section["content"] + "\n"

        elif section["type"] == "custom":
            level = "*" * section.get("level", 2)
            return f"{level} {section['heading']}\n\n{section['content']}\n"

        elif section["type"] == "code":
            lines = []
            if section.get("caption"):
                lines.append(f"#+CAPTION: {section['caption']}")

            options = "-n" if section.get("line_numbers") else ""
            lines.append(f"#+BEGIN_SRC {section['language']} {options}")
            lines.append(section["code"])
            lines.append("#+END_SRC")
            lines.append("")
            return "\n".join(lines)

        elif section["type"] == "analysis":
            lines = [f"** {section['name']}", ""]

            if section.get("description"):
                lines.append(section["description"])
                lines.append("")

            if section.get("data_path"):
                lines.append(f"Data location: ~{section['data_path']}~")
                lines.append("")

            lines.append("#+BEGIN_SRC python :results output :exports both")
            lines.append(section["code"])
            lines.append("#+END_SRC")
            lines.append("")

            return "\n".join(lines)

        elif section["type"] == "visualization":
            lines = []

            if section.get("description"):
                lines.append(section["description"])
                lines.append("")

            if section.get("caption"):
                lines.append(f"#+CAPTION: {section['caption']}")

            lines.append(f"[[file:{section['image_path']}]]")
            lines.append("")

            return "\n".join(lines)

        elif section["type"] == "finding":
            severity_icon = {
                "low": "🟢",
                "medium": "🟡",
                "high": "🟠",
                "critical": "🔴",
            }.get(section["severity"], "⚪")

            lines = [
                f"** {severity_icon} Finding: {section['finding']}",
                f"   :PROPERTIES:",
                f"   :SEVERITY: {section['severity']}",
                f"   :END:",
                "",
            ]

            if section.get("details"):
                lines.append(section["details"])
                lines.append("")

            if section.get("evidence"):
                lines.append("*** Evidence")
                for item in section["evidence"]:
                    lines.append(f"- {item}")
                lines.append("")

            return "\n".join(lines)

        elif section["type"] == "recommendations":
            lines = ["* Recommendations", ""]

            for i, rec in enumerate(section["items"], 1):
                priority = rec.get("priority", "medium")
                priority_icon = {
                    "low": "🔵",
                    "medium": "🟡",
                    "high": "🔴",
                    "critical": "⚠️",
                }.get(priority, "•")

                lines.append(f"** {priority_icon} {rec.get('title', 'Recommendation')}")
                lines.append(f"   :PROPERTIES:")
                lines.append(f"   :PRIORITY: {priority}")
                lines.append(f"   :END:")
                lines.append("")
                lines.append(rec.get("description", ""))
                lines.append("")

            return "\n".join(lines)

        elif section["type"] == "table":
            lines = []

            if section.get("caption"):
                lines.append(f"#+CAPTION: {section['caption']}")

            # Render table
            headers = section.get("headers")
            data = section.get("data", [])

            if headers:
                lines.append("| " + " | ".join(headers) + " |")
                lines.append(
                    "|" + "|".join(["-" * (len(h) + 2) for h in headers]) + "|"
                )

            for row in data:
                lines.append("| " + " | ".join(str(cell) for cell in row) + " |")

            lines.append("")
            return "\n".join(lines)

        return ""

    def generate(self) -> str:
        """
        Generate the complete Org mode document.

        Returns:
            Complete Org mode document as string
        """
        parts = [self._render_header()]

        for section in self.sections:
            parts.append(self._render_section(section))

        # Add footer
        parts.append("* Metadata")
        parts.append(f"  - Generated: {self.created_at.isoformat()}")
        parts.append(f"  - Tool: Claude Deno Debugger Skill")

        if self.breadcrumbs:
            summary = self.breadcrumbs.get_summary()
            parts.append(
                f"  - Investigation Duration: {summary['duration_seconds']:.1f}s"
            )
            parts.append(f"  - Breadcrumbs Recorded: {summary['breadcrumb_count']}")

        return "\n".join(parts)

    def save(self, output_path: str):
        """
        Save the report to a file.

        Args:
            output_path: Output file path (.org)
        """
        content = self.generate()

        # Ensure .org extension
        if not output_path.endswith(".org"):
            output_path += ".org"

        with open(output_path, "w") as f:
            f.write(content)

        print(f"Report saved to {output_path}")
        print(f"Open in Emacs org-mode for full functionality (executable code blocks)")

        return output_path


def create_quick_report(
    title: str,
    summary: str,
    breadcrumbs,
    findings: List[Dict],
    recommendations: List[Dict],
    output_path: str,
) -> str:
    """
    Quickly create a complete report with common sections.

    Args:
        title: Report title
        summary: Executive summary text
        breadcrumbs: Breadcrumbs object
        findings: List of findings dicts
        recommendations: List of recommendations dicts
        output_path: Output file path

    Returns:
        Path to saved report
    """
    report = OrgReport(title, breadcrumbs)

    report.add_summary(summary)

    # Add key findings
    report.add_section("Key Findings", "", level=1)
    for finding in findings:
        report.add_finding(**finding)

    # Add timeline
    report.add_section("Investigation Timeline", "", level=1)
    report.add_timeline()

    # Add recommendations
    report.add_recommendations(recommendations)

    return report.save(output_path)


if __name__ == "__main__":
    print("Org Report - Example Usage")
    print("===========================")
    print()
    print("# Create report")
    print("from scripts.breadcrumbs import Breadcrumbs")
    print()
    print("bc = Breadcrumbs('memory_leak')")
    print("# ... add breadcrumbs during investigation ...")
    print()
    print("report = OrgReport('Memory Leak Investigation', bc)")
    print()
    print("# Add summary")
    print("report.add_summary('''")
    print("Found memory leak in upload handler. ArrayBuffer objects")
    print("are retained in closure and not released after processing.")
    print("Fix: Explicitly clear buffer reference after upload completes.")
    print("''')")
    print()
    print("# Add timeline")
    print("report.add_timeline()")
    print()
    print("# Add code snippet")
    print("report.add_code_snippet('typescript', '''")
    print("async function handleUpload(file: File) {")
    print("  const buffer = await file.arrayBuffer();")
    print("  // BUG: buffer retained in this closure")
    print("  return processBuffer(buffer);")
    print("}")
    print("''', caption='src/upload.ts:42')")
    print()
    print("# Add analysis")
    print("report.add_analysis('Heap Growth', '''")
    print("import pandas as pd")
    print("from scripts.heap_analyzer import compare_snapshots")
    print()
    print("before = load_snapshot('data/before.heapsnapshot')")
    print("after = load_snapshot('data/after.heapsnapshot')")
    print("growth = compare_snapshots(before, after)")
    print("print(growth.head())")
    print("''', data_path='data/')")
    print()
    print("# Add recommendations")
    print("report.add_recommendations([")
    print("    {")
    print("        'title': 'Clear buffer references',")
    print("        'description': 'Explicitly null buffer after processing',")
    print("        'priority': 'high'")
    print("    }")
    print("])")
    print()
    print("# Save")
    print("report.save('investigation_report.org')")
