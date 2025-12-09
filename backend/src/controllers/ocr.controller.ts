import { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execPromise = promisify(exec);

export class OCRController {
  /**
   * Process OCR on uploaded image
   */
  async processOCR(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No image file uploaded'
        });
        return;
      }

      const imagePath = req.file.path;
      const usePreprocessing = req.body.preprocessing === 'true';
      const engine = req.body.engine || 'hybrid';

      // Validate engine
      if (!['surya', 'paddle', 'hybrid'].includes(engine)) {
        await fs.unlink(imagePath); // Clean up uploaded file
        res.status(400).json({
          success: false,
          error: 'Invalid OCR engine. Must be: surya, paddle, or hybrid'
        });
        return;
      }

      // Path to Python OCR service
      const pythonScript = path.join(__dirname, '..', 'ocr', 'ocr_service.py');

      // Execute Python OCR service
      const { stdout, stderr } = await execPromise(
        `python "${pythonScript}" "${imagePath}" "${usePreprocessing}" "${engine}"`,
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large results
      );

      // Clean up uploaded file
      await fs.unlink(imagePath);

      // Parse JSON result
      const result = JSON.parse(stdout);

      res.status(200).json(result);
    } catch (error) {
      // Clean up uploaded file if it exists
      if (req.file?.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      console.error('OCR processing error:', error);

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'OCR processing failed'
      });
    }
  }
}
