/**
 * Type definitions for V8 Inspector Protocol and debugging data structures.
 */

// ============================================================================
// Chrome DevTools Protocol (CDP) Types
// ============================================================================

export interface CDPRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface CDPResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface CDPEvent {
  method: string;
  params?: Record<string, unknown>;
}

export interface CDPTarget {
  description: string;
  devtoolsFrontendUrl: string;
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

export interface Location {
  scriptId: string;
  lineNumber: number;
  columnNumber?: number;
}

export interface CallFrame {
  callFrameId: string;
  functionName: string;
  location: Location;
  url: string;
  scopeChain: Scope[];
  this: RemoteObject;
}

export interface Scope {
  type: string;
  object: RemoteObject;
  name?: string;
}

export interface RemoteObject {
  type: string;
  subtype?: string;
  className?: string;
  value?: unknown;
  description?: string;
  objectId?: string;
}

export interface BreakpointLocation {
  breakpointId: string;
  location: Location;
}

// ============================================================================
// V8 Heap Snapshot Types
// ============================================================================

export interface HeapSnapshotMeta {
  node_fields: string[];
  node_types: string[][];
  edge_fields: string[];
  edge_types: string[][];
  trace_function_info_fields?: string[];
  trace_node_fields?: string[];
  sample_fields?: string[];
  location_fields?: string[];
}

export interface HeapSnapshotData {
  snapshot: {
    meta: HeapSnapshotMeta;
    node_count: number;
    edge_count: number;
    trace_function_count?: number;
  };
  nodes: number[];
  edges: number[];
  trace_function_infos?: number[];
  trace_tree?: number[];
  samples?: number[];
  locations?: number[];
  strings: string[];
}

export interface HeapNode {
  type: string;
  name: string;
  id: number;
  self_size: number;
  edge_count: number;
  trace_node_id: number;
  index: number; // Position in nodes array
}

export interface HeapEdge {
  type: string;
  name_or_index: string | number;
  to_node: number;
  from_node: number;
}

export interface RetainingPath {
  path: Array<{ node: HeapNode; edge: HeapEdge }>;
  distance: number;
}

export interface HeapComparisonResult {
  added: HeapNode[];
  removed: HeapNode[];
  grown: Array<{ node: HeapNode; sizeDelta: number }>;
  totalGrowth: number;
}

// ============================================================================
// V8 CPU Profile Types
// ============================================================================

export interface CPUCallFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

export interface CPUProfileNode {
  id: number;
  callFrame: CPUCallFrame;
  hitCount: number;
  children?: number[];
  deoptReason?: string;
  positionTicks?: Array<{
    line: number;
    ticks: number;
  }>;
}

export interface CPUProfileData {
  nodes: CPUProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

export interface HotFunction {
  node: CPUProfileNode;
  selfTime: number;
  totalTime: number;
  percentage: number;
}

export interface CallTreeNode {
  node: CPUProfileNode;
  selfTime: number;
  totalTime: number;
  children: CallTreeNode[];
}

// ============================================================================
// Investigation Tracking Types
// ============================================================================

export type BreadcrumbType = "hypothesis" | "test" | "finding" | "decision";

export interface Breadcrumb {
  type: BreadcrumbType;
  timestamp: string;
  description: string;
  data?: Record<string, unknown>;
  tags?: string[];
  severity?: "info" | "warning" | "critical";
}

export interface Investigation {
  id: string;
  startTime: string;
  endTime?: string;
  breadcrumbs: Breadcrumb[];
  summary?: string;
}

// ============================================================================
// Report Generation Types
// ============================================================================

export interface ReportSection {
  title: string;
  content: string;
  subsections?: ReportSection[];
}

export interface InvestigationReport {
  title: string;
  summary: string;
  problem: string;
  findings: string[];
  rootCause?: string;
  fix?: string;
  timeline?: Breadcrumb[];
  artifacts: {
    heapSnapshots?: string[];
    cpuProfiles?: string[];
    breadcrumbs?: string;
  };
}

// ============================================================================
// Analysis Result Types
// ============================================================================

export interface HeapAnalysisResult {
  totalSize: number;
  nodeCount: number;
  typeDistribution: Map<string, number>;
  largestObjects: HeapNode[];
  suspiciousPatterns: Array<{
    pattern: string;
    description: string;
    nodes: HeapNode[];
  }>;
}

export interface CPUAnalysisResult {
  totalTime: number;
  sampleCount: number;
  hotFunctions: HotFunction[];
  asyncIssues: Array<{
    issue: string;
    node: CPUProfileNode;
  }>;
  optimizationIssues: Array<{
    issue: string;
    node: CPUProfileNode;
  }>;
}
