/**
 * Markdown report generation for debugging investigations.
 *
 * Generates comprehensive reports with:
 * - Executive summary
 * - Problem description
 * - Findings
 * - Root cause analysis
 * - Fix recommendations
 * - Investigation timeline (optional)
 */

import type { Breadcrumb as _Breadcrumb } from "./types.ts";
import type { Breadcrumbs } from "./breadcrumbs.ts";

export interface Finding {
  description: string;
  severity?: "info" | "warning" | "critical";
  details?: string;
  evidence?: string[];
}

export interface CodeSnippet {
  language: string;
  code: string;
  caption?: string;
  filePath?: string;
}

export interface ReportSection {
  heading: string;
  content: string;
  level: number;
}

export class MarkdownReport {
  private title: string;
  private breadcrumbs?: Breadcrumbs;
  private sections: Array<{
    type: string;
    data: unknown;
  }> = [];
  private createdAt: Date;

  constructor(title: string, breadcrumbs?: Breadcrumbs) {
    this.title = title;
    this.breadcrumbs = breadcrumbs;
    this.createdAt = new Date();
  }

  addSummary(text: string): void {
    this.sections.push({
      type: "summary",
      data: { content: text },
    });
  }

  addProblem(description: string): void {
    this.sections.push({
      type: "problem",
      data: { content: description },
    });
  }

  addTimeline(): void {
    if (!this.breadcrumbs) {
      return;
    }

    this.sections.push({
      type: "timeline",
      data: { breadcrumbs: this.breadcrumbs },
    });
  }

  addSection(heading: string, content: string, level = 2): void {
    this.sections.push({
      type: "custom",
      data: { heading, content, level },
    });
  }

  addCodeSnippet(
    language: string,
    code: string,
    caption?: string,
    filePath?: string,
  ): void {
    this.sections.push({
      type: "code",
      data: { language, code, caption, filePath },
    });
  }

  addFinding(finding: Finding): void {
    this.sections.push({
      type: "finding",
      data: finding,
    });
  }

  addRootCause(cause: string, explanation: string): void {
    this.sections.push({
      type: "root_cause",
      data: { cause, explanation },
    });
  }

  addFix(recommendation: string, code?: CodeSnippet): void {
    this.sections.push({
      type: "fix",
      data: { recommendation, code },
    });
  }

  addDataTable(caption: string, data: Array<Record<string, unknown>>): void {
    this.sections.push({
      type: "table",
      data: { caption, rows: data },
    });
  }

