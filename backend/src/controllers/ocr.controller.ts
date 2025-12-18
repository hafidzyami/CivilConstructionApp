import { Request, Response } from 'express';
import fs from 'fs/promises';
import FormData from 'form-data';
import fetch from 'node-fetch';

export class OCRController {
  /**
   * Process OCR on uploaded image via OCR microservice
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

      console.log(`[OCR ${startTime}] 📄 File: ${req.file.originalname}`);
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

      // Get OCR service URL from environment
      const ocrServiceUrl = process.env.OCR_SERVICE_URL || 'http://localhost:7000';
      console.log(`[OCR ${startTime}] 🌐 Calling OCR service: ${ocrServiceUrl}`);

      const apiStart = Date.now();

      // Read file and create form data
      const fileBuffer = await fs.readFile(imagePath);
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });
      formData.append('preprocessing', usePreprocessing.toString());
      formData.append('engine', engine);

      // Call OCR microservice
      const response = await fetch(`${ocrServiceUrl}/ocr/process`, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });

      const apiDuration = Date.now() - apiStart;
      console.log(`[OCR ${startTime}] ✅ OCR service completed in ${(apiDuration / 1000).toFixed(2)}s`);

      // Clean up uploaded file
      await fs.unlink(imagePath);
      console.log(`[OCR ${startTime}] 🗑️  Cleaned up uploaded file`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[OCR ${startTime}] ❌ OCR service error: ${response.status} - ${errorText}`);
        throw new Error(`OCR service error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Log result without base64 image
      const logResult = { ...result };
      if (logResult.preprocessedImage) {
        logResult.preprocessedImage = `[base64 image ${logResult.preprocessedImage.length} chars]`;
      }
      console.log(`[OCR ${startTime}] 📊 Result summary:`, {
        textLength: result.text?.length || 0,
        hasPreprocessedImage: !!result.preprocessedImage,
        textLinesCount: result.results?.text_lines?.length || 0
      });

      const totalDuration = Date.now() - startTime;
      console.log(`[OCR ${startTime}] ⏱️  Total time: ${(totalDuration / 1000).toFixed(2)}s`);
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
