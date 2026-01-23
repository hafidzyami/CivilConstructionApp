import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

// CAD service is at port 7001
const CAD_SERVICE_URL = process.env.CAD_SERVICE_URL || 'http://cad-service:7001';

// Proxy to fetch file from URL and process it
export const processFromUrl = async (req: Request, res: Response) => {
  try {
    const { fileUrl } = req.body;
    
    if (!fileUrl) {
      return res.status(400).json({ success: false, message: 'No fileUrl provided' });
    }

    console.log('Fetching DXF from URL:', fileUrl);

    // Download the file from MinIO/URL
    const fileResponse = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    // Extract filename from URL
    const urlParts = fileUrl.split('/');
    const filename = urlParts[urlParts.length - 1] || 'drawing.dxf';

    // Create form data with the downloaded file
    const formData = new FormData();
    formData.append('file', Buffer.from(fileResponse.data), {
      filename: filename,
      contentType: 'application/octet-stream',
    });

    // Send to CAD service
    const response = await axios.post(`${CAD_SERVICE_URL}/cad/process`, formData, {
      headers: { ...formData.getHeaders() },
      timeout: 60000,
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('CAD Process from URL Error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process CAD file from URL', 
      error: error.message 
    });
  }
};

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