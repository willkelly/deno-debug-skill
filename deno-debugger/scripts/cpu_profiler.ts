/**
 * CPU profiling and performance analysis.
 *
 * Provides tools to:
 * - Start/stop CPU profiling via CDP
 * - Parse V8 CPU profiles
 * - Analyze hot paths and expensive functions
 * - Detect async/await bottlenecks
 * - Generate performance summaries
 */

import type { CPUCallFrame as _CPUCallFrame, CPUProfileData, CPUProfileNode } from "./types.ts";
import type { CDPClient } from "./cdp_client.ts";

export interface HotFunction {
  functionName: string;
  url: string;
  line: number;
  selfSamples: number;
  totalSamples: number;
  selfPct: number;
  totalPct: number;
  bailoutReason?: string;
  deoptReason?: string;
}

export interface CallTreeNode {
  function: string;
  url: string;
  line: number;
  selfSamples: number;
  totalSamples: number;
  children: CallTreeNode[];
}

export interface OptimizationIssue {
  functionName: string;
  url: string;
  line: number;
  selfSamples: number;
  totalSamples: number;
  issues: string;
}

export interface TimingSummary {
  totalTimeMs: number;
  totalTimeS: number;
  sampleCount: number;
  sampleRateHz: number;
}

export interface HotPath {
  function: string;
  url: string;
  line: number;
  pct: number;
  samples: number;
  callPath: string;
}

export interface FunctionTimes {
  function: string;
  url: string;
  line: number;
  selfTimePct: number;
  totalTimePct: number;
  selfSamples: number;
  totalSamples: number;
}

export interface AsyncAnalysis {
  promiseRelatedPct: number;
  awaitRelatedPct: number;
  callbackRelatedPct: number;
  promiseNodeCount: number;
  awaitNodeCount: number;
  callbackNodeCount: number;
  analysis: string;
}

export class CPUProfile {
  public rawData: CPUProfileData;
  public nodes: CPUProfileNode[] = [];
  public nodeById: Map<number, CPUProfileNode>;
  public startTime: number;
  public endTime: number;
  public samples: number[];
  public timeDeltas: number[];
  public childrenMap: Map<number, number[]>;
  public parentMap: Map<number, number>;
  public totalSamples: number = 0;
  public sampleCounts: Map<number, number>;
  public inclusiveSamples: Map<number, number>;

  constructor(profileData: CPUProfileData) {
    this.rawData = profileData;
    this.nodes = profileData.nodes || [];
    this.startTime = profileData.startTime || 0;
    this.endTime = profileData.endTime || 0;
    this.samples = profileData.samples || [];
    this.timeDeltas = profileData.timeDeltas || [];

    // Build indexes
    this.nodeById = new Map(this.nodes.map((n) => [n.id, n]));
    this.childrenMap = new Map();
    this.parentMap = new Map();
    this.sampleCounts = new Map();
    this.inclusiveSamples = new Map();

    // Build call tree structure
    this.buildCallTree();

    // Calculate sample counts
    this.calculateSampleCounts();
  }

  private buildCallTree(): void {
    for (const node of this.nodes) {
      for (const childId of node.children || []) {
        // Track children
        if (!this.childrenMap.has(node.id)) {
          this.childrenMap.set(node.id, []);
        }
        this.childrenMap.get(node.id)!.push(childId);

        // Track parent
        this.parentMap.set(childId, node.id);
      }
    }
  }

  private calculateSampleCounts(): void {
    this.totalSamples = this.samples.length;

    // Count samples per node
    for (const sample of this.samples) {
      this.sampleCounts.set(sample, (this.sampleCounts.get(sample) || 0) + 1);
    }

    // Calculate inclusive samples (including children)
    for (const node of this.nodes) {
      this.inclusiveSamples.set(node.id, this.getInclusiveSamples(node.id, new Set()));
    }
  }

  private getInclusiveSamples(nodeId: number, visited: Set<number>): number {
    if (visited.has(nodeId)) {
      return 0;
    }
    visited.add(nodeId);

    let count = this.sampleCounts.get(nodeId) || 0;

    for (const childId of this.childrenMap.get(nodeId) || []) {
      count += this.getInclusiveSamples(childId, visited);
    }

    return count;
  }

