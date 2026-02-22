import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { OCRController } from '../controllers/ocr.controller';

const router = Router();
const ocrController = new OCRController();

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use temporary upload directory for files before forwarding to OCR service
    const uploadDir = process.env.NODE_ENV === 'production'
      ? '/app/dist/uploads'
      : path.join(__dirname, '..', 'uploads');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'upload-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size (increased for PDF/DOCX)
  },
  fileFilter: (req, file, cb) => {
    // Image extensions
    const imageTypes = /jpeg|jpg|png|bmp|tiff|tif/;
    // Document extensions
    const documentExtensions = /pdf|doc|docx/;
    // Document MIME types
    const documentMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const isImage = imageTypes.test(ext) && imageTypes.test(file.mimetype);
    const isDocument = documentExtensions.test(ext) || documentMimeTypes.includes(file.mimetype);

    if (isImage || isDocument) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, BMP, TIFF) and documents (PDF, DOC, DOCX) are allowed'));
    }
  }
});

/**
 * @swagger
 * /api/ocr/process:
 *   post:
 *     summary: Process OCR on uploaded file (image, PDF, or DOCX)
 *     tags: [OCR]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: File to process (JPG, PNG, BMP, TIFF, PDF, DOC, DOCX)
 *               preprocessing:
 *                 type: string
 *                 enum: [true, false]
 *                 description: Whether to apply preprocessing
 *               engine:
 *                 type: string
 *                 enum: [surya, paddle, hybrid, vlm]
 *                 description: OCR engine to use (vlm uses Qwen2.5-VL-7B vision model)
 *     responses:
 *       200:
 *         description: OCR processing successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 textContent:
 *                   type: string
 *                 results:
 *                   type: object
 *                 preprocessedImage:
 *                   type: string
 *                 metadata:
 *                   type: object
 *       400:
 *         description: Bad request (no file or invalid parameters)
 *       500:
 *         description: Server error
 */
router.post('/process', upload.single('image'), (req, res) => 
  ocrController.processOCR(req, res)
);

export default router;
