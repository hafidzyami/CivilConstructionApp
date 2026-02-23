import express from 'express';
import multer from 'multer';
import path from 'path';
import * as cubicasaController from '../controllers/cubicasa.controller';

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '../../uploads/') });

/**
 * @swagger
 * /api/cubicasa/analyze:
 *   post:
 *     summary: Analyze a floor plan image using CubiCasa5k model
 *     tags: [CubiCasa5k]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: The floor plan image file (PNG, JPG)
 *     responses:
 *       200:
 *         description: Floor plan analysis result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 rooms:
 *                   type: object
 *                 icons:
 *                   type: object
 *                 imageSize:
 *                   type: object
 *                 visualizations:
 *                   type: object
 */
router.post('/analyze', upload.single('image'), cubicasaController.analyzeFloorplan);

/**
 * @swagger
 * /api/cubicasa/health:
 *   get:
 *     summary: Check CubiCasa5k service health
 *     tags: [CubiCasa5k]
 *     responses:
 *       200:
 *         description: Service is healthy
 */
router.get('/health', cubicasaController.health);

export default router;
