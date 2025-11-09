/**
 * Background Task Queue Processor
 *
 * A production-grade task queue with multiple workers, priority queues,
 * and retry logic. Processes various background jobs like image processing,
 * email sending, and data exports.
 *
 * PROBLEM REPORT:
 * Production incidents over the past week:
 * 1. Task failures increase over time - first hour: 0%, after 6 hours: 15%
 * 2. Memory usage grows from 50MB to 500MB+ over 24 hours
 * 3. Intermittent "Task already claimed" errors despite proper locking
 * 4. Event loop lag spikes to 2-3 seconds during export tasks
 * 5. Some export files are corrupted or incomplete
 *
 * The bugs are subtle and interact with each other, making root cause analysis
 * difficult. Production metrics show degradation correlates with:
 * - Number of export tasks processed
 * - Time since last restart
 * - Number of task retries
 *
 * TO DEBUG:
 * 1. Start: deno run --inspect --allow-net --allow-read --allow-write hard/app.ts
 * 2. Trigger tasks: curl -X POST http://localhost:8082/tasks -d '{"type":"export","count":100}'
 * 3. Monitor: curl http://localhost:8082/metrics
 * 4. Watch for degradation over time
 */

interface Task {
  id: string;
  type: "image" | "email" | "export";
  priority: number;
  data: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  claimedBy?: string;
  claimedAt?: number;
  completedAt?: number;
  error?: string;
}

interface WorkerMetrics {
  workerId: string;
  tasksProcessed: number;
  tasksFailed: number;
  avgProcessingTime: number;
  lastHeartbeat: number;
}

class TaskQueue {
  private tasks = new Map<string, Task>();
  private priorityQueue: Task[] = [];
  private completedTasks: Task[] = [];
  private claimTimeout = 30000; // 30 seconds

  enqueue(task: Task): void {
    this.tasks.set(task.id, task);
    this.priorityQueue.push(task);
    this.priorityQueue.sort((a, b) => b.priority - a.priority);
  }

  claim(workerId: string): Task | null {
    const now = Date.now();

    // Release expired claims
    for (const task of this.tasks.values()) {
      if (
        task.claimedBy &&
        task.claimedAt &&
        now - task.claimedAt > this.claimTimeout
      ) {
        console.log(`Releasing expired claim on task ${task.id}`);
        task.claimedBy = undefined;
        task.claimedAt = undefined;
      }
    }

    // Find unclaimed task
    for (let i = 0; i < this.priorityQueue.length; i++) {
      const task = this.priorityQueue[i];
      if (!task.claimedBy && !task.completedAt) {
        task.claimedBy = workerId;
        task.claimedAt = now;
        return task;
      }
    }

    return null;
  }

  complete(taskId: string, error?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    if (error) {
      task.error = error;
      task.attempts++;

      if (task.attempts >= task.maxAttempts) {
        task.completedAt = Date.now();
        this.completedTasks.push(task);
      } else {
        // Retry: clear claim
        task.claimedBy = undefined;
        task.claimedAt = undefined;
      }
    } else {
      task.completedAt = Date.now();
      this.completedTasks.push(task);
    }
  }

  getMetrics() {
    const pending = Array.from(this.tasks.values()).filter(
      (t) => !t.completedAt,
    );
    const failed = this.completedTasks.filter((t) => t.error);

    return {
      pending: pending.length,
      completed: this.completedTasks.length,
      failed: failed.length,
      queueSize: this.tasks.size,
    };
  }
}

class Worker {
  private id: string;
  private queue: TaskQueue;
  private metrics: WorkerMetrics;
  private running = false;
  private processingTimes: number[] = [];
  private tempFiles: string[] = [];

  constructor(id: string, queue: TaskQueue) {
    this.id = id;
    this.queue = queue;
    this.metrics = {
      workerId: id,
      tasksProcessed: 0,
      tasksFailed: 0,
      avgProcessingTime: 0,
      lastHeartbeat: Date.now(),
    };
  }

