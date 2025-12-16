import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { OCRController } from '../controllers/ocr.controller';

const router = Router();
const ocrController = new OCRController();

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use absolute path that matches where index.ts creates the directory
    const uploadDir = process.env.NODE_ENV === 'production'
      ? '/app/dist/ocr/uploads'
      : path.join(__dirname, '..', 'ocr', 'uploads');
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
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|bmp|tiff|tif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPG, PNG, BMP, TIFF)'));
    }
  }
});

/**
 * @swagger
 * /api/ocr/process:
 *   post:
 *     summary: Process OCR on uploaded image
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
 *                 description: Image file to process
 *               preprocessing:
 *                 type: string
 *                 enum: [true, false]
 *                 description: Whether to apply preprocessing
 *               engine:
 *                 type: string
 *                 enum: [surya, paddle, hybrid]
 *                 description: OCR engine to use
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
