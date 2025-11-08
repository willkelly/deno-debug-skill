/**
 * Event Loop / Timing Bug Example
 *
 * This app has subtle bugs related to JavaScript event loop timing,
 * microtasks vs macrotasks, and execution order.
 *
 * The bugs:
 * 1. setTimeout with 0ms doesn't execute immediately
 * 2. Promises (microtasks) execute before setTimeout (macrotasks)
 * 3. State modified in wrong order due to task queue timing
 * 4. setImmediate-like behavior expected but not how JS works
 *
 * To debug:
 * 1. deno run --inspect --allow-net examples/scenarios/5_event_loop_timing/app.ts
 * 2. Step through async code to see execution order
 * 3. Watch taskQueue variable to see state changes
 */

interface Task {
  id: number;
  name: string;
  status: "pending" | "running" | "completed";
  result?: string;
  startedAt?: number;
  completedAt?: number;
}

const taskQueue: Task[] = [];
let taskCounter = 0;

/**
 * BUG 1: Assumes setTimeout(0) executes immediately
 * Actually, setTimeout is a macrotask and executes after microtasks
 */
function scheduleTaskImmediate(name: string): Task {
  const task: Task = {
    id: ++taskCounter,
    name,
    status: "pending",
  };

  taskQueue.push(task);
  console.log(`[Queue] Added task ${task.id}: ${name}`);

  // BUG: Developer thinks this runs "immediately"
  setTimeout(() => {
    task.status = "running";
    task.startedAt = Date.now();
    console.log(`[Execute] Running task ${task.id}: ${name}`);

    // Simulate work
    const result = `Result of ${name}`;

    // BUG: Another setTimeout to "complete immediately"
    setTimeout(() => {
      task.status = "completed";
      task.result = result;
      task.completedAt = Date.now();
      console.log(`[Complete] Task ${task.id} done: ${name}`);
    }, 0);
  }, 0);

  // Returns before task actually starts!
  return task;
}

/**
 * BUG 2: Promise resolution happens before setTimeout
 * Creates unexpected execution order
 */
async function scheduleWithPromise(name: string): Promise<Task> {
  const task: Task = {
    id: ++taskCounter,
    name,
    status: "pending",
  };

  taskQueue.push(task);
  console.log(`[Queue] Added promise task ${task.id}: ${name}`);

  // This Promise resolves immediately (microtask)
  await Promise.resolve();

  task.status = "running";
  task.startedAt = Date.now();
  console.log(`[Execute] Running promise task ${task.id}: ${name}`);

  // Another microtask
  await Promise.resolve();

  task.status = "completed";
  task.result = `Promise result of ${name}`;
  task.completedAt = Date.now();
  console.log(`[Complete] Promise task ${task.id} done: ${name}`);

  return task;
}

/**
 * BUG 3: Mixed microtasks and macrotasks create confusion
 */
function mixedTaskScheduling(): void {
  console.log("\n=== Starting mixed task scheduling ===");
  console.log("[Start] Synchronous");

  // Sync task
  scheduleTaskImmediate("sync-task-1");

  // Promise (microtask)
  Promise.resolve().then(() => {
    console.log("[Promise 1] Microtask executed");
    scheduleTaskImmediate("from-promise");
  });

  // Another sync task
  scheduleTaskImmediate("sync-task-2");

  // setTimeout (macrotask)
  setTimeout(() => {
    console.log("[Timeout 1] Macrotask executed");
  }, 0);

  // Another Promise
  Promise.resolve().then(() => {
    console.log("[Promise 2] Microtask executed");
  });

  console.log("[End] Synchronous");

  // Developer expects this order:
  //   1. sync-task-1 starts
  //   2. sync-task-2 starts
  //   3. Timeout 1
  //   4. Promises
  //
  // Actual order (microtasks before macrotasks!):
  //   1. All sync code
  //   2. Promise 1, Promise 2 (microtasks)
  //   3. Timeout 1 (macrotask)
  //   4. Tasks start running (more macrotasks)
}

/**
 * BUG 4: Async function with timing assumptions
 */
async function processTasksInOrder(taskNames: string[]): Promise<void> {
  console.log("\n=== Processing tasks in order ===");

  for (const name of taskNames) {
    const task = scheduleTaskImmediate(name);

    // BUG: Developer thinks task is done because function returned
    // Actually, task is still pending!
    console.log(`  Task ${task.id} scheduled, status: ${task.status}`);

    // Try to wait for it (but it's not really async!)
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Check status - might still be pending or running!
    console.log(`  Task ${task.id} status after wait: ${task.status}`);
  }

  console.log("=== All tasks scheduled (but not necessarily complete!) ===\n");
}

/**
 * BUG 5: State check happens at wrong time
 */
function checkTaskCompletion(taskId: number): boolean {
  const task = taskQueue.find((t) => t.id === taskId);
  if (!task) {
    return false;
  }

  // BUG: Checking immediately after scheduling
  // Task hasn't started yet because it's in setTimeout!
  const isComplete = task.status === "completed";
  console.log(
    `Task ${taskId} complete: ${isComplete} (status: ${task.status})`,
  );

  return isComplete;
}