  async start() {
    this.running = true;
    console.log(`Worker ${this.id} started`);

    while (this.running) {
      this.metrics.lastHeartbeat = Date.now();

      const task = this.queue.claim(this.id);
      if (!task) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }

      const startTime = Date.now();

      try {
        await this.processTask(task);
        this.queue.complete(task.id);
        this.metrics.tasksProcessed++;

        const processingTime = Date.now() - startTime;
        this.processingTimes.push(processingTime);
        this.metrics.avgProcessingTime =
          this.processingTimes.reduce((a, b) => a + b, 0) /
          this.processingTimes.length;
      } catch (error) {
        console.error(`Task ${task.id} failed:`, error);
        this.queue.complete(task.id, String(error));
        this.metrics.tasksFailed++;
      }
    }
  }

  private async processTask(task: Task): Promise<void> {
    switch (task.type) {
      case "image":
        await this.processImage(task);
        break;
      case "email":
        await this.processEmail(task);
        break;
      case "export":
        await this.processExport(task);
        break;
    }
  }

  private async processImage(task: Task): Promise<void> {
    // Simulate image processing
    await new Promise((r) => setTimeout(r, Math.random() * 100 + 50));

    // Simulate memory allocation for image data
    const imageBuffer = new Uint8Array(1024 * 1024); // 1MB
    imageBuffer[0] = 42;

    // Process...
    await new Promise((r) => setTimeout(r, 10));
  }

  private async processEmail(task: Task): Promise<void> {
    // Simulate email sending
    await new Promise((r) => setTimeout(r, Math.random() * 50 + 25));

    const email = {
      to: task.data.to,
      subject: task.data.subject,
      body: task.data.body,
    };

    // "Send" email
    await new Promise((r) => setTimeout(r, 20));
  }

  private async processExport(task: Task): Promise<void> {
    const count = (task.data.count as number) || 100;
    const filename = `/tmp/export-${task.id}.json`;

    // Open file for writing
    const file = await Deno.open(filename, {
      write: true,
      create: true,
      truncate: true,
    });

    this.tempFiles.push(filename);

    try {
      // Generate and write data synchronously (blocking!)
      let data = "[";
      for (let i = 0; i < count; i++) {
        // Synchronous JSON generation blocks event loop
        const record = JSON.stringify({
          id: i,
          timestamp: Date.now(),
          data: crypto.randomUUID(),
          payload: new Array(100).fill("x").join(""),
        });

        data += record;
        if (i < count - 1) data += ",";

        // Write in chunks
        if (i % 10 === 0) {
          const bytes = new TextEncoder().encode(data);
          await file.write(bytes);
          data = "";
        }
      }

      data += "]";
      const bytes = new TextEncoder().encode(data);
      await file.write(bytes);

      // File handle cleanup happens eventually...
      // (sometimes)
    } finally {
      file.close();
    }
  }

  stop() {
    this.running = false;
  }

  getMetrics(): WorkerMetrics {
    return this.metrics;
  }
}

const queue = new TaskQueue();
const workers: Worker[] = [];

// Start workers
for (let i = 0; i < 3; i++) {
  const worker = new Worker(`worker-${i}`, queue);
  workers.push(worker);
  worker.start();
}

let tasksCreated = 0;

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // POST /tasks - Create tasks
  if (url.pathname === "/tasks" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const taskType = body.type || "image";
    const count = body.count || 1;

    for (let i = 0; i < count; i++) {
      const task: Task = {
        id: `task-${tasksCreated++}`,
        type: taskType,
        priority: Math.floor(Math.random() * 10),
        data: body.data || {},
        attempts: 0,
        maxAttempts: 3,
        createdAt: Date.now(),
      };

      queue.enqueue(task);
    }

    return Response.json({ message: `Created ${count} tasks`, type: taskType });
  }

  // GET /metrics
  if (url.pathname === "/metrics") {
    const queueMetrics = queue.getMetrics();
    const workerMetrics = workers.map((w) => w.getMetrics());

    const memUsage = Deno.memoryUsage();

    return Response.json({
      queue: queueMetrics,
      workers: workerMetrics,
      memory: {
        heapUsedMB: (memUsage.heapUsed / (1024 * 1024)).toFixed(2),
        heapTotalMB: (memUsage.heapTotal / (1024 * 1024)).toFixed(2),
        externalMB: (memUsage.external / (1024 * 1024)).toFixed(2),
      },
    });
  }

  return new Response(
    `Task Queue Processor

Endpoints:
  POST /tasks     - Create tasks
                    Body: {"type":"export","count":100,"data":{}}
                    Types: image, email, export

  GET  /metrics   - View queue and worker metrics

Examples:
  curl -X POST http://localhost:8082/tasks -d '{"type":"export","count":50}'
  curl http://localhost:8082/metrics

BUGS TO FIND:
  1. Race condition in task claiming
  2. Memory leak from unclosed resources
  3. Event loop blocking in export tasks
  4. File handle leaks
`,
    { headers: { "content-type": "text/plain" } },
  );
}

console.log("⚙️  Task Queue Processor starting on http://localhost:8082");
console.log("   POST /tasks - Create tasks");
console.log("   GET  /metrics - View metrics");
console.log("");
console.log("⚠️  PRODUCTION BUGS:");
console.log("   - Failure rate increases over time");
console.log("   - Memory grows steadily");
console.log("   - Intermittent 'already claimed' errors");
console.log("   - Event loop lag during exports");
console.log("   - Corrupted export files");
console.log("");
console.log("Try: curl -X POST http://localhost:8082/tasks -d '{\"type\":\"export\",\"count\":100}'");

Deno.serve({ port: 8082 }, handleRequest);
