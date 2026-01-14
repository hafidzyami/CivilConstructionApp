import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

// Assumes python service is at port 7000, same as OCR
const PYTHON_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://ocr-service:7000';

export const getLayers = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path));

    const response = await axios.post(`${PYTHON_SERVICE_URL}/cad/layers`, formData, {
      headers: { ...formData.getHeaders() },
    });

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    res.json(response.data);
  } catch (error: any) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error('CAD Layer Error:', error.message);
    res.status(500).json({ message: 'Failed to extract layers', error: error.message });
  }
};

export const processCad = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path));
    formData.append('layers', req.body.layers || '[]');

    const response = await axios.post(`${PYTHON_SERVICE_URL}/cad/process`, formData, {
      headers: { ...formData.getHeaders() },
    });

    fs.unlinkSync(req.file.path);
    res.json(response.data);
  } catch (error: any) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error('CAD Process Error:', error.message);
    res.status(500).json({ message: 'Failed to process CAD file', error: error.message });
  }
};