  getHotFunctions(limit = 20): HotFunction[] {
    const data: HotFunction[] = [];

    for (const node of this.nodes) {
      const selfSamples = node.hitCount || 0;
      const totalSamples = this.inclusiveSamples.get(node.id) || 0;

      if (selfSamples > 0 || totalSamples > 0) {
        data.push({
          functionName: node.callFrame.functionName || "(anonymous)",
          url: node.callFrame.url,
          line: node.callFrame.lineNumber,
          selfSamples,
          totalSamples,
          selfPct: this.totalSamples > 0 ? (selfSamples / this.totalSamples * 100) : 0,
          totalPct: this.totalSamples > 0 ? (totalSamples / this.totalSamples * 100) : 0,
          bailoutReason: node.deoptReason,
          deoptReason: node.deoptReason,
        });
      }
    }

    return data.sort((a, b) => b.totalSamples - a.totalSamples).slice(0, limit);
  }

  getCallTree(rootId?: number, maxDepth = 10): CallTreeNode[] {
    if (rootId === undefined) {
      // Find root node (node with no parent)
      const rootCandidates = this.nodes.filter((n) => !this.parentMap.has(n.id));
      if (rootCandidates.length === 0) {
        return [];
      }
      rootId = rootCandidates[0].id;
    }

    const buildTree = (nodeId: number, depth: number): CallTreeNode | null => {
      if (depth > maxDepth) {
        return null;
      }

      const node = this.nodeById.get(nodeId);
      if (!node) {
        return null;
      }

      const treeNode: CallTreeNode = {
        function: node.callFrame.functionName || "(anonymous)",
        url: node.callFrame.url,
        line: node.callFrame.lineNumber,
        selfSamples: node.hitCount || 0,
        totalSamples: this.inclusiveSamples.get(nodeId) || 0,
        children: [],
      };

      for (const childId of this.childrenMap.get(nodeId) || []) {
        const childTree = buildTree(childId, depth + 1);
        if (childTree) {
          treeNode.children.push(childTree);
        }
      }

      return treeNode;
    };

    const tree = buildTree(rootId, 0);
    return tree ? [tree] : [];
  }

  detectOptimizationIssues(): OptimizationIssue[] {
    const data: OptimizationIssue[] = [];

    for (const node of this.nodes) {
      const issues: string[] = [];
      if (node.deoptReason) {
        issues.push(`Deopt: ${node.deoptReason}`);
      }

      if (issues.length > 0) {
        data.push({
          functionName: node.callFrame.functionName || "(anonymous)",
          url: node.callFrame.url,
          line: node.callFrame.lineNumber,
          selfSamples: node.hitCount || 0,
          totalSamples: this.inclusiveSamples.get(node.id) || 0,
          issues: issues.join("; "),
        });
      }
    }

    return data.sort((a, b) => b.totalSamples - a.totalSamples);
  }

  getTimingSummary(): TimingSummary {
    const totalTimeUs = this.endTime - this.startTime;
    const totalTimeMs = totalTimeUs / 1000;

    return {
      totalTimeMs,
      totalTimeS: totalTimeMs / 1000,
      sampleCount: this.totalSamples,
      sampleRateHz: totalTimeMs > 0 ? (this.totalSamples / (totalTimeMs / 1000)) : 0,
    };
  }
}

export async function loadProfile(filePath: string): Promise<CPUProfile> {
  const data = JSON.parse(await Deno.readTextFile(filePath)) as CPUProfileData;
  return new CPUProfile(data);
}

export async function startProfiling(cdpClient: CDPClient): Promise<void> {
  await cdpClient.startProfiling();
  console.log("CPU profiling started");
}

export async function stopProfiling(
  cdpClient: CDPClient,
  outputPath?: string,
): Promise<CPUProfile> {
  const profileData = await cdpClient.stopProfiling();
  console.log("CPU profiling stopped");

  if (outputPath) {
    await Deno.writeTextFile(outputPath, JSON.stringify(profileData, null, 2));
    console.log(`Profile saved to ${outputPath}`);
  }

  return new CPUProfile(profileData);
}

export function analyzeHotPaths(profile: CPUProfile, minPct = 1.0): HotPath[] {
  const hotNodes: HotPath[] = [];

  for (const node of profile.nodes) {
    const totalSamples = profile.inclusiveSamples.get(node.id) || 0;
    const pct = profile.totalSamples > 0 ? (totalSamples / profile.totalSamples * 100) : 0;

    if (pct >= minPct) {
      // Build path from root to this node
      const path: string[] = [];
      let currentId: number | undefined = node.id;

      while (currentId !== undefined) {
        const currentNode = profile.nodeById.get(currentId);
        if (currentNode) {
          path.unshift(`${currentNode.callFrame.functionName}:${currentNode.callFrame.lineNumber}`);
        }
        currentId = profile.parentMap.get(currentId);
      }

      hotNodes.push({
        function: node.callFrame.functionName || "(anonymous)",
        url: node.callFrame.url,
        line: node.callFrame.lineNumber,
        pct,
        samples: totalSamples,
        callPath: path.length > 0 ? path.join(" -> ") : node.callFrame.functionName,
      });
    }
  }

  return hotNodes.sort((a, b) => b.pct - a.pct);
}

