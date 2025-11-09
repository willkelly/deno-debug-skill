/**
 * Concurrent Request Helper
 *
 * Utility for debugging race conditions by generating concurrent requests
 * and analyzing timing patterns.
 */

export interface ConcurrentRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  count: number;
  delayBetweenMs?: number;
}

export interface RequestResult {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  status: number;
  ok: boolean;
  body?: unknown;
  error?: string;
}

export interface RaceAnalysis {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  raceDetected: boolean;
  raceEvidence: string[];
}

/**
 * Generate concurrent HTTP requests to trigger race conditions
 *
 * @example
 * ```typescript
 * const results = await generateConcurrentRequests({
 *   url: "http://localhost:8081/acquire",
 *   method: "POST",
 *   body: { lockId: "test", clientId: "client-1" },
 *   count: 100,
 * });
 *
 * const analysis = analyzeForRace(results, (r) => r.body?.success === true);
 * console.log("Race detected:", analysis.raceDetected);
 * ```
 */
export async function generateConcurrentRequests(
  options: ConcurrentRequestOptions
): Promise<RequestResult[]> {
  const {
    url,
    method = "GET",
    headers = {},
    body,
    count,
    delayBetweenMs = 0,
  } = options;

  console.log(`Generating ${count} concurrent ${method} requests to ${url}...`);

  const results: RequestResult[] = [];
  const requests: Promise<void>[] = [];

  for (let i = 0; i < count; i++) {
    // Small stagger to increase race probability
    if (delayBetweenMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenMs));
    }

    const request = (async (index: number) => {
      const startTime = Date.now();

      try {
        const fetchOptions: RequestInit = {
          method,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
        };

        if (body) {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);
        const endTime = Date.now();

        let responseBody;
        try {
          responseBody = await response.json();
        } catch {
          responseBody = await response.text();
        }

        results[index] = {
          index,
          startTime,
          endTime,
          duration: endTime - startTime,
          status: response.status,
          ok: response.ok,
          body: responseBody,
        };
      } catch (error) {
        const endTime = Date.now();
        results[index] = {
          index,
          startTime,
          endTime,
          duration: endTime - startTime,
          status: 0,
          ok: false,
          error: String(error),
        };
      }
    })(i);

    requests.push(request);
  }

  await Promise.all(requests);

  console.log(`✓ All ${count} requests completed`);
  return results.filter(r => r !== undefined);
}

/**
 * Analyze request results for race condition evidence
 *
 * @param results - Results from generateConcurrentRequests
 * @param successPredicate - Function to determine if a request "won" the race
 *                          e.g., (r) => r.body?.success === true
 * @param expectedWinners - How many requests should succeed (default: 1)
 */
export function analyzeForRace(
  results: RequestResult[],
  successPredicate: (result: RequestResult) => boolean,
  expectedWinners = 1
): RaceAnalysis {
  const successful = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  const winners = results.filter(successPredicate);

  const durations = results.map(r => r.duration);
  const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  const raceDetected = winners.length > expectedWinners;
  const raceEvidence: string[] = [];

  if (raceDetected) {
    raceEvidence.push(
      `Expected ${expectedWinners} winner(s), but ${winners.length} succeeded`
    );

    // Check timing overlap (winners with overlapping execution)
    const winnerTimes = winners.map(w => ({ start: w.startTime, end: w.endTime }));
    for (let i = 0; i < winnerTimes.length; i++) {
      for (let j = i + 1; j < winnerTimes.length; j++) {
        const overlap = Math.min(winnerTimes[i].end, winnerTimes[j].end) -
                       Math.max(winnerTimes[i].start, winnerTimes[j].start);
        if (overlap > 0) {
          raceEvidence.push(
            `Winners ${i} and ${j} had ${overlap}ms of overlapping execution`
          );
        }
      }
    }

    // Check for close timing
    const winnerStartTimes = winners.map(w => w.startTime).sort((a, b) => a - b);
    for (let i = 1; i < winnerStartTimes.length; i++) {
      const gap = winnerStartTimes[i] - winnerStartTimes[i - 1];
      if (gap < 10) {
        raceEvidence.push(
          `Winners started within ${gap}ms of each other`
        );
      }
    }
  }

  return {
    totalRequests: results.length,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    averageDuration: avgDuration,
    minDuration,
    maxDuration,
    raceDetected,
    raceEvidence,
  };
}

/**
 * Pretty-print race analysis results
 */
export function printRaceAnalysis(analysis: RaceAnalysis): void {
  console.log("\n" + "=".repeat(60));
  console.log("RACE CONDITION ANALYSIS");
  console.log("=".repeat(60));
  console.log(`Total requests:      ${analysis.totalRequests}`);
  console.log(`Successful:          ${analysis.successfulRequests}`);
  console.log(`Failed:              ${analysis.failedRequests}`);
  console.log(`Average duration:    ${analysis.averageDuration.toFixed(1)}ms`);
  console.log(`Duration range:      ${analysis.minDuration}-${analysis.maxDuration}ms`);
  console.log("");
  console.log(`Race detected:       ${analysis.raceDetected ? "❌ YES" : "✅ NO"}`);

  if (analysis.raceEvidence.length > 0) {
    console.log("\nEvidence:");
    for (const evidence of analysis.raceEvidence) {
      console.log(`  - ${evidence}`);
    }
  }
  console.log("=".repeat(60));
}

// ============================================================================
// CLI Usage
// ============================================================================

if (import.meta.main) {
  console.log("Concurrent Request Helper - Example Usage");
  console.log("==========================================\n");

  console.log("// Generate 100 concurrent lock acquisition requests");
  console.log("const results = await generateConcurrentRequests({");
  console.log('  url: "http://localhost:8081/acquire",');
  console.log('  method: "POST",');
  console.log("  body: { lockId: 'test-lock', clientId: 'client-1' },");
  console.log("  count: 100,");
  console.log("});\n");

  console.log("// Analyze for race condition");
  console.log("const analysis = analyzeForRace(");
  console.log("  results,");
  console.log("  (r) => r.body?.success === true,  // Success predicate");
  console.log("  1  // Expected winners (should be only 1 for a lock)");
  console.log(");\n");

  console.log("printRaceAnalysis(analysis);");
}
