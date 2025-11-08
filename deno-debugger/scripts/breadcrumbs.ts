/**
 * Investigation breadcrumbs tracking system.
 *
 * Records the investigation journey:
 * - Hypotheses formed
 * - Tests conducted
 * - Findings discovered
 * - Decisions made
 * - Data captured
 *
 * Enables:
 * - Timeline generation
 * - Reproducible investigations
 * - Comprehensive reporting
 */

import type { Breadcrumb, BreadcrumbType } from "./types.ts";

export interface BreadcrumbData {
  investigationName: string;
  startTime: string;
  breadcrumbs: Breadcrumb[];
  summary: InvestigationSummary;
}

export interface InvestigationSummary {
  investigationName: string;
  startTime: string;
  durationSeconds: number;
  breadcrumbCount: number;
  typeCounts: Record<string, number>;
}

export class Breadcrumbs {
  public investigationName: string;
  public breadcrumbs: Breadcrumb[] = [];
  public startTime: Date;

  constructor(investigationName?: string) {
    this.startTime = new Date();
    this.investigationName = investigationName ||
      `investigation_${this.startTime.toISOString().replace(/[:.]/g, "-")}`;
  }

  private addBreadcrumb(
    type: BreadcrumbType,
    description: string,
    data?: Record<string, unknown>,
    tags?: string[],
  ): Breadcrumb {
    const breadcrumb: Breadcrumb = {
      timestamp: new Date().toISOString(),
      type,
      description,
      data: data || {},
      tags: tags || [],
    };
    this.breadcrumbs.push(breadcrumb);
    return breadcrumb;
  }

  addHypothesis(description: string, rationale?: string, tags?: string[]): Breadcrumb {
    const details: Record<string, unknown> = {};
    if (rationale) {
      details.rationale = rationale;
    }
    return this.addBreadcrumb("hypothesis", description, details, tags);
  }

  addTest(
    testName: string,
    description: string,
    details?: Record<string, unknown>,
    tags?: string[],
  ): Breadcrumb {
    const testDetails = { ...details };
    testDetails.test_name = testName;
    return this.addBreadcrumb("test", description, testDetails, tags);
  }

  addFinding(
    finding: string,
    data?: Record<string, unknown>,
    severity?: "info" | "warning" | "critical",
    tags?: string[],
  ): Breadcrumb {
    const details = { ...data };
    if (severity) {
      details.severity = severity;
    }
    return this.addBreadcrumb("finding", finding, details, tags);
  }

  addDecision(
    decision: string,
    rationale: string,
    alternatives?: string[],
    tags?: string[],
  ): Breadcrumb {
    const details: Record<string, unknown> = { rationale };
    if (alternatives) {
      details.alternatives = alternatives;
    }
    return this.addBreadcrumb("decision", decision, details, tags);
  }

  addData(
    dataType: string,
    location: string,
    description?: string,
    metadata?: Record<string, unknown>,
    tags?: string[],
  ): Breadcrumb {
    const details = { ...metadata };
    details.data_type = dataType;
    details.location = location;

    const desc = description || `${dataType} captured at ${location}`;
    return this.addBreadcrumb("finding", desc, details, tags);
  }

  addNote(note: string, tags?: string[]): Breadcrumb {
    return this.addBreadcrumb("finding", note, {}, tags);
  }

  addQuestion(question: string, answer?: string, tags?: string[]): Breadcrumb {
    const details: Record<string, unknown> = {};
    if (answer) {
      details.answer = answer;
    }
    return this.addBreadcrumb("hypothesis", question, details, tags);
  }

  answerQuestion(questionIndex: number, answer: string): void {
    if (questionIndex >= 0 && questionIndex < this.breadcrumbs.length) {
      const crumb = this.breadcrumbs[questionIndex];
      if (crumb.type === "hypothesis") {
        crumb.data = crumb.data || {};
        crumb.data.answer = answer;
        crumb.data.answered_at = new Date().toISOString();
      }
    }
  }

  getTimeline(): Breadcrumb[] {
    return this.breadcrumbs;
  }

  getByType(type: BreadcrumbType): Breadcrumb[] {
    return this.breadcrumbs.filter((bc) => bc.type === type);
  }

  getByTag(tag: string): Breadcrumb[] {
    return this.breadcrumbs.filter((bc) => bc.tags?.includes(tag));
  }

  getSummary(): InvestigationSummary {
    const now = new Date();
    const duration = (now.getTime() - this.startTime.getTime()) / 1000;

    const types: BreadcrumbType[] = ["hypothesis", "test", "finding", "decision"];
    const typeCounts: Record<string, number> = {};
    for (const type of types) {
      typeCounts[type] = this.getByType(type).length;
    }

    return {
      investigationName: this.investigationName,
      startTime: this.startTime.toISOString(),
      durationSeconds: duration,
      breadcrumbCount: this.breadcrumbs.length,
      typeCounts,
    };
  }

