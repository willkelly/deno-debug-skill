/**
 * Media Processing Service
 *
 * A high-performance service for processing video thumbnails, applying filters,
 * and extracting metadata. Supports batch processing with multiple pipeline stages.
 *
 * PROBLEM REPORT:
 * Production performance has degraded significantly:
 * - Processing 100 images used to take 2 seconds, now takes 45+ seconds
 * - CPU usage spikes to 100% during batch jobs
 * - No recent code changes to core processing logic
 * - Issue appeared after adding "metadata enrichment" feature
 * - Performance degrades exponentially with batch size
 *
 * Symptoms:
 * - Small batches (10 images): ~500ms (acceptable)
 * - Medium batches (50 images): ~12 seconds (slow)
 * - Large batches (100 images): ~45 seconds (unacceptable)
 * - Memory usage is normal, CPU is the bottleneck
 *
 * TO TEST:
 * 1. Start: deno run --inspect --allow-net hard/app.ts
 * 2. Process small batch: curl -X POST http://localhost:8082/process -d '{"count":10}'
 * 3. Process large batch: curl -X POST http://localhost:8082/process -d '{"count":100}'
 * 4. Notice the exponential slowdown
 *
 * DEBUGGING HINT:
 * Take a CPU profile during a large batch (100+ images):
 * 1. Start profiling before the request
 * 2. POST /process with count=100
 * 3. Stop profiling when request completes
 * 4. Analyze profile - look for the hottest function
 * 5. One function will consume 90%+ of CPU time
 *
 * Code reading won't easily reveal this! The bottleneck is hidden
 * in an innocent-looking helper function called through multiple layers.
 */

// Simulated image data
interface ImageData {
  id: string;
  width: number;
  height: number;
  pixels: number[]; // Simplified: flat array of RGB values
  metadata: Record<string, unknown>;
}

// Processing pipeline stages
interface ProcessingStage {
  name: string;
  transform: (image: ImageData) => ImageData;
}

// Processing result
interface ProcessingResult {
  imageId: string;
  processedAt: number;
  stagesApplied: string[];
  metadata: Record<string, unknown>;
}

/**
 * Image utilities
 */
class ImageUtils {
  /**
   * Generate a test image
   */
  static generateImage(id: string, size: number): ImageData {
    const pixels: number[] = [];
    for (let i = 0; i < size * size * 3; i++) {
      pixels.push(Math.floor(Math.random() * 256));
    }

    return {
      id,
      width: size,
      height: size,
      pixels,
      metadata: {
        created: Date.now(),
        format: "RGB",
        quality: 95,
      },
    };
  }

  /**
   * Clone an image (deep copy)
   */
  static clone(image: ImageData): ImageData {
    return {
      ...image,
      pixels: [...image.pixels],
      metadata: { ...image.metadata },
    };
  }

  /**
   * Calculate image checksum (for validation)
   * BUG: O(n²) complexity - compares every pixel with every other pixel!
   * This looks like it's just doing validation, but it's secretly destroying performance.
   */
  static calculateChecksum(image: ImageData): string {
    let checksum = 0;

    // This appears to be a sophisticated checksum algorithm
    // but it's actually comparing every pixel with every other pixel!
    for (let i = 0; i < image.pixels.length; i++) {
      for (let j = 0; j < image.pixels.length; j++) {
        // "Weighted correlation checksum" - sounds legitimate
        // But this is O(n²) where n = width * height * 3!
        checksum += (image.pixels[i] * image.pixels[j]) % 256;
        checksum = checksum % 1000000;
      }
    }

    return checksum.toString(16);
  }

  /**
   * Calculate pixel statistics
   */
  static calculateStats(image: ImageData): Record<string, number> {
    let sum = 0;
    let min = 255;
    let max = 0;

    for (const pixel of image.pixels) {
      sum += pixel;
      min = Math.min(min, pixel);
      max = Math.max(max, pixel);
    }

    return {
      mean: sum / image.pixels.length,
      min,
      max,
    };
  }
}

/**
 * Image filters
 */
class Filters {
  /**
   * Brightness adjustment
   */
  static brightness(amount: number): ProcessingStage {
    return {
      name: "brightness",
      transform: (image: ImageData) => {
        const result = ImageUtils.clone(image);
        for (let i = 0; i < result.pixels.length; i++) {
          result.pixels[i] = Math.max(0, Math.min(255, result.pixels[i] + amount));
        }
        result.metadata.brightness = amount;
        return result;
      },
    };
  }

