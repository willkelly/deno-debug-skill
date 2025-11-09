/**
 * Plugin-based Analytics Service
 *
 * A modular analytics system that loads plugins to track different types
 * of user events. Each plugin subscribes to events and processes them.
 *
 * PROBLEM REPORT:
 * Memory usage grows steadily over time in production. After 6 hours,
 * the service consumes 800MB, up from 80MB at startup. The growth rate
 * is approximately 2MB per 1000 plugin reloads. No obvious memory leaks
 * are visible in code review.
 *
 * TO TEST:
 * 1. Start: deno run --inspect --allow-net easy/app.ts
 * 2. Trigger reloads: curl -X POST http://localhost:8080/reload-plugins (repeat 20-30 times)
 * 3. Check memory: curl http://localhost:8080/stats
 * 4. Take heap snapshots before and after reloads
 * 5. Compare snapshots to find growing objects
 *
 * DEBUGGING HINT:
 * This bug is NOT visible from code reading alone. You need to:
 * - Take heap snapshot before reloads
 * - Perform 20-30 plugin reloads
 * - Take heap snapshot after reloads
 * - Compare snapshots to see which objects are accumulating
 * - Look for arrays or maps that grow with each reload
 */

// Event types the system handles
type AnalyticsEvent = {
  type: "pageview" | "click" | "conversion" | "error" | "custom";
  userId: string;
  timestamp: number;
  data: Record<string, unknown>;
};

type EventHandler = (event: AnalyticsEvent) => void | Promise<void>;

// Core event bus - manages event distribution
class EventBus {
  private handlers = new Map<string, EventHandler[]>();
  private eventHistory: AnalyticsEvent[] = [];
  private maxHistorySize = 100;

  subscribe(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async emit(event: AnalyticsEvent): Promise<void> {
    // Keep recent events for replay
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    const handlers = this.handlers.get(event.type) || [];
    await Promise.all(handlers.map((h) => h(event)));
  }

  getStats() {
    const stats = new Map<string, number>();
    for (const [type, handlers] of this.handlers.entries()) {
      stats.set(type, handlers.length);
    }
    return {
      handlerCounts: Object.fromEntries(stats),
      totalHandlers: Array.from(stats.values()).reduce((a, b) => a + b, 0),
      historySize: this.eventHistory.length,
    };
  }

  clear(): void {
    this.handlers.clear();
    this.eventHistory = [];
  }
}

// Base plugin interface
abstract class AnalyticsPlugin {
  protected eventBus: EventBus;
  protected config: Record<string, unknown>;
  public name: string;

  constructor(name: string, eventBus: EventBus, config: Record<string, unknown>) {
    this.name = name;
    this.eventBus = eventBus;
    this.config = config;
  }

  abstract initialize(): void;
  abstract shutdown(): void;
}

// Plugin: Conversion tracking
class ConversionPlugin extends AnalyticsPlugin {
  private conversionGoals = new Map<string, number>();

  initialize(): void {
    this.eventBus.subscribe("conversion", this.handleConversion.bind(this));
    console.log(`[${this.name}] Initialized conversion tracking`);
  }

  private handleConversion = (event: AnalyticsEvent) => {
    const goalId = String(event.data.goalId || "default");
    this.conversionGoals.set(goalId, (this.conversionGoals.get(goalId) || 0) + 1);
  };

  shutdown(): void {
    // BUG: Forgot to unsubscribe from events!
    // Should call: this.eventBus.unsubscribe("conversion", this.handleConversion);
    this.conversionGoals.clear();
    console.log(`[${this.name}] Shutdown`);
  }
}

// Plugin: Error tracking
class ErrorPlugin extends AnalyticsPlugin {
  private errorCounts = new Map<string, number>();
  private recentErrors: AnalyticsEvent[] = [];

  initialize(): void {
    this.eventBus.subscribe("error", this.handleError.bind(this));
    console.log(`[${this.name}] Initialized error tracking`);
  }