  generate(): string {
    const lines: string[] = [];

    // Title
    lines.push(`# ${this.title}`);
    lines.push(`*Generated: ${this.createdAt.toISOString().replace("T", " ").substring(0, 19)}*`);
    lines.push("");

    // Process sections
    for (const section of this.sections) {
      switch (section.type) {
        case "summary":
          lines.push(...this.renderSummary(section.data as { content: string }));
          break;
        case "problem":
          lines.push(...this.renderProblem(section.data as { content: string }));
          break;
        case "timeline":
          lines.push(...this.renderTimeline(section.data as { breadcrumbs: Breadcrumbs }));
          break;
        case "custom":
          lines.push(
            ...this.renderCustomSection(
              section.data as { heading: string; content: string; level: number },
            ),
          );
          break;
        case "code":
          lines.push(
            ...this.renderCodeSnippet(
              section.data as {
                language: string;
                code: string;
                caption?: string;
                filePath?: string;
              },
            ),
          );
          break;
        case "finding":
          lines.push(...this.renderFinding(section.data as Finding));
          break;
        case "root_cause":
          lines.push(
            ...this.renderRootCause(section.data as { cause: string; explanation: string }),
          );
          break;
        case "fix":
          lines.push(
            ...this.renderFix(section.data as { recommendation: string; code?: CodeSnippet }),
          );
          break;
        case "table":
          lines.push(
            ...this.renderDataTable(
              section.data as { caption: string; rows: Array<Record<string, unknown>> },
            ),
          );
          break;
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private renderSummary(data: { content: string }): string[] {
    return [
      "## Summary",
      "",
      data.content,
      "",
    ];
  }

  private renderProblem(data: { content: string }): string[] {
    return [
      "## Problem",
      "",
      data.content,
      "",
    ];
  }

  private renderTimeline(data: { breadcrumbs: Breadcrumbs }): string[] {
    return [
      "## Investigation Timeline",
      "",
      ...data.breadcrumbs.toMarkdownTimeline().split("\n").slice(3), // Skip title
      "",
    ];
  }

  private renderCustomSection(data: { heading: string; content: string; level: number }): string[] {
    const prefix = "#".repeat(data.level);
    return [
      `${prefix} ${data.heading}`,
      "",
      data.content,
      "",
    ];
  }

  private renderCodeSnippet(
    data: { language: string; code: string; caption?: string; filePath?: string },
  ): string[] {
    const lines: string[] = [];

    if (data.caption) {
      lines.push(`**${data.caption}**`);
      lines.push("");
    }

    if (data.filePath) {
      lines.push(`File: \`${data.filePath}\``);
      lines.push("");
    }

    lines.push(`\`\`\`${data.language}`);
    lines.push(data.code);
    lines.push("```");
    lines.push("");

    return lines;
  }

  private renderFinding(finding: Finding): string[] {
    const lines: string[] = [];

    const emoji = {
      "info": "ℹ️",
      "warning": "⚠️",
      "critical": "🔴",
    }[finding.severity || "info"] || "•";

    lines.push(`### ${emoji} Finding: ${finding.description}`);
    lines.push("");

    if (finding.details) {
      lines.push(finding.details);
      lines.push("");
    }

    if (finding.evidence && finding.evidence.length > 0) {
      lines.push("**Evidence:**");
      for (const item of finding.evidence) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }

    return lines;
  }

  private renderRootCause(data: { cause: string; explanation: string }): string[] {
    return [
      "## Root Cause",
      "",
      `**${data.cause}**`,
      "",
      data.explanation,
      "",
    ];
  }

  private renderFix(data: { recommendation: string; code?: CodeSnippet }): string[] {
    const lines: string[] = [
      "## Fix",
      "",
      data.recommendation,
      "",
    ];

    if (data.code) {
      lines.push(...this.renderCodeSnippet(data.code));
    }

    return lines;
  }

  private renderDataTable(
    data: { caption: string; rows: Array<Record<string, unknown>> },
  ): string[] {
    const lines: string[] = [];

    if (data.caption) {
      lines.push(`**${data.caption}**`);
      lines.push("");
    }

    if (data.rows.length === 0) {
      lines.push("*No data*");
      return lines;
    }

    // Get column names
    const columns = Object.keys(data.rows[0]);

    // Header row
    lines.push(`| ${columns.join(" | ")} |`);
    lines.push(`| ${columns.map(() => "---").join(" | ")} |`);

    // Data rows
    for (const row of data.rows) {
      const values = columns.map((col) => {
        const val = row[col];
        if (typeof val === "number") {
          return val.toLocaleString();
        }
        return String(val || "");
      });
      lines.push(`| ${values.join(" | ")} |`);
    }

    lines.push("");

    return lines;
  }

  async save(filePath: string): Promise<void> {
    const content = this.generate();
    await Deno.writeTextFile(filePath, content);
    console.log(`Report saved to ${filePath}`);
  }
}

// ============================================================================
// CLI Usage
// ============================================================================

if (import.meta.main) {
  console.log("Markdown Report Generator - Example Usage");
  console.log("==========================================");
  console.log();
  console.log("// Create a report");
  console.log("import { Breadcrumbs } from './breadcrumbs.ts';");
  console.log("const bc = new Breadcrumbs('memory_leak_investigation');");
  console.log("bc.addHypothesis('Upload handler retains file buffers');");
  console.log("bc.addFinding('ArrayBuffer growing by 50MB per upload', {}, 'critical');");
  console.log();
  console.log("const report = new MarkdownReport('Memory Leak Investigation', bc);");
  console.log();
  console.log("// Add summary");
  console.log("report.addSummary(");
  console.log("  'Found memory leak in file upload handler. Each upload leaks 50MB.'");
  console.log(");");
  console.log();
  console.log("// Add problem description");
  console.log("report.addProblem(");
  console.log("  'Memory usage grows continuously with each file upload and never stabilizes.'");
  console.log(");");
  console.log();
  console.log("// Add findings");
  console.log("report.addFinding({");
  console.log("  description: 'ArrayBuffer objects not being released',");
  console.log("  severity: 'critical',");
  console.log("  evidence: ['Heap snapshot shows 500+ retained ArrayBuffers']");
  console.log("});");
  console.log();
  console.log("// Add root cause");
  console.log("report.addRootCause(");
  console.log("  'Event listeners not cleaned up',");
  console.log("  'Upload handler attaches event listeners but never removes them.'");
  console.log(");");
  console.log();
  console.log("// Add fix");
  console.log("report.addFix(");
  console.log("  'Remove event listeners in cleanup function',");
  console.log("  { language: 'typescript', code: 'cleanup() { this.removeAllListeners(); }' }");
  console.log(");");
  console.log();
  console.log("// Save report");
  console.log("await report.save('REPORT.md');");
}