// HTTP server
function startServer() {
  console.log("Starting event loop timing demo on http://localhost:8004");
  console.log("");
  console.log("Endpoints:");
  console.log("  POST /task/immediate    - Schedule with setTimeout (macrotask)");
  console.log("  POST /task/promise      - Schedule with Promise (microtask)");
  console.log(
    "  POST /mixed             - Mixed scheduling (shows execution order)",
  );
  console.log(
    "  POST /batch             - Process multiple tasks (timing assumptions)",
  );
  console.log("  GET  /tasks             - View task queue");
  console.log("  GET  /check/:id         - Check if task is complete");
  console.log("");
  console.log("Debugging tips:");
  console.log(
    "  1. Set breakpoints in setTimeout and Promise.then callbacks",
  );
  console.log("  2. Watch variable: taskQueue");
  console.log("  3. Step through to see microtask vs macrotask execution");
  console.log(
    "  4. Watch for status changes happening in unexpected order",
  );
  console.log("");

  Deno.serve({ port: 8004 }, async (req) => {
    const url = new URL(req.url);

    try {
      if (url.pathname === "/task/immediate" && req.method === "POST") {
        const name = url.searchParams.get("name") || `task-${Date.now()}`;
        const task = scheduleTaskImmediate(name);

        // Check immediately (will be pending!)
        const isComplete = checkTaskCompletion(task.id);

        return new Response(
          JSON.stringify({
            success: true,
            task: {
              id: task.id,
              name: task.name,
              status: task.status,
            },
            isComplete,
            warning:
              "⚠️ Task status is 'pending' because setTimeout is a macrotask!",
          }, null, 2),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        );
      } else if (url.pathname === "/task/promise" && req.method === "POST") {
        const name = url.searchParams.get("name") || `promise-${Date.now()}`;
        const task = await scheduleWithPromise(name);

        return new Response(
          JSON.stringify({
            success: true,
            task: {
              id: task.id,
              name: task.name,
              status: task.status,
            },
            note: "Promise microtasks executed before returning",
          }, null, 2),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        );
      } else if (url.pathname === "/mixed" && req.method === "POST") {
        mixedTaskScheduling();

        return new Response(
          JSON.stringify({
            success: true,
            message:
              "Mixed scheduling triggered - check console for execution order",
          }, null, 2),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      } else if (url.pathname === "/batch" && req.method === "POST") {
        const count = parseInt(url.searchParams.get("count") || "3");
        const taskNames = Array.from({ length: count }, (_, i) =>
          `batch-task-${i + 1}`);

        await processTasksInOrder(taskNames);

        return new Response(
          JSON.stringify({
            success: true,
            scheduled: count,
            message: "Tasks scheduled, but completion timing is unpredictable!",
          }, null, 2),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      } else if (url.pathname === "/tasks") {
        return new Response(
          JSON.stringify({
            tasks: taskQueue,
            count: taskQueue.length,
          }, null, 2),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      } else if (url.pathname.startsWith("/check/")) {
        const taskId = parseInt(url.pathname.split("/")[2]);
        const isComplete = checkTaskCompletion(taskId);
        const task = taskQueue.find((t) => t.id === taskId);

        return new Response(
          JSON.stringify({
            taskId,
            task: task || null,
            isComplete,
          }, null, 2),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      } else {
        const body = `
<html>
  <body>
    <h1>Event Loop Timing Demo</h1>
    <p>This app has bugs related to microtask vs macrotask execution order.</p>

    <h2>Test the buggy endpoints:</h2>
    <ul>
      <li><a href="/tasks">View task queue</a></li>
    </ul>

    <h2>Trigger bugs with curl:</h2>
    <pre>
# Schedule with setTimeout (macrotask - executes later)
curl -X POST 'http://localhost:8004/task/immediate?name=test1'

# Schedule with Promise (microtask - executes sooner)
curl -X POST 'http://localhost:8004/task/promise?name=test2'

# Mixed scheduling shows execution order
curl -X POST 'http://localhost:8004/mixed'

# Batch processing with timing assumptions
curl -X POST 'http://localhost:8004/batch?count=5'

# Check task completion (timing issues!)
curl 'http://localhost:8004/check/1'
    </pre>

    <h2>How to debug:</h2>
    <ol>
      <li>Set breakpoint in setTimeout callback</li>
      <li>Set breakpoint in Promise.then callback</li>
      <li>Watch variable: taskQueue</li>
      <li>Step through to observe execution order</li>
      <li>Notice microtasks execute before macrotasks</li>
      <li>See how status changes don't happen when expected</li>
    </ol>

    <h2>Key concepts:</h2>
    <ul>
      <li><b>Microtasks:</b> Promises, queueMicrotask() - execute before next render/IO</li>
      <li><b>Macrotasks:</b> setTimeout, setInterval - execute in next event loop iteration</li>
      <li><b>Order:</b> All microtasks run before next macrotask</li>
    </ul>
  </body>
</html>
        `;

        return new Response(body, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ error: String(error) }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      );
    }
  });
}

// Start the server
startServer();