  /**
   * Contrast adjustment
   */
  static contrast(factor: number): ProcessingStage {
    return {
      name: "contrast",
      transform: (image: ImageData) => {
        const result = ImageUtils.clone(image);
        const f = (259 * (factor + 255)) / (255 * (259 - factor));

        for (let i = 0; i < result.pixels.length; i++) {
          const value = result.pixels[i];
          result.pixels[i] = Math.max(0, Math.min(255, Math.floor(f * (value - 128) + 128)));
        }
        result.metadata.contrast = factor;
        return result;
      },
    };
  }

  /**
   * Blur filter (simple box blur)
   */
  static blur(radius: number): ProcessingStage {
    return {
      name: "blur",
      transform: (image: ImageData) => {
        const result = ImageUtils.clone(image);
        // Simplified blur - just average nearby pixels
        const size = image.width;

        for (let y = radius; y < size - radius; y++) {
          for (let x = radius; x < size - radius; x++) {
            let sum = 0;
            let count = 0;

            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const idx = ((y + dy) * size + (x + dx)) * 3;
                sum += image.pixels[idx];
                count++;
              }
            }

            const idx = (y * size + x) * 3;
            result.pixels[idx] = Math.floor(sum / count);
          }
        }

        result.metadata.blur = radius;
        return result;
      },
    };
  }
}

/**
 * Metadata processors
 */
class MetadataProcessors {
  /**
   * Add quality score metadata
   * BUG: Calls calculateChecksum() which is O(n²)!
   * This seems innocent - just adding metadata - but it's the performance killer
   */
  static qualityScore(): ProcessingStage {
    return {
      name: "quality-analysis",
      transform: (image: ImageData) => {
        const result = ImageUtils.clone(image);

        // Calculate image statistics
        const stats = ImageUtils.calculateStats(image);

        // BUG IS HERE: calculateChecksum is O(n²)!
        // This looks like a simple validation step, but it destroys performance
        const checksum = ImageUtils.calculateChecksum(image);

        result.metadata.qualityScore = {
          stats,
          checksum, // This innocent-looking line calls the O(n²) function
          variance: stats.max - stats.min,
          score: Math.floor((stats.mean / 255) * 100),
        };

        return result;
      },
    };
  }

  /**
   * Add histogram metadata
   */
  static histogram(): ProcessingStage {
    return {
      name: "histogram",
      transform: (image: ImageData) => {
        const result = ImageUtils.clone(image);
        const histogram = new Array(256).fill(0);

        for (const pixel of image.pixels) {
          histogram[pixel]++;
        }

        result.metadata.histogram = histogram;
        return result;
      },
    };
  }

  /**
   * Add color analysis metadata
   */
  static colorAnalysis(): ProcessingStage {
    return {
      name: "color-analysis",
      transform: (image: ImageData) => {
        const result = ImageUtils.clone(image);

        let rSum = 0,
          gSum = 0,
          bSum = 0;
        const pixelCount = image.pixels.length / 3;

        for (let i = 0; i < image.pixels.length; i += 3) {
          rSum += image.pixels[i];
          gSum += image.pixels[i + 1];
          bSum += image.pixels[i + 2];
        }

        result.metadata.colorAnalysis = {
          dominantColor: {
            r: Math.floor(rSum / pixelCount),
            g: Math.floor(gSum / pixelCount),
            b: Math.floor(bSum / pixelCount),
          },
        };

        return result;
      },
    };
  }
}

/**
 * Processing pipeline
 */
class ProcessingPipeline {
  private stages: ProcessingStage[] = [];

  addStage(stage: ProcessingStage): void {
    this.stages.push(stage);
  }

  async process(image: ImageData): Promise<ProcessingResult> {
    let current = image;
    const stagesApplied: string[] = [];

    for (const stage of this.stages) {
      current = stage.transform(current);
      stagesApplied.push(stage.name);

      // Allow event loop to breathe
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return {
      imageId: image.id,
      processedAt: Date.now(),
      stagesApplied,
      metadata: current.metadata,
    };
  }

  getStageCount(): number {
    return this.stages.length;
  }
}

/**
 * Batch processor
 */
class BatchProcessor {
  private pipeline: ProcessingPipeline;
  private totalProcessed = 0;