  private handleError = (event: AnalyticsEvent) => {
    const errorType = String(event.data.errorType || "unknown");
    this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1);
    this.recentErrors.push(event);
    if (this.recentErrors.length > 50) {
      this.recentErrors.shift();
    }
  };

  shutdown(): void {
    // BUG: Forgot to unsubscribe from events!
    this.errorCounts.clear();
    this.recentErrors = [];
    console.log(`[${this.name}] Shutdown`);
  }
}

// Plugin: Pageview tracking
class PageviewPlugin extends AnalyticsPlugin {
  private pageCounts = new Map<string, number>();
  private sessionData = new Map<string, unknown[]>();

  initialize(): void {
    this.eventBus.subscribe("pageview", this.handlePageview.bind(this));
    console.log(`[${this.name}] Initialized pageview tracking`);
  }

  private handlePageview = (event: AnalyticsEvent) => {
    const page = String(event.data.page || "/");
    this.pageCounts.set(page, (this.pageCounts.get(page) || 0) + 1);

    if (!this.sessionData.has(event.userId)) {
      this.sessionData.set(event.userId, []);
    }
    this.sessionData.get(event.userId)!.push(event.data);
  };

  shutdown(): void {
    // BUG: Forgot to unsubscribe from events!
    this.pageCounts.clear();
    this.sessionData.clear();
    console.log(`[${this.name}] Shutdown`);
  }
}

// Plugin: Click tracking
class ClickPlugin extends AnalyticsPlugin {
  private clickHeatmap = new Map<string, number>();

  initialize(): void {
    this.eventBus.subscribe("click", this.handleClick.bind(this));
    console.log(`[${this.name}] Initialized click tracking`);
  }

  private handleClick = (event: AnalyticsEvent) => {
    const element = String(event.data.element || "unknown");
    this.clickHeatmap.set(element, (this.clickHeatmap.get(element) || 0) + 1);
  };

  shutdown(): void {
    // BUG: Forgot to unsubscribe from events!
    this.clickHeatmap.clear();
    console.log(`[${this.name}] Shutdown`);
  }
}

// Plugin: Custom event tracking
class CustomEventPlugin extends AnalyticsPlugin {
  private customEvents = new Map<string, unknown[]>();

  initialize(): void {
    this.eventBus.subscribe("custom", this.handleCustom.bind(this));
    console.log(`[${this.name}] Initialized custom event tracking`);
  }

  private handleCustom = (event: AnalyticsEvent) => {
    const eventName = String(event.data.eventName || "unnamed");
    if (!this.customEvents.has(eventName)) {
      this.customEvents.set(eventName, []);
    }
    this.customEvents.get(eventName)!.push(event.data);
  };

  shutdown(): void {
    // BUG: Forgot to unsubscribe from events!
    this.customEvents.clear();
    console.log(`[${this.name}] Shutdown`);
  }
}

// Plugin manager - handles plugin lifecycle
class PluginManager {
  private eventBus: EventBus;
  private plugins: AnalyticsPlugin[] = [];
  private reloadCount = 0;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  loadPlugins(): void {
    this.reloadCount++;
    console.log(`\n--- Loading plugins (reload #${this.reloadCount}) ---`);

    // Create all plugins with default config
    const newPlugins: AnalyticsPlugin[] = [
      new ConversionPlugin("conversion-tracker", this.eventBus, { enabled: true }),
      new ErrorPlugin("error-tracker", this.eventBus, { enabled: true }),
      new PageviewPlugin("pageview-tracker", this.eventBus, { enabled: true }),
      new ClickPlugin("click-tracker", this.eventBus, { enabled: true }),
      new CustomEventPlugin("custom-tracker", this.eventBus, { enabled: true }),
    ];

    // Initialize all plugins
    for (const plugin of newPlugins) {
      plugin.initialize();
    }

    this.plugins = newPlugins;
  }

  reloadPlugins(): void {
    console.log("\n--- Reloading plugins ---");

    // Shutdown old plugins
    for (const plugin of this.plugins) {
      plugin.shutdown();
    }

    // Load new plugin instances
    this.loadPlugins();
  }

