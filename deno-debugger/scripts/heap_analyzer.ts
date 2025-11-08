/**
 * Heap snapshot analysis for memory leak detection.
 *
 * Provides tools to:
 * - Parse V8 heap snapshots
 * - Compare snapshots to find memory growth
 * - Find retaining paths (why objects are kept alive)
 * - Detect leak patterns
 * - Analyze heap usage
 */

import type {
  HeapComparisonResult as _HeapComparisonResult,
  HeapEdge,
  HeapNode,
  HeapSnapshotData,
  RetainingPath,
} from "./types.ts";
import type { CDPClient } from "./cdp_client.ts";

export interface NodeSizeSummary {
  nodeType: string;
  count: number;
  totalSize: number;
  avgSize: number;
}

export interface ComparisonRow {
  nodeType: string;
  name: string;
  countBefore: number;
  countAfter: number;
  countDelta: number;
  sizeBefore: number;
  sizeAfter: number;
  sizeDelta: number;
}

export interface LeakCandidate {
  nodeType: string;
  name: string;
  totalGrowthMB: number;
  growthPerSnapshotMB: number;
  snapshotsGrowing: number;
}

export interface LargestObject {
  nodeId: number;
  nodeType: string;
  name: string;
  sizeBytes: number;
  sizeMB: number;
}

export class HeapSnapshot {
  public rawData: HeapSnapshotData;
  public snapshot: HeapSnapshotData["snapshot"];
  public nodes: HeapNode[] = [];
  public edges: HeapEdge[] = [];
  public strings: string[];
  public traceFunctionInfos: number[];
  public traceTree: number[];
  public nodeById: Map<number, HeapNode>;
  public retainedBy: Map<number, Array<[number, HeapEdge]>>;

  constructor(snapshotData: HeapSnapshotData) {
    this.rawData = snapshotData;
    this.snapshot = snapshotData.snapshot;
    this.strings = snapshotData.strings || [];
    this.traceFunctionInfos = snapshotData.trace_function_infos || [];
    this.traceTree = snapshotData.trace_tree || [];

    // Parse nodes and edges
    this.parseNodes();
    this.parseEdges();

    // Build indexes for fast lookup
    this.nodeById = new Map(this.nodes.map((n) => [n.id, n]));
    this.retainedBy = new Map();
    this.buildRetentionIndex();
  }

  private parseNodes(): void {
    const meta = this.snapshot.meta;
    const nodeFields = meta.node_fields;
    const nodeTypes = meta.node_types[0];

    // Field indices
    const typeIdx = nodeFields.indexOf("type");
    const nameIdx = nodeFields.indexOf("name");
    const idIdx = nodeFields.indexOf("id");
    const selfSizeIdx = nodeFields.indexOf("self_size");
    const edgeCountIdx = nodeFields.indexOf("edge_count");
    const traceNodeIdIdx = nodeFields.indexOf("trace_node_id");

    const nodeFieldCount = nodeFields.length;
    const nodesData = this.rawData.nodes;

    for (let i = 0; i < nodesData.length; i += nodeFieldCount) {
      const node: HeapNode = {
        type: nodeTypes[nodesData[i + typeIdx]],
        name: this.strings[nodesData[i + nameIdx]],
        id: nodesData[i + idIdx],
        self_size: nodesData[i + selfSizeIdx],
        edge_count: nodesData[i + edgeCountIdx],
        trace_node_id: nodesData[i + traceNodeIdIdx],
        index: i,
      };
      this.nodes.push(node);
    }
  }

  private parseEdges(): void {
    const meta = this.snapshot.meta;
    const edgeFields = meta.edge_fields;
    const edgeTypes = meta.edge_types[0];

    // Field indices
    const typeIdx = edgeFields.indexOf("type");
    const nameOrIndexIdx = edgeFields.indexOf("name_or_index");
    const toNodeIdx = edgeFields.indexOf("to_node");

    const edgeFieldCount = edgeFields.length;
    const edgesData = this.rawData.edges;

    let fromNodeIndex = 0;

    for (let i = 0; i < edgesData.length; i += edgeFieldCount) {
      // Find which node this edge belongs to
      while (
        fromNodeIndex < this.nodes.length - 1 &&
        i >= this.calculateEdgeStartIndex(fromNodeIndex + 1)
      ) {
        fromNodeIndex++;
      }

      const edgeType = edgeTypes[edgesData[i + typeIdx]];
      let nameOrIndex: string | number = edgesData[i + nameOrIndexIdx];

      // Name or index depends on edge type
      if (edgeType === "property" || edgeType === "internal") {
        nameOrIndex = this.strings[nameOrIndex];
      }

      const edge: HeapEdge = {
        type: edgeType,
        name_or_index: nameOrIndex,
        to_node: edgesData[i + toNodeIdx],
        from_node: fromNodeIndex < this.nodes.length ? this.nodes[fromNodeIndex].id : 0,
      };
      this.edges.push(edge);
    }
  }

