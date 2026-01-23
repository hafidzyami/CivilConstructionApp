import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

// CAD service is at port 7001
const CAD_SERVICE_URL = process.env.CAD_SERVICE_URL || 'http://cad-service:7001';

export const getLayers = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname
    });

    const response = await axios.post(`${CAD_SERVICE_URL}/cad/layers`, formData, {
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
    formData.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname
    });
    formData.append('layers', req.body.layers || '[]');

    const response = await axios.post(`${CAD_SERVICE_URL}/cad/process`, formData, {
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

export const processCadAuto = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname
    });

    const response = await axios.post(`${CAD_SERVICE_URL}/cad/process-auto`, formData, {
      headers: { ...formData.getHeaders() },
    });

    fs.unlinkSync(req.file.path);
    res.json(response.data);
  } catch (error: any) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error('CAD Auto Process Error:', error.message);
    res.status(500).json({ message: 'Failed to auto-process CAD file', error: error.message });
  }
};

export const processCadLLM = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname
    });

    const response = await axios.post(`${CAD_SERVICE_URL}/cad/process-llm`, formData, {
      headers: { ...formData.getHeaders() },
      timeout: 120000, // 2 minutes timeout for LLM processing
    });

    fs.unlinkSync(req.file.path);
    res.json(response.data);
  } catch (error: any) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error('CAD LLM Process Error:', error.message);
    res.status(500).json({ message: 'Failed to process CAD file with LLM', error: error.message });
  }
};