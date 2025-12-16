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
    const startTime = Date.now();
    console.log(`\n[OCR ${startTime}] ========== REQUEST START ==========`);

    try {
      if (!req.file) {
        console.log(`[OCR ${startTime}] ❌ No file uploaded`);
        res.status(400).json({
          success: false,
          error: 'No image file uploaded'
        });
        return;
      }

      const imagePath = req.file.path;
      const usePreprocessing = req.body.preprocessing === 'true';
      const engine = req.body.engine || 'hybrid';

      console.log(`[OCR ${startTime}] 📄 File: ${imagePath}`);
      console.log(`[OCR ${startTime}] 📦 Size: ${(req.file.size / 1024).toFixed(2)} KB`);
      console.log(`[OCR ${startTime}] 🔧 Engine: ${engine}`);
      console.log(`[OCR ${startTime}] 🎨 Preprocessing: ${usePreprocessing}`);

      // Validate engine
      if (!['surya', 'paddle', 'hybrid'].includes(engine)) {
        await fs.unlink(imagePath);
        console.log(`[OCR ${startTime}] ❌ Invalid engine: ${engine}`);
        res.status(400).json({
          success: false,
          error: 'Invalid OCR engine. Must be: surya, paddle, or hybrid'
        });
        return;
      }

      // Path to Python OCR service
      const pythonScript = process.env.NODE_ENV === 'production'
        ? '/app/src/ocr/ocr_service.py'
        : path.join(__dirname, '..', 'ocr', 'ocr_service.py');

      console.log(`[OCR ${startTime}] ⏳ Starting Python OCR process...`);
      const pythonStart = Date.now();

      // Execute Python OCR service
      const { stdout, stderr } = await execPromise(
        `python "${pythonScript}" "${imagePath}" "${usePreprocessing}" "${engine}"`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      const pythonDuration = Date.now() - pythonStart;
      console.log(`[OCR ${startTime}] ✅ Python completed in ${(pythonDuration / 1000).toFixed(2)}s`);

      // Log Python stderr for debugging
      if (stderr) {
        console.log(`[OCR ${startTime}] 📋 Python stderr:`, stderr);
      }

      // Clean up uploaded file
      await fs.unlink(imagePath);
      console.log(`[OCR ${startTime}] 🗑️  Cleaned up uploaded file`);

      // Parse JSON result
      const result = JSON.parse(stdout);

      // Log result without base64 image
      const logResult = { ...result };
      if (logResult.preprocessedImage) {
        logResult.preprocessedImage = `[base64 image ${logResult.preprocessedImage.length} chars]`;
      }
      console.log(`[OCR ${startTime}] 📊 Result:`, JSON.stringify(logResult, null, 2));

      const totalDuration = Date.now() - startTime;
      console.log(`[OCR ${startTime}] ⏱️  Total time: ${(totalDuration / 1000).toFixed(2)}s`);
      console.log(`[OCR ${startTime}] ========== REQUEST END ==========\n`);

      res.status(200).json(result);
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      console.log(`[OCR ${startTime}] ❌ Failed after ${(totalDuration / 1000).toFixed(2)}s`);

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
