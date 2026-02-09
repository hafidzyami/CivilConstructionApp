import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { SegmentationController } from '../controllers/segmentation.controller';

const router = Router();

// Configure multer for file uploads
const upload = multer({
    dest: path.join(__dirname, '../../uploads/temp'),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

/**
 * @swagger
 * /api/segmentation/process:
 *   post:
 *     summary: Process a floorplan image for room segmentation
 *     tags: [Segmentation]
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
 *     responses:
 *       200:
 *         description: Segmentation results (base64 images)
 *       500:
 *         description: Server error
 */
router.post('/process', upload.single('image'), SegmentationController.process);

export default router;