  private calculateEdgeStartIndex(nodeIndex: number): number {
    // Calculate where this node's edges start in the edges array
    let edgeCount = 0;
    for (let i = 0; i < nodeIndex && i < this.nodes.length; i++) {
      edgeCount += this.nodes[i].edge_count;
    }
    return edgeCount * this.snapshot.meta.edge_fields.length;
  }

  private buildRetentionIndex(): void {
    const nodeFieldCount = this.snapshot.meta.node_fields.length;

    let edgeIdx = 0;
    for (const node of this.nodes) {
      for (let i = 0; i < node.edge_count; i++) {
        if (edgeIdx < this.edges.length) {
          const edge = this.edges[edgeIdx];
          // Map target node -> (source node, edge)
          const targetNodeIdx = Math.floor(edge.to_node / nodeFieldCount);
          if (targetNodeIdx < this.nodes.length) {
            const targetNode = this.nodes[targetNodeIdx];
            if (!this.retainedBy.has(targetNode.id)) {
              this.retainedBy.set(targetNode.id, []);
            }
            this.retainedBy.get(targetNode.id)!.push([node.id, edge]);
          }
          edgeIdx++;
        }
      }
    }
  }

  getNodesByType(nodeType: string): HeapNode[] {
    return this.nodes.filter((n) => n.type === nodeType);
  }

  getNodesByName(name: string): HeapNode[] {
    return this.nodes.filter((n) => n.name === name);
  }

  getNodeSizeSummary(): NodeSizeSummary[] {
    const summary = new Map<string, { count: number; totalSize: number }>();

    for (const node of this.nodes) {
      const stats = summary.get(node.type) || { count: 0, totalSize: 0 };
      stats.count++;
      stats.totalSize += node.self_size;
      summary.set(node.type, stats);
    }

    const result: NodeSizeSummary[] = [];
    for (const [nodeType, stats] of summary.entries()) {
      result.push({
        nodeType,
        count: stats.count,
        totalSize: stats.totalSize,
        avgSize: stats.count > 0 ? stats.totalSize / stats.count : 0,
      });
    }

    return result.sort((a, b) => b.totalSize - a.totalSize);
  }

  findRetainingPath(nodeId: number, maxDepth = 10): RetainingPath | null {
    // BFS from node backwards to root
    const visited = new Set<number>();
    const queue: Array<[number, Array<{ node: HeapNode; edge: HeapEdge }>]> = [[nodeId, []]];

    while (queue.length > 0) {
      const [currentId, path] = queue.shift()!;

      if (visited.has(currentId) || path.length > maxDepth) {
        continue;
      }
      visited.add(currentId);

      const currentNode = this.nodeById.get(currentId);
      if (!currentNode) {
        continue;
      }

      // Check if this is a root node
      if (currentNode.type === "synthetic" && currentNode.name === "(GC roots)") {
        return {
          path,
          distance: path.length,
        };
      }

      // Follow retainers
      const retainers = this.retainedBy.get(currentId) || [];
      for (const [retainerId, edge] of retainers) {
        const retainerNode = this.nodeById.get(retainerId);
        if (retainerNode) {
          const newPath = [{ node: retainerNode, edge }, ...path];
          queue.push([retainerId, newPath]);
        }
      }
    }

    return null; // No path found
  }
}

export async function loadSnapshot(filePath: string): Promise<HeapSnapshot> {
  const data = JSON.parse(await Deno.readTextFile(filePath)) as HeapSnapshotData;
  return new HeapSnapshot(data);
}

export async function captureSnapshot(
  cdpClient: CDPClient,
  outputPath?: string,
): Promise<HeapSnapshot> {
  console.log("Capturing heap snapshot... (this may take a few seconds)");
  const snapshotJson = await cdpClient.takeHeapSnapshot();

  if (outputPath) {
    await Deno.writeTextFile(outputPath, snapshotJson);
    console.log(`Snapshot saved to ${outputPath}`);
  }

  const data = JSON.parse(snapshotJson) as HeapSnapshotData;
  return new HeapSnapshot(data);
}