export function detectAsyncIssues(profile: CPUProfile): AsyncAnalysis {
  // Look for common async patterns
  const promiseNodes = profile.nodes.filter((n) =>
    n.callFrame.functionName.includes("Promise") ||
    n.callFrame.url.toLowerCase().includes("async")
  );

  const awaitNodes = profile.nodes.filter((n) =>
    n.callFrame.functionName.toLowerCase().includes("await")
  );

  const callbackNodes = profile.nodes.filter((n) =>
    n.callFrame.functionName.toLowerCase().includes("callback")
  );

  const promiseSamples = promiseNodes.reduce(
    (sum, n) => sum + (profile.inclusiveSamples.get(n.id) || 0),
    0,
  );
  const awaitSamples = awaitNodes.reduce(
    (sum, n) => sum + (profile.inclusiveSamples.get(n.id) || 0),
    0,
  );
  const callbackSamples = callbackNodes.reduce(
    (sum, n) => sum + (profile.inclusiveSamples.get(n.id) || 0),
    0,
  );

  const total = profile.totalSamples;

  return {
    promiseRelatedPct: total > 0 ? (promiseSamples / total * 100) : 0,
    awaitRelatedPct: total > 0 ? (awaitSamples / total * 100) : 0,
    callbackRelatedPct: total > 0 ? (callbackSamples / total * 100) : 0,
    promiseNodeCount: promiseNodes.length,
    awaitNodeCount: awaitNodes.length,
    callbackNodeCount: callbackNodes.length,
    analysis: interpretAsyncMetrics(promiseSamples, awaitSamples, callbackSamples, total),
  };
}

function interpretAsyncMetrics(
  promiseSamples: number,
  awaitSamples: number,
  callbackSamples: number,
  total: number,
): string {
  const issues: string[] = [];

  const promisePct = total > 0 ? (promiseSamples / total * 100) : 0;
  if (promisePct > 20) {
    issues.push(
      `High Promise overhead (${
        promisePct.toFixed(1)
      }% of time) - consider reducing async operations`,
    );
  }

  const awaitPct = total > 0 ? (awaitSamples / total * 100) : 0;
  if (awaitPct > 15) {
    issues.push(
      `Significant time in await (${awaitPct.toFixed(1)}%) - check for blocking async operations`,
    );
  }

  const callbackPct = total > 0 ? (callbackSamples / total * 100) : 0;
  if (callbackPct > 10) {
    issues.push(
      `Callback overhead detected (${callbackPct.toFixed(1)}%) - consider using async/await`,
    );
  }

  if (issues.length === 0) {
    return "No significant async performance issues detected";
  }

  return issues.join("; ");
}

export function getFunctionTimes(profile: CPUProfile, urlFilter?: string): FunctionTimes[] {
  const data: FunctionTimes[] = [];

  for (const node of profile.nodes) {
    if (urlFilter && !node.callFrame.url.includes(urlFilter)) {
      continue;
    }

    const selfSamples = node.hitCount || 0;
    const totalSamples = profile.inclusiveSamples.get(node.id) || 0;

    if (totalSamples > 0) {
      data.push({
        function: node.callFrame.functionName || "(anonymous)",
        url: node.callFrame.url,
        line: node.callFrame.lineNumber,
        selfTimePct: profile.totalSamples > 0 ? (selfSamples / profile.totalSamples * 100) : 0,
        totalTimePct: profile.totalSamples > 0 ? (totalSamples / profile.totalSamples * 100) : 0,
        selfSamples,
        totalSamples,
      });
    }
  }

  return data.sort((a, b) => b.totalTimePct - a.totalTimePct);
}

// ============================================================================
// Flamegraph Generation
// ============================================================================

export interface FlameGraphStack {
  name: string;
  value: number;
  children?: FlameGraphStack[];
}

/**
 * Convert CPU profile to flamegraph format (for visualization tools)
 * Output can be used with speedscope, flamegraph.pl, or d3-flame-graph
 */
