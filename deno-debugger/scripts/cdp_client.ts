/**
 * Chrome DevTools Protocol (CDP) client for connecting to Deno's V8 Inspector.
 *
 * Provides high-level interface for debugging operations:
 * - Connection management
 * - Breakpoint control
 * - Execution flow (resume, pause, step)
 * - Expression evaluation
 * - Call frame and scope inspection
 * - Heap snapshot capture
 * - CPU profiling
 */

import type {
  BreakpointLocation,
  CallFrame,
  CDPEvent,
  CDPRequest,
  CDPResponse,
  CDPTarget,
  CPUProfileData,
  RemoteObject,
} from "./types.ts";

export interface Breakpoint {
  breakpointId: string;
  location: BreakpointLocation;
}

type EventHandler = (params: Record<string, unknown>) => void | Promise<void>;

export class CDPClient {
  private host: string;
  private port: number;
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number, {
    resolve: (value: Record<string, unknown>) => void;
    reject: (error: Error) => void;
  }>();
  private eventHandlers = new Map<string, EventHandler[]>();
  public paused = false;
  public callFrames: CallFrame[] = [];
  public runtimeInfo: {
    isDeno: boolean;
    isNode: boolean;
    description: string;
    title: string;
  } | null = null;

  constructor(host = "127.0.0.1", port = 9229) {
    this.host = host;
    this.port = port;
  }

