import { Request, Response } from 'express';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import logger from '../lib/logger';

const CONTEXT = 'OCR';

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
    logger.info(CONTEXT, '========== REQUEST START ==========', { ts: startTime });

    try {
      if (!req.file) {
        logger.warn(CONTEXT, 'processOCR: no file uploaded');
        res.status(400).json({
          success: false,
          error: 'No image file uploaded'
        });
        return;
      }

      if (!RUNPOD_API_KEY || (!RUNPOD_OCR_ENDPOINT_ID && !RUNPOD_VLM_ENDPOINT_ID)) {
        logger.warn(CONTEXT, 'processOCR: RunPod credentials not configured');
        res.status(500).json({
          success: false,
          error: 'RunPod API credentials not configured'
        });
        return;
      }

      const imagePath = req.file.path;
      const usePreprocessing = req.body.preprocessing === 'true';
      const engine = req.body.engine || 'hybrid';

      logger.info(CONTEXT, 'processOCR: request details', {
        file: req.file.originalname,
        sizeKB: (req.file.size / 1024).toFixed(2),
        engine,
        preprocessing: usePreprocessing,
      });

      // Validate engine
      if (!['surya', 'paddle', 'hybrid', 'vlm'].includes(engine)) {
        await fs.unlink(imagePath);
        logger.warn(CONTEXT, 'processOCR: invalid engine', { engine });
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
      logger.debug(CONTEXT, 'processOCR: cleaned up uploaded file');

      // Submit async job to RunPod
      const runpodBaseUrl = getRunpodBaseUrl(engine);
      const endpointId = engine === 'vlm' ? RUNPOD_VLM_ENDPOINT_ID : RUNPOD_OCR_ENDPOINT_ID;
      logger.info(CONTEXT, `processOCR: submitting job to RunPod ${engine === 'vlm' ? 'VLM' : 'OCR'} endpoint`, { endpointId });
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
        logger.error(CONTEXT, 'processOCR: RunPod submit error', { status: submitResponse.status, error: errorText });
        throw new Error(`RunPod submit failed: ${submitResponse.status} - ${errorText}`);
      }

      const submitResult = await submitResponse.json() as { id: string; status: string };
      const jobId = submitResult.id;
      logger.info(CONTEXT, 'processOCR: job submitted', { jobId });

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
          logger.warn(CONTEXT, 'processOCR: poll error', { status: statusResponse.status });
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
        logger.debug(CONTEXT, `processOCR: job ${jobId} status`, { status: statusResult.status, elapsed: `${((Date.now() - pollStart) / 1000).toFixed(1)}s` });
      }

      if (!result) {
        throw new Error(`RunPod job timed out after ${RUNPOD_TIMEOUT_MS / 1000}s`);
      }

      const apiDuration = Date.now() - submitStart;
      logger.info(CONTEXT, 'processOCR: RunPod completed', { duration: `${(apiDuration / 1000).toFixed(2)}s` });

      // Check for error in result
      if (result.error) {
        throw new Error(`OCR processing error: ${result.error}`);
      }

      // Log result summary
      logger.info(CONTEXT, 'processOCR: result summary', {
        textLength: result.text?.length || 0,
        hasPreprocessedImage: !!result.preprocessedImage,
        textLinesCount: result.results?.text_lines?.length || 0,
        timingMs: result._timing_ms,
      });

      const totalDuration = Date.now() - startTime;
      logger.info(CONTEXT, `processOCR: total time ${(totalDuration / 1000).toFixed(2)}s`);
      logger.info(CONTEXT, '========== REQUEST END ==========');

      res.status(200).json({
        success: true,
        textContent: result.text,
        preprocessedImage: result.preprocessedImage,
        preprocessedImages: result.preprocessedImages || null,
        preprocessingMetadata: result.preprocessingMetadata,
        results: result.results
      });
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      logger.error(CONTEXT, `processOCR: failed after ${(totalDuration / 1000).toFixed(2)}s`, {
        error: error instanceof Error ? error.message : String(error),
      });

      // Clean up uploaded file if it exists
      if (req.file?.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      logger.error(CONTEXT, '========== REQUEST END (ERROR) ==========');

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'OCR processing failed'
      });
    }
  }
}