export function generateFlameGraph(profile: CPUProfile): string {
  const stacks: string[] = [];

  // Build call stacks from samples
  for (const sampleId of profile.samples) {
    const stack: string[] = [];
    let nodeId = sampleId;

    // Walk up the call tree
    while (nodeId !== undefined) {
      const node = profile.nodeById.get(nodeId);
      if (!node) break;

      const funcName = node.callFrame.functionName || "(anonymous)";
      const url = node.callFrame.url.replace(/^file:\/\//, "").split("/").pop() || "";
      const line = node.callFrame.lineNumber;

      stack.unshift(`${funcName} (${url}:${line})`);
      nodeId = profile.parentMap.get(nodeId)!;
    }

    if (stack.length > 0) {
      stacks.push(stack.join(";"));
    }
  }

  // Count occurrences of each unique stack
  const stackCounts = new Map<string, number>();
  for (const stack of stacks) {
    stackCounts.set(stack, (stackCounts.get(stack) || 0) + 1);
  }

  // Output in flamegraph collapsed format
  const lines: string[] = [];
  for (const [stack, count] of stackCounts.entries()) {
    lines.push(`${stack} ${count}`);
  }

  return lines.join("\n");
}

/**
 * Save flamegraph to interactive HTML file
 */
export async function saveFlamegraphHTML(profile: CPUProfile, outputPath: string): Promise<void> {
  const flameData = generateFlameGraph(profile);

  // Simple HTML template with embedded d3 flamegraph
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CPU Profile Flamegraph</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; }
    #chart { width: 100%; height: 100vh; }
    .info { position: absolute; top: 10px; left: 10px; background: rgba(255,255,255,0.9);
            padding: 10px; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="info">
    <strong>CPU Profile Flamegraph</strong><br>
    Total samples: ${profile.totalSamples}<br>
    Duration: ${((profile.endTime - profile.startTime) / 1000000).toFixed(2)}s<br>
    <br>
    Click on a frame to zoom in. Reset to see full chart.<br>
    Width = CPU time. Hover for details.
  </div>
  <pre id="chart">${flameData}</pre>
  <script>
    // For now, display as text. For interactive visualization:
    // 1. Use https://www.speedscope.app (upload .cpuprofile directly)
    // 2. Or install: npm install -g flamegraph
    //    then: cat collapsed.txt | flamegraph > output.svg
  </script>
</body>
</html>`;

  await Deno.writeTextFile(outputPath, html);
  console.log(`Flamegraph data saved to ${outputPath}`);
  console.log(`\nFor interactive visualization:`);
  console.log(`  1. Upload .cpuprofile to https://www.speedscope.app`);
  console.log(`  2. Or use: flamegraph.pl ${outputPath.replace('.html', '.txt')}`);
}

// ============================================================================
// Complexity Analysis
// ============================================================================

export interface ComplexityIssue {
  functionName: string;
  url: string;
  line: number;
  selfTimePct: number;
  suspectedComplexity: string;
  evidence: string[];
  severity: "critical" | "warning" | "info";
}

/**
 * Analyze CPU profile for algorithmic complexity issues
 * Detects likely O(n²), O(n³), or worse patterns
 */
export function analyzeComplexity(profile: CPUProfile): ComplexityIssue[] {
  const issues: ComplexityIssue[] = [];
  const hot = profile.getHotFunctions();

  for (const func of hot) {
    // Skip if not consuming significant time
    if (func.selfPct < 5.0) continue;

    const evidence: string[] = [];
    let suspectedComplexity = "O(n)";
    let severity: "critical" | "warning" | "info" = "info";

    // Heuristic 1: Very high self time suggests nested loops
    if (func.selfPct > 50) {
      evidence.push(`Consumes ${func.selfPct.toFixed(1)}% of total CPU time`);
      suspectedComplexity = "O(n²) or worse";
      severity = "critical";
    } else if (func.selfPct > 30) {
      evidence.push(`Consumes ${func.selfPct.toFixed(1)}% of total CPU time`);
      suspectedComplexity = "Possibly O(n²)";
      severity = "warning";
    }

    // Heuristic 2: Function name suggests iteration
    const funcName = func.functionName.toLowerCase();
    const iterationKeywords = ["loop", "iterate", "each", "map", "filter", "reduce", "compare", "check"];
    const matchedKeywords = iterationKeywords.filter(kw => funcName.includes(kw));

    if (matchedKeywords.length > 0) {
      evidence.push(`Function name suggests iteration: "${func.functionName}"`);
    }

    // Heuristic 3: Deep call stacks with loops often indicate nested iteration
    if (func.totalPct > func.selfPct * 1.5) {
      const childTime = func.totalPct - func.selfPct;
      evidence.push(`Spends ${childTime.toFixed(1)}% in child functions (possible nested loops)`);
    }

    // Heuristic 4: Common O(n²) function names
    const quadraticPatterns = [
      "compare", "checksum", "validate", "match", "find",
      "contains", "indexof", "search", "sort", "calc"
    ];

    for (const pattern of quadraticPatterns) {
      if (funcName.includes(pattern) && func.selfPct > 20) {
        evidence.push(`Function name "${func.functionName}" with high CPU suggests nested iteration`);
        suspectedComplexity = "Likely O(n²)";
        severity = "critical";
        break;
      }
    }

    if (evidence.length > 0) {
      issues.push({
        functionName: func.functionName,
        url: func.url,
        line: func.line,
        selfTimePct: func.selfPct,
        suspectedComplexity,
        evidence,
        severity,
      });
    }
  }

  return issues.sort((a, b) => b.selfTimePct - a.selfTimePct);
}

/**
 * Pretty-print complexity analysis
 */
export function printComplexityAnalysis(issues: ComplexityIssue[]): void {
  if (issues.length === 0) {
    console.log("\n✅ No obvious complexity issues detected");
    return;
  }

  console.log("\n" + "=".repeat(70));
  console.log("ALGORITHMIC COMPLEXITY ANALYSIS");
  console.log("=".repeat(70));

  for (const issue of issues) {
    const icon = issue.severity === "critical" ? "🔴" :
                 issue.severity === "warning" ? "⚠️" : "ℹ️";

    console.log(`\n${icon} ${issue.functionName}`);
    console.log(`   Location: ${issue.url}:${issue.line}`);
    console.log(`   CPU Time: ${issue.selfTimePct.toFixed(1)}%`);
    console.log(`   Suspected: ${issue.suspectedComplexity}`);
    console.log(`   Evidence:`);

    for (const ev of issue.evidence) {
      console.log(`     • ${ev}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("RECOMMENDATIONS");
  console.log("=".repeat(70));

  const critical = issues.filter(i => i.severity === "critical");
  if (critical.length > 0) {
    console.log("\n🔴 Critical (investigate immediately):");
    for (const issue of critical) {
      console.log(`   • ${issue.functionName} - ${issue.suspectedComplexity}`);
      console.log(`     ${issue.url}:${issue.line}`);
    }
  }

  const warnings = issues.filter(i => i.severity === "warning");
  if (warnings.length > 0) {
    console.log("\n⚠️  Warnings (review for optimization):");
    for (const issue of warnings) {
      console.log(`   • ${issue.functionName} - ${issue.suspectedComplexity}`);
    }
  }

  console.log("\nCommon O(n²) patterns to look for:");
  console.log("  • Nested loops over the same data");
  console.log("  • Array.indexOf/includes inside loops");
  console.log("  • Repeated linear searches");
  console.log("  • Comparing every item with every other item");
  console.log("\nSolutions:");
  console.log("  • Use Maps/Sets for O(1) lookup instead of arrays");
  console.log("  • Cache results instead of recomputing");
  console.log("  • Use more efficient algorithms (sort + binary search, etc.)");
  console.log("  • Break down processing into smaller chunks");
  console.log("=".repeat(70));
}

// ============================================================================
// CLI Usage
// ============================================================================

if (import.meta.main) {
  console.log("CPU Profiler - Example Usage");
  console.log("=============================");
  console.log();
  console.log("// Start profiling");
  console.log("import { CDPClient } from './cdp_client.ts';");
  console.log("const client = new CDPClient('127.0.0.1', 9229);");
  console.log("await client.connect();");
  console.log("await startProfiling(client);");
  console.log();
  console.log("// ... let code run ...");
  console.log();
  console.log("// Stop and analyze");
  console.log("const profile = await stopProfiling(client, 'profile.cpuprofile');");
  console.log("const hot = profile.getHotFunctions();");
  console.log("console.table(hot);");
  console.log();
  console.log("// Find hot paths");
  console.log("const hotPaths = analyzeHotPaths(profile);");
  console.log("console.table(hotPaths);");
  console.log();
  console.log("// Check async issues");
  console.log("const asyncAnalysis = detectAsyncIssues(profile);");
  console.log("console.log(asyncAnalysis);");
}