  getPluginCount(): number {
    return this.plugins.length;
  }
}

// Main analytics service
const eventBus = new EventBus();
const pluginManager = new PluginManager(eventBus);

// Initial plugin load
pluginManager.loadPlugins();

// Simulate some background events
let eventCounter = 0;
setInterval(() => {
  const eventTypes: AnalyticsEvent["type"][] = ["pageview", "click", "conversion", "error", "custom"];
  const randomType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

  eventBus.emit({
    type: randomType,
    userId: `user-${Math.floor(Math.random() * 10)}`,
    timestamp: Date.now(),
    data: {
      page: `/page-${Math.floor(Math.random() * 5)}`,
      element: `button-${Math.floor(Math.random() * 3)}`,
      goalId: `goal-${Math.floor(Math.random() * 2)}`,
      errorType: "TypeError",
      eventName: "user_action",
    },
  });

  eventCounter++;
}, 100);

// HTTP server
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // POST /reload-plugins
  if (url.pathname === "/reload-plugins" && req.method === "POST") {
    pluginManager.reloadPlugins();
    const stats = eventBus.getStats();
    return Response.json({
      message: "Plugins reloaded",
      ...stats,
    });
  }

  // POST /event - Track custom event
  if (url.pathname === "/event" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    await eventBus.emit({
      type: body.type || "custom",
      userId: body.userId || "anonymous",
      timestamp: Date.now(),
      data: body.data || {},
    });
    return Response.json({ message: "Event tracked" });
  }

  // GET /stats
  if (url.pathname === "/stats") {
    const memUsage = Deno.memoryUsage();
    const stats = eventBus.getStats();

    return Response.json({
      memory: {
        heapUsedMB: (memUsage.heapUsed / (1024 * 1024)).toFixed(2),
        heapTotalMB: (memUsage.heapTotal / (1024 * 1024)).toFixed(2),
        externalMB: (memUsage.external / (1024 * 1024)).toFixed(2),
      },
      eventBus: stats,
      plugins: pluginManager.getPluginCount(),
      eventsEmitted: eventCounter,
    });
  }

  // GET /
  return new Response(
    `Analytics Service

Endpoints:
  POST /reload-plugins  - Reload all analytics plugins
  POST /event           - Track custom event
                          Body: {"type":"pageview","userId":"123","data":{...}}
  GET  /stats          - View system stats

Debugging the Memory Leak:
  1. curl http://localhost:8080/stats (note heap usage)
  2. Take heap snapshot #1
  3. curl -X POST http://localhost:8080/reload-plugins (repeat 20-30 times)
  4. Take heap snapshot #2
  5. Compare snapshots - look for growing arrays in EventBus
  6. Notice handlers accumulate but are never removed

The bug is NOT obvious from code reading!
You need heap snapshots to see the leak.

Try:
  curl http://localhost:8080/stats
  curl -X POST http://localhost:8080/reload-plugins
  curl -X POST http://localhost:8080/event -d '{"type":"pageview","userId":"user-1","data":{"page":"/home"}}'
`,
    { headers: { "content-type": "text/plain" } }
  );
}

console.log("📊 Analytics Service starting on http://localhost:8080");
console.log("   POST /reload-plugins - Reload analytics plugins");
console.log("   POST /event - Track event");
console.log("   GET  /stats - System stats");
console.log("");
console.log("⚠️  MEMORY LEAK:");
console.log("   Growth rate: ~2MB per 1000 plugin reloads");
console.log("   Requires heap snapshot analysis to find");
console.log("   Code reading alone won't reveal the bug!");
console.log("");
console.log("🔍 Debug workflow:");
console.log("   1. Take heap snapshot");
console.log("   2. POST /reload-plugins (20-30 times)");
console.log("   3. Take another heap snapshot");
console.log("   4. Compare to find growing objects");

Deno.serve({ port: 8080 }, handleRequest);