export function compareSnapshots(before: HeapSnapshot, after: HeapSnapshot): ComparisonRow[] {
  // Build summaries by (type, name)
  function summarize(snapshot: HeapSnapshot) {
    const summary = new Map<string, { count: number; size: number }>();
    for (const node of snapshot.nodes) {
      const key = `${node.type}|${node.name}`;
      const stats = summary.get(key) || { count: 0, size: 0 };
      stats.count++;
      stats.size += node.self_size;
      summary.set(key, stats);
    }
    return summary;
  }

  const beforeSummary = summarize(before);
  const afterSummary = summarize(after);

  // Find all keys that exist in either snapshot
  const allKeys = new Set([...beforeSummary.keys(), ...afterSummary.keys()]);

  const data: ComparisonRow[] = [];
  for (const key of allKeys) {
    const [nodeType, name] = key.split("|");
    const beforeStats = beforeSummary.get(key) || { count: 0, size: 0 };
    const afterStats = afterSummary.get(key) || { count: 0, size: 0 };

    const countDelta = afterStats.count - beforeStats.count;
    const sizeDelta = afterStats.size - beforeStats.size;

    // Only include if there's actual growth
    if (countDelta > 0 || sizeDelta > 0) {
      data.push({
        nodeType,
        name,
        countBefore: beforeStats.count,
        countAfter: afterStats.count,
        countDelta,
        sizeBefore: beforeStats.size,
        sizeAfter: afterStats.size,
        sizeDelta,
      });
    }
  }

  return data.sort((a, b) => b.sizeDelta - a.sizeDelta);
}

export function detectLeaks(
  snapshots: HeapSnapshot[],
  thresholdMB = 1.0,
): LeakCandidate[] {
  if (snapshots.length < 2) {
    return [];
  }

  // Track growth trends
  const growthTrends = new Map<string, number[]>();

  for (let i = 0; i < snapshots.length - 1; i++) {
    const comparison = compareSnapshots(snapshots[i], snapshots[i + 1]);
    for (const row of comparison) {
      const key = `${row.nodeType}|${row.name}`;
      const deltas = growthTrends.get(key) || [];
      deltas.push(row.sizeDelta);
      growthTrends.set(key, deltas);
    }
  }

  // Find objects with consistent growth
  const leaks: LeakCandidate[] = [];
  const thresholdBytes = thresholdMB * 1024 * 1024;

  for (const [key, deltas] of growthTrends.entries()) {
    // Check if consistently growing
    if (deltas.every((d) => d > 0)) {
      const totalGrowth = deltas.reduce((sum, d) => sum + d, 0);
      if (totalGrowth > thresholdBytes) {
        const [nodeType, name] = key.split("|");
        leaks.push({
          nodeType,
          name,
          totalGrowthMB: totalGrowth / (1024 * 1024),
          growthPerSnapshotMB: (totalGrowth / deltas.length) / (1024 * 1024),
          snapshotsGrowing: deltas.length,
        });
      }
    }
  }

  return leaks.sort((a, b) => b.totalGrowthMB - a.totalGrowthMB);
}

export function findLargestObjects(snapshot: HeapSnapshot, limit = 20): LargestObject[] {
  const data: LargestObject[] = [];

  for (const node of snapshot.nodes) {
    if (node.self_size > 0) {
      data.push({
        nodeId: node.id,
        nodeType: node.type,
        name: node.name,
        sizeBytes: node.self_size,
        sizeMB: node.self_size / (1024 * 1024),
      });
    }
  }

  return data.sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, limit);
}

// ============================================================================
// CLI Usage
// ============================================================================

if (import.meta.main) {
  console.log("Heap Analyzer - Example Usage");
  console.log("==============================");
  console.log();
  console.log("// Load snapshot from file");
  console.log("const snapshot = await loadSnapshot('heap.heapsnapshot');");
  console.log();
  console.log("// Get size summary by type");
  console.log("const summary = snapshot.getNodeSizeSummary();");
  console.log("console.table(summary);");
  console.log();
  console.log("// Find largest objects");
  console.log("const large = findLargestObjects(snapshot);");
  console.log("console.table(large);");
  console.log();
  console.log("// Compare two snapshots");
  console.log("const before = await loadSnapshot('before.heapsnapshot');");
  console.log("const after = await loadSnapshot('after.heapsnapshot');");
  console.log("const growth = compareSnapshots(before, after);");
  console.log("console.table(growth.slice(0, 10));");
  console.log();
  console.log("// Detect leaks over time");
  console.log("const snapshots = await Promise.all([");
  console.log("  loadSnapshot('snap_0.heapsnapshot'),");
  console.log("  loadSnapshot('snap_1.heapsnapshot'),");
  console.log("  loadSnapshot('snap_2.heapsnapshot'),");
  console.log("]);");
  console.log("const leaks = detectLeaks(snapshots);");
  console.log("console.table(leaks);");
}
