import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const CUBICASA_SERVICE_URL = process.env.CUBICASA_SERVICE_URL || 'http://cubicasa-service:7002';

/**
 * Analyze a floor plan image using CubiCasa5k model.
 * Proxies the uploaded image to the CubiCasa5k microservice.
 */
export const analyzeFloorplan = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }

    const formData = new FormData();
    formData.append('image', fs.createReadStream(req.file.path), {
      filename: req.file.originalname,
    });

    const response = await axios.post(`${CUBICASA_SERVICE_URL}/analyze`, formData, {
      headers: { ...formData.getHeaders() },
      timeout: 120000, // 2 minutes – model inference can be slow
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
    });

    fs.unlinkSync(req.file.path);
    res.json(response.data);
  } catch (error: any) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('CubiCasa5k Analyze Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze floor plan',
      error: error.message,
    });
  }
};

/**
 * Health-check proxy for the CubiCasa5k service.
 */
export const health = async (_req: Request, res: Response) => {
  try {
    const response = await axios.get(`${CUBICASA_SERVICE_URL}/health`, { timeout: 5000 });
    res.json(response.data);
  } catch (error: any) {
    res.status(503).json({ status: 'unavailable', error: error.message });
  }
};