  toOrgTimeline(): string {
    const lines: string[] = [
      `* Investigation Timeline: ${this.investigationName}`,
      `  :PROPERTIES:`,
      `  :START_TIME: ${this.startTime.toISOString()}`,
      `  :END:`,
      "",
    ];

    for (let i = 0; i < this.breadcrumbs.length; i++) {
      const bc = this.breadcrumbs[i];
      const ts = new Date(bc.timestamp);
      const orgTs = ts.toISOString().replace("T", " ").substring(0, 16);

      const icon: Record<string, string> = {
        "hypothesis": "❓",
        "test": "🧪",
        "finding": "🔍",
        "decision": "⚡",
      };

      lines.push(`** ${icon[bc.type] || "•"} ${bc.type.toUpperCase()}: ${bc.description}`);
      lines.push(`   [${orgTs}]`);

      if (bc.data && Object.keys(bc.data).length > 0) {
        lines.push("   :PROPERTIES:");
        for (const [key, value] of Object.entries(bc.data)) {
          const valStr = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
          lines.push(`   :${key.toUpperCase()}: ${valStr}`);
        }
        lines.push("   :END:");
      }

      if (bc.tags && bc.tags.length > 0) {
        lines.push(`   Tags: ${bc.tags.join(", ")}`);
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  toMarkdownTimeline(): string {
    const lines: string[] = [
      `# Investigation Timeline: ${this.investigationName}`,
      `Started: ${this.startTime.toISOString()}`,
      "",
    ];

    for (let i = 0; i < this.breadcrumbs.length; i++) {
      const bc = this.breadcrumbs[i];
      const ts = new Date(bc.timestamp);

      const icon: Record<string, string> = {
        "hypothesis": "❓",
        "test": "🧪",
        "finding": "🔍",
        "decision": "⚡",
      };

      lines.push(
        `## ${i + 1}. ${icon[bc.type] || "•"} ${bc.type.toUpperCase()}: ${bc.description}`,
      );
      lines.push(`*${ts.toISOString().replace("T", " ").substring(0, 19)}*`);
      lines.push("");

      if (bc.data && Object.keys(bc.data).length > 0) {
        for (const [key, value] of Object.entries(bc.data)) {
          lines.push(`- **${key}**: ${value}`);
        }
        lines.push("");
      }

      if (bc.tags && bc.tags.length > 0) {
        lines.push(`Tags: \`${bc.tags.join(", ")}\``);
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  async save(filePath: string): Promise<void> {
    const data: BreadcrumbData = {
      investigationName: this.investigationName,
      startTime: this.startTime.toISOString(),
      breadcrumbs: this.breadcrumbs,
      summary: this.getSummary(),
    };

    await Deno.writeTextFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Breadcrumbs saved to ${filePath}`);
  }

  static async load(filePath: string): Promise<Breadcrumbs> {
    const content = await Deno.readTextFile(filePath);
    const data = JSON.parse(content) as BreadcrumbData;

    const bc = new Breadcrumbs(data.investigationName);
    bc.startTime = new Date(data.startTime);
    bc.breadcrumbs = data.breadcrumbs;

    return bc;
  }
}

// ============================================================================
// CLI Usage
// ============================================================================

if (import.meta.main) {
  console.log("Breadcrumbs - Example Usage");
  console.log("============================");
  console.log();
  console.log("// Initialize tracking");
  console.log("const bc = new Breadcrumbs('memory_leak_investigation');");
  console.log();
  console.log("// Record hypothesis");
  console.log("bc.addHypothesis(");
  console.log("  'Upload handler retains file buffers in closure',");
  console.log("  'Heap shows growing ArrayBuffer objects'");
  console.log(");");
  console.log();
  console.log("// Record test");
  console.log("bc.addTest(");
  console.log("  'heap_snapshot_comparison',");
  console.log("  'Compare heap before and after 10 uploads',");
  console.log("  { snapshots: ['before.heap', 'after.heap'] }");
  console.log(");");
  console.log();
  console.log("// Record finding");
  console.log("bc.addFinding(");
  console.log("  'ArrayBuffer objects growing by 50MB per upload',");
  console.log("  { growth_rate: '50MB/upload', object_count: 1250 },");
  console.log("  'critical'");
  console.log(");");
  console.log();
  console.log("// Save and export");
  console.log("await bc.save('investigation.json');");
  console.log("const timeline = bc.toMarkdownTimeline();");
  console.log("console.log(timeline);");
}