  /**
   * Establish WebSocket connection to Deno/Node inspector.
   */
  async connect(): Promise<CDPClient> {
    // First, get the WebSocket debugger URL
    const response = await fetch(`http://${this.host}:${this.port}/json`);
    const targets = await response.json() as CDPTarget[];

    if (!targets || targets.length === 0) {
      throw new Error("No debugger targets found");
    }

    const target = targets[0];
    const wsUrl = target.webSocketDebuggerUrl;

    // Detect runtime from target info
    const description = (target.description || "").toLowerCase();
    const title = (target.title || "").toLowerCase();
    this.runtimeInfo = {
      isDeno: description.includes("deno") || title.includes("deno"),
      isNode: description.includes("node") || title.includes("node"),
      description: target.description || "",
      title: target.title || "",
    };

    // Connect to WebSocket
    this.ws = new WebSocket(wsUrl);

    // Set up event handlers
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error("WebSocket not initialized"));
        return;
      }

      this.ws.onopen = () => {
        this.startMessageHandler();
        // Give message handler a moment to start
        setTimeout(() => resolve(this), 100);
      };

      this.ws.onerror = (event) => {
        reject(new Error(`WebSocket error: ${event}`));
      };

      this.ws.onclose = () => {
        // Connection closed
      };
    });
  }

  /**
   * Handle incoming messages from CDP.
   */
  private startMessageHandler(): void {
    if (!this.ws) return;

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);

        // Handle responses to our requests
        if ("id" in data) {
          const response = data as CDPResponse;
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            this.pendingRequests.delete(response.id);
            if (response.error) {
              pending.reject(new Error(response.error.message));
            } else {
              pending.resolve(response.result || {});
            }
          }
        } // Handle events
        else if ("method" in data) {
          const event = data as CDPEvent;
          const method = event.method;
          const params = event.params || {};

          // Built-in event handling
          if (method === "Debugger.paused") {
            this.paused = true;
            this.callFrames = (params.callFrames as CallFrame[]) || [];
          } else if (method === "Debugger.resumed") {
            this.paused = false;
            this.callFrames = [];
          }

          // Notify registered handlers
          const handlers = this.eventHandlers.get(method);
          if (handlers) {
            for (const handler of handlers) {
              // Run handler async
              Promise.resolve(handler(params)).catch((err) => {
                console.error(`Event handler error for ${method}:`, err);
              });
            }
          }
        }
      } catch (err) {
        console.error("CDP message handler error:", err);
      }
    };
  }

  /**
   * Send a CDP command and wait for response.
   */
  async sendCommand(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    const msgId = this.nextId++;
    const message: CDPRequest = {
      id: msgId,
      method,
    };

    if (params) {
      message.params = params;
    }

    // Create promise for response
    const responsePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pendingRequests.set(msgId, { resolve, reject });
    });

    // Send message
    this.ws.send(JSON.stringify(message));

    // Wait for response with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Command timeout: ${method}`)), 30000);
    });

    return await Promise.race([responsePromise, timeoutPromise]);
  }

  /**
   * Register an event handler.
   */
  onEvent(eventName: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName)!.push(handler);
  }

  // ============================================================================
  // Debugger Domain
  // ============================================================================

  async enableDebugger(): Promise<void> {
    await this.sendCommand("Debugger.enable");
    // Also enable Runtime for evaluation
    await this.sendCommand("Runtime.enable");
  }

  async disableDebugger(): Promise<void> {
    await this.sendCommand("Debugger.disable");
  }

  async setBreakpoint(
    url: string,
    line: number,
    column = 0,
    condition?: string,
  ): Promise<Breakpoint> {
    const params: Record<string, unknown> = {
      location: { scriptUrl: url, lineNumber: line, columnNumber: column },
    };

    if (condition) {
      params.condition = condition;
    }

    const result = await this.sendCommand("Debugger.setBreakpoint", params);

    return {
      breakpointId: result.breakpointId as string,
      location: result.actualLocation as BreakpointLocation,
    };
  }

  async setBreakpointByUrl(
    urlRegex: string,
    line: number,
    column = 0,
    condition?: string,
  ): Promise<string> {
    const params: Record<string, unknown> = {
      urlRegex,
      lineNumber: line,
      columnNumber: column,
    };

    if (condition) {
      params.condition = condition;
    }

    const result = await this.sendCommand("Debugger.setBreakpointByUrl", params);
    return result.breakpointId as string;
  }

  async removeBreakpoint(breakpointId: string): Promise<void> {
    await this.sendCommand("Debugger.removeBreakpoint", { breakpointId });
  }

  async pause(): Promise<void> {
    await this.sendCommand("Debugger.pause");
  }

  async resume(): Promise<void> {
    await this.sendCommand("Debugger.resume");
  }

  async stepOver(): Promise<void> {
    await this.sendCommand("Debugger.stepOver");
  }

  async stepInto(): Promise<void> {
    await this.sendCommand("Debugger.stepInto");
  }

  async stepOut(): Promise<void> {
    await this.sendCommand("Debugger.stepOut");
  }

  async setPauseOnExceptions(state: "none" | "uncaught" | "all" = "none"): Promise<void> {
    await this.sendCommand("Debugger.setPauseOnExceptions", { state });
  }

  getCallFrames(): CallFrame[] {
    return this.callFrames;
  }

  async evaluate(
    expression: string,
    callFrameId?: string,
    contextId?: number,
  ): Promise<RemoteObject> {
    let result: Record<string, unknown>;

    if (callFrameId) {
      // Evaluate on call frame (when paused)
      result = await this.sendCommand("Debugger.evaluateOnCallFrame", {
        callFrameId,
        expression,
      });
    } else {
      // Evaluate in runtime context
      const params: Record<string, unknown> = { expression };
      if (contextId !== undefined) {
        params.contextId = contextId;
      }
      result = await this.sendCommand("Runtime.evaluate", params);
    }

    if (result.exceptionDetails) {
      throw new Error(`Evaluation error: ${JSON.stringify(result.exceptionDetails)}`);
    }

    return result.result as RemoteObject;
  }

  async getProperties(objectId: string): Promise<Array<Record<string, unknown>>> {
    const result = await this.sendCommand("Runtime.getProperties", {
      objectId,
      ownProperties: true,
    });
    return (result.result as Array<Record<string, unknown>>) || [];
  }

  async getScopeVariables(callFrameId: string): Promise<Record<string, unknown>> {
    const frame = this.callFrames.find((f) => f.callFrameId === callFrameId);
    if (!frame) {
      return {};
    }

    const variables: Record<string, unknown> = {};

    // Get variables from each scope chain
    for (const scope of frame.scopeChain || []) {
      const scopeObj = scope.object;
      if (scopeObj.objectId) {
        const props = await this.getProperties(scopeObj.objectId);
        for (const prop of props) {
          if (prop.name) {
            variables[prop.name as string] = prop.value;
          }
        }
      }
    }

    return variables;
  }

  // ============================================================================
  // Heap Profiler Domain
  // ============================================================================

  async enableHeapProfiler(): Promise<void> {
    await this.sendCommand("HeapProfiler.enable");
  }

  async takeHeapSnapshot(reportProgress = false): Promise<string> {
    const chunks: string[] = [];
    let progressDone = false;

    const chunkHandler = (params: Record<string, unknown>) => {
      if (params.chunk) {
        chunks.push(params.chunk as string);
      }
    };

    const progressHandler = (params: Record<string, unknown>) => {
      const done = params.done as number || 0;
      const total = params.total as number || 0;

      // Print progress if requested
      if (reportProgress && done % 20000 === 0) {
        console.log(`  Heap snapshot progress: ${done.toLocaleString()}/${total.toLocaleString()}`);
      }

      // When finished is true, snapshot is complete
      if (params.finished) {
        progressDone = true;
      }
    };

    // Register event handlers BEFORE enabling heap profiler
    this.onEvent("HeapProfiler.addHeapSnapshotChunk", chunkHandler);

    if (reportProgress) {
      this.onEvent("HeapProfiler.reportHeapSnapshotProgress", progressHandler);
    }

    // Now enable heap profiler
    await this.enableHeapProfiler();

    // Request snapshot
    try {
      // Start snapshot capture
      const snapshotPromise = this.sendCommand("HeapProfiler.takeHeapSnapshot", {
        reportProgress,
      });

      // Wait for completion
      if (reportProgress) {
        // Wait for progress indicator
        let waited = 0;
        while (!progressDone && waited < 30000) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          waited += 100;
        }
      } else {
        // Wait a bit for chunks to arrive
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      // Wait for command completion
      await snapshotPromise;
    } catch (err) {
      // Continue even if command times out - we have the chunks
      console.error("Snapshot capture error (may be OK):", err);
    }

    return chunks.join("");
  }

  // ============================================================================
  // Profiler Domain (CPU profiling)
  // ============================================================================

  async enableProfiler(): Promise<void> {
    await this.sendCommand("Profiler.enable");
  }

  async startProfiling(): Promise<void> {
    await this.enableProfiler();
    await this.sendCommand("Profiler.start");
  }

  async stopProfiling(): Promise<CPUProfileData> {
    const result = await this.sendCommand("Profiler.stop");
    return (result.profile as CPUProfileData) || {} as CPUProfileData;
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// ============================================================================
// CLI Usage
// ============================================================================

if (import.meta.main) {
  console.log("CDP Client - Example Usage");
  console.log("===========================");
  console.log();
  console.log("// Connect to Deno (launched with --inspect)");
  console.log("const client = new CDPClient('127.0.0.1', 9229);");
  console.log("await client.connect();");
  console.log("await client.enableDebugger();");
  console.log();
  console.log("// Set breakpoint");
  console.log("const bp = await client.setBreakpoint('file:///path/to/app.ts', 42);");
  console.log();
  console.log("// Resume execution");
  console.log("await client.resume();");
  console.log();
  console.log("// When paused, inspect");
  console.log("const frames = client.getCallFrames();");
  console.log("const vars = await client.getScopeVariables(frames[0].callFrameId);");
  console.log();
  console.log("// Evaluate expression");
  console.log("const result = await client.evaluate('myVariable', frames[0].callFrameId);");
  console.log();
  console.log("// Take heap snapshot");
  console.log("const snapshot = await client.takeHeapSnapshot();");
  console.log("await Deno.writeTextFile('snapshot.heapsnapshot', snapshot);");
  console.log();
  console.log("// CPU profiling");
  console.log("await client.startProfiling();");
  console.log("// ... run code ...");
  console.log("const profile = await client.stopProfiling();");
  console.log("await Deno.writeTextFile('profile.cpuprofile', JSON.stringify(profile));");
}
