import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

export const SegmentationController = {
    process: async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            const filePath = req.file.path;
            const fileName = req.file.filename;

            // Construct form data to send to the ML service
            const formData = new FormData();
            formData.append('file', fs.createReadStream(filePath), fileName);

            // Call the ML service (assuming it's running on port 7002)
            // Note: In a real production setup, the URL should be configurable via env vars
            const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:7002';

            try {
                const response = await axios.post(`${mlServiceUrl}/segmentation`, formData, {
                    headers: {
                        ...formData.getHeaders(),
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                });

                // The ML service returns base64 encoded images
                // We can pass them directly to the frontend
                return res.json({
                    success: true,
                    data: response.data
                });

            } catch (error: any) {
                console.error('ML Service Error:', error.message);
                if (error.response) {
                    console.error('ML Service Response:', error.response.data);
                    return res.status(error.response.status).json({
                        success: false,
                        message: 'ML Service failed',
                        error: error.response.data
                    });
                }
                return res.status(503).json({
                    success: false,
                    message: 'ML Service unavailable',
                    error: error.message
                });
            } finally {
                // Clean up the uploaded file from the backend text upload dir
                if (req.file && fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }

        } catch (error: any) {
            console.error('Segmentation Controller Error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
};
