import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import fetch from 'node-fetch';
import logger from '../lib/logger';

const CONTEXT = 'CubiCasa';

const CUBICASA_SERVICE_URL = process.env.CUBICASA_SERVICE_URL || 'http://cubicasa-service:7002';
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';
const RUNPOD_CUBICASA_ENDPOINT_ID = process.env.RUNPOD_CUBICASA_ENDPOINT_ID || '';
const RUNPOD_TIMEOUT_MS = 300_000; // 5 minutes – CPU inference is slower than GPU
const RUNPOD_POLL_INTERVAL_MS = 2000;

// ------------------------------------------------------------------
// RunPod path
// ------------------------------------------------------------------
async function analyzeViaRunpod(imageBuffer: Buffer, filename: string): Promise<any> {
  const runpodBaseUrl = `https://api.runpod.ai/v2/${RUNPOD_CUBICASA_ENDPOINT_ID}`;

  const imageBase64 = imageBuffer.toString('base64');

  // Submit job
  const submitRes = await fetch(`${runpodBaseUrl}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RUNPOD_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: { image: imageBase64, filename } }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`RunPod submit failed: ${submitRes.status} – ${text}`);
  }

  const { id: jobId } = (await submitRes.json()) as { id: string };
  logger.info(CONTEXT, 'analyzeViaRunpod: job submitted', { jobId });

  // Poll until done
  const deadline = Date.now() + RUNPOD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, RUNPOD_POLL_INTERVAL_MS));

    const statusRes = await fetch(`${runpodBaseUrl}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
    });

    if (!statusRes.ok) continue;

    const status = (await statusRes.json()) as { status: string; output?: any; error?: string };

    if (status.status === 'COMPLETED') {
      return status.output;
    }
    if (status.status === 'FAILED') {
      throw new Error(`RunPod job failed: ${status.error || 'unknown error'}`);
    }

    logger.debug(CONTEXT, `analyzeViaRunpod: job ${jobId} status`, { status: status.status, elapsed: `${((Date.now() - (deadline - RUNPOD_TIMEOUT_MS)) / 1000).toFixed(1)}s` });
  }

  throw new Error(`RunPod job timed out after ${RUNPOD_TIMEOUT_MS / 1000}s`);
}

// ------------------------------------------------------------------
// Local service path
// ------------------------------------------------------------------
async function analyzeViaLocalService(filePath: string, filename: string): Promise<any> {
  const formData = new FormData();
  formData.append('image', fs.createReadStream(filePath), { filename });

  const response = await axios.post(`${CUBICASA_SERVICE_URL}/analyze`, formData, {
    headers: { ...formData.getHeaders() },
    timeout: 120000,
    maxContentLength: 50 * 1024 * 1024,
    maxBodyLength: 50 * 1024 * 1024,
  });

  return response.data;
}

// ------------------------------------------------------------------
// Controller
// ------------------------------------------------------------------
/**
 * Analyze a floor plan image using CubiCasa5k model.
 * Uses RunPod serverless when RUNPOD_CUBICASA_ENDPOINT_ID is set,
 * otherwise proxies to the local cubicasa-service container.
 */
export const analyzeFloorplan = async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No image file uploaded' });
  }

  const filePath = req.file.path;
  const filename = req.file.originalname;
  const useRunpod = !!(RUNPOD_API_KEY && RUNPOD_CUBICASA_ENDPOINT_ID);

  logger.info(CONTEXT, 'analyzeFloorplan: request received', { filename, mode: useRunpod ? 'runpod' : 'local' });

  try {
    let data: any;

    if (useRunpod) {
      logger.info(CONTEXT, 'analyzeFloorplan: using RunPod endpoint', { endpoint: RUNPOD_CUBICASA_ENDPOINT_ID })
      const imageBuffer = fs.readFileSync(filePath);
      fs.unlinkSync(filePath);
      data = await analyzeViaRunpod(imageBuffer, filename);
    } else {
      logger.info(CONTEXT, 'analyzeFloorplan: using local service', { url: CUBICASA_SERVICE_URL });
      data = await analyzeViaLocalService(filePath, filename);
      fs.unlinkSync(filePath);
    }

    logger.info(CONTEXT, 'analyzeFloorplan: succeeded', { filename });
    res.json(data);
  } catch (error: any) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    logger.error(CONTEXT, 'analyzeFloorplan: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to analyze floor plan',
      error: error.message,
    });
  }
};

/**
 * Health-check: pings the local cubicasa-service (RunPod has no persistent /health).
 */
export const health = async (_req: Request, res: Response) => {
  if (RUNPOD_API_KEY && RUNPOD_CUBICASA_ENDPOINT_ID) {
    logger.info(CONTEXT, 'health: mode=runpod', { endpoint: RUNPOD_CUBICASA_ENDPOINT_ID });
    return res.json({
      status: 'ok',
      mode: 'runpod',
      endpoint: RUNPOD_CUBICASA_ENDPOINT_ID,
    });
  }
  try {
    logger.info(CONTEXT, 'health: checking local service', { url: CUBICASA_SERVICE_URL });
    const response = await axios.get(`${CUBICASA_SERVICE_URL}/health`, { timeout: 5000 });
    res.json(response.data);
  } catch (error: any) {
    logger.error(CONTEXT, 'health: local service unavailable', { error: error.message });
    res.status(503).json({ status: 'unavailable', error: error.message });
  }
};