  constructor() {
    this.pipeline = new ProcessingPipeline();

    // Set up default pipeline
    // Filters
    this.pipeline.addStage(Filters.brightness(10));
    this.pipeline.addStage(Filters.contrast(20));
    this.pipeline.addStage(Filters.blur(1));

    // Metadata enrichment - THE BUG IS IN HERE!
    // These look like innocent metadata additions, but one calls O(n²) function
    this.pipeline.addStage(MetadataProcessors.qualityScore()); // ← BUG HERE!
    this.pipeline.addStage(MetadataProcessors.histogram());
    this.pipeline.addStage(MetadataProcessors.colorAnalysis());
  }

  async processBatch(count: number, imageSize: number = 50): Promise<{
    results: ProcessingResult[];
    duration: number;
    imagesProcessed: number;
  }> {
    const startTime = Date.now();
    const results: ProcessingResult[] = [];

    console.log(`Processing batch of ${count} images (${imageSize}x${imageSize} pixels)...`);

    for (let i = 0; i < count; i++) {
      const image = ImageUtils.generateImage(`image-${this.totalProcessed + i}`, imageSize);
      const result = await this.pipeline.process(image);
      results.push(result);

      if ((i + 1) % 10 === 0) {
        console.log(`  Processed ${i + 1}/${count} images...`);
      }
    }

    const duration = Date.now() - startTime;
    this.totalProcessed += count;

    console.log(`✓ Batch complete: ${count} images in ${duration}ms (${(duration / count).toFixed(1)}ms per image)`);

    return {
      results,
      duration,
      imagesProcessed: count,
    };
  }

  getStats(): { totalProcessed: number; pipelineStages: number } {
    return {
      totalProcessed: this.totalProcessed,
      pipelineStages: this.pipeline.getStageCount(),
    };
  }
}

const processor = new BatchProcessor();

// HTTP server
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // POST /process - Process batch of images
  if (url.pathname === "/process" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const count = body.count || 10;
    const imageSize = body.imageSize || 50;

    const result = await processor.processBatch(count, imageSize);

    return Response.json(result);
  }

  // GET /stats - Get processing stats
  if (url.pathname === "/stats") {
    return Response.json(processor.getStats());
  }

  // GET /
  return new Response(
    `Media Processing Service

Endpoints:
  POST /process  - Process batch of images
                   Body: {"count":100,"imageSize":50}
  GET  /stats   - View processing statistics

Debugging the Performance Issue:
  1. Take CPU profile
  2. POST /process with count=100
  3. Stop CPU profile
  4. Analyze profile - look for the hottest function
  5. You'll see one function consuming 90%+ of time

  The bottleneck is NOT obvious from code reading!
  You need CPU profiling to quickly identify it.

  Pipeline stages:
  - brightness adjustment
  - contrast adjustment
  - blur filter
  - quality analysis (← BUG HIDDEN IN HERE)
  - histogram generation
  - color analysis

  Which stage is slow? CPU profiling will tell you instantly.
  Code reading requires tracing through multiple abstraction layers.

Performance comparison:
  Small (10 images):   ~500ms   ✓
  Medium (50 images):  ~12s     ⚠️
  Large (100 images):  ~45s     ❌

  Notice the exponential growth? That's your clue it's O(n²).

Try:
  curl -X POST http://localhost:8082/process -d '{"count":10}'
  curl -X POST http://localhost:8082/process -d '{"count":100}'
  curl http://localhost:8082/stats
`,
    { headers: { "content-type": "text/plain" } }
  );
}

console.log("🎬 Media Processing Service starting on http://localhost:8082");
console.log("   POST /process - Process images");
console.log("   GET  /stats - View statistics");
console.log("");
console.log("⚠️  PERFORMANCE BUG:");
console.log("   Processing time grows exponentially with batch size");
console.log("   10 images: ~500ms");
console.log("   50 images: ~12s");
console.log("   100 images: ~45s");
console.log("");
console.log("🔍 Debug workflow:");
console.log("   1. Start CPU profiling");
console.log("   2. POST /process with count=100");
console.log("   3. Stop profiling when complete");
console.log("   4. Analyze profile - find the hot function");
console.log("   5. One function will be 90%+ of CPU time");
console.log("");
console.log("Code reading won't quickly reveal this!");
console.log("CPU profiling shows the bottleneck immediately.");

Deno.serve({ port: 8082 }, handleRequest);
