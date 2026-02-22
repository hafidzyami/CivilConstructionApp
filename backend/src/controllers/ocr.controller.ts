import { Request, Response } from 'express';
import fs from 'fs/promises';
import fetch from 'node-fetch';

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';
const RUNPOD_OCR_ENDPOINT_ID = process.env.RUNPOD_OCR_ENDPOINT_ID || '';
const RUNPOD_VLM_ENDPOINT_ID = process.env.RUNPOD_VLM_ENDPOINT_ID || '';
const RUNPOD_TIMEOUT_MS = 300_000; // 5 minutes max polling (cold starts can take ~2-3 min)
const RUNPOD_POLL_INTERVAL_MS = 1500;

function getRunpodBaseUrl(engine: string): string {
  const endpointId = engine === 'vlm' ? RUNPOD_VLM_ENDPOINT_ID : RUNPOD_OCR_ENDPOINT_ID;
  return `https://api.runpod.ai/v2/${endpointId}`;
}

export class OCRController {
  /**
   * Process OCR on uploaded file via RunPod serverless GPU
   */
  async processOCR(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    console.log(`\n[OCR ${startTime}] ========== REQUEST START ==========`);

    try {
      if (!req.file) {
        console.log(`[OCR ${startTime}] No file uploaded`);
        res.status(400).json({
          success: false,
          error: 'No image file uploaded'
        });
        return;
      }

      if (!RUNPOD_API_KEY || (!RUNPOD_OCR_ENDPOINT_ID && !RUNPOD_VLM_ENDPOINT_ID)) {
        console.log(`[OCR ${startTime}] RunPod credentials not configured`);
        res.status(500).json({
          success: false,
          error: 'RunPod API credentials not configured'
        });
        return;
      }

      const imagePath = req.file.path;
      const usePreprocessing = req.body.preprocessing === 'true';
      const engine = req.body.engine || 'hybrid';

      console.log(`[OCR ${startTime}] File: ${req.file.originalname}`);
      console.log(`[OCR ${startTime}] Size: ${(req.file.size / 1024).toFixed(2)} KB`);
      console.log(`[OCR ${startTime}] Engine: ${engine}`);
      console.log(`[OCR ${startTime}] Preprocessing: ${usePreprocessing}`);

      // Validate engine
      if (!['surya', 'paddle', 'hybrid', 'vlm'].includes(engine)) {
        await fs.unlink(imagePath);
        console.log(`[OCR ${startTime}] Invalid engine: ${engine}`);
        res.status(400).json({
          success: false,
          error: 'Invalid OCR engine. Must be: surya, paddle, hybrid, or vlm'
        });
        return;
      }

      // Read file and convert to base64
      const fileBuffer = await fs.readFile(imagePath);
      const imageBase64 = fileBuffer.toString('base64');

      // Clean up uploaded file immediately
      await fs.unlink(imagePath);
      console.log(`[OCR ${startTime}] Cleaned up uploaded file`);

      // Submit async job to RunPod
      const runpodBaseUrl = getRunpodBaseUrl(engine);
      const endpointId = engine === 'vlm' ? RUNPOD_VLM_ENDPOINT_ID : RUNPOD_OCR_ENDPOINT_ID;
      console.log(`[OCR ${startTime}] Submitting job to RunPod ${engine === 'vlm' ? 'VLM' : 'OCR'} endpoint (${endpointId})...`);
      const submitStart = Date.now();

      const submitResponse = await fetch(`${runpodBaseUrl}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RUNPOD_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: {
            image: imageBase64,
            filename: req.file.originalname,
            engine,
            preprocessing: usePreprocessing
          }
        })
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        console.log(`[OCR ${startTime}] RunPod submit error: ${submitResponse.status} - ${errorText}`);
        throw new Error(`RunPod submit failed: ${submitResponse.status} - ${errorText}`);
      }

      const submitResult = await submitResponse.json() as { id: string; status: string };
      const jobId = submitResult.id;
      console.log(`[OCR ${startTime}] Job submitted: ${jobId}`);

      // Poll for result
      let result: any = null;
      const pollStart = Date.now();

      while (Date.now() - pollStart < RUNPOD_TIMEOUT_MS) {
        await new Promise(resolve => setTimeout(resolve, RUNPOD_POLL_INTERVAL_MS));

        const statusResponse = await fetch(`${runpodBaseUrl}/status/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${RUNPOD_API_KEY}`
          }
        });

        if (!statusResponse.ok) {
          console.log(`[OCR ${startTime}] Poll error: ${statusResponse.status}`);
          continue;
        }

        const statusResult = await statusResponse.json() as {
          status: string;
          output?: any;
          error?: string;
        };

        if (statusResult.status === 'COMPLETED') {
          result = statusResult.output;
          break;
        }

        if (statusResult.status === 'FAILED') {
          throw new Error(`RunPod job failed: ${statusResult.error || 'Unknown error'}`);
        }

        // IN_QUEUE or IN_PROGRESS - keep polling
        console.log(`[OCR ${startTime}] Job ${jobId}: ${statusResult.status} (${((Date.now() - pollStart) / 1000).toFixed(1)}s)`);
      }

      if (!result) {
        throw new Error(`RunPod job timed out after ${RUNPOD_TIMEOUT_MS / 1000}s`);
      }

      const apiDuration = Date.now() - submitStart;
      console.log(`[OCR ${startTime}] RunPod completed in ${(apiDuration / 1000).toFixed(2)}s`);

      // Check for error in result
      if (result.error) {
        throw new Error(`OCR processing error: ${result.error}`);
      }

      // Log result summary
      console.log(`[OCR ${startTime}] Result summary:`, {
        textLength: result.text?.length || 0,
        hasPreprocessedImage: !!result.preprocessedImage,
        textLinesCount: result.results?.text_lines?.length || 0,
        timingMs: result._timing_ms
      });

      const totalDuration = Date.now() - startTime;
      console.log(`[OCR ${startTime}] Total time: ${(totalDuration / 1000).toFixed(2)}s`);
      console.log(`[OCR ${startTime}] ========== REQUEST END ==========\n`);

      res.status(200).json({
        success: true,
        textContent: result.text,
        preprocessedImage: result.preprocessedImage,
        preprocessingMetadata: result.preprocessingMetadata,
        results: result.results
      });
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      console.log(`[OCR ${startTime}] Failed after ${(totalDuration / 1000).toFixed(2)}s`);

      // Clean up uploaded file if it exists
      if (req.file?.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      console.error(`[OCR ${startTime}] Error:`, error);
      console.log(`[OCR ${startTime}] ========== REQUEST END (ERROR) ==========\n`);

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'OCR processing failed'
      });
    }
  }
}
