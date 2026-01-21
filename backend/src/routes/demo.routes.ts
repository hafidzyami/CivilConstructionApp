import { Router } from 'express';
import * as demoController from '../controllers/demo.controller';

const router = Router();

/**
 * @swagger
 * /api/demo/next-user-id:
 *   get:
 *     summary: Get next available user ID
 *     tags: [Demo]
 *     responses:
 *       200:
 *         description: Next user ID retrieved successfully
 */
router.get('/next-user-id', demoController.getNextUserId);

/**
 * @swagger
 * /api/demo/session:
 *   post:
 *     summary: Get or create demo session
 *     tags: [Demo]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Session retrieved or created successfully
 */
router.post('/session', demoController.getOrCreateSession);

/**
 * @swagger
 * /api/demo/upload-documents:
 *   post:
 *     summary: Upload building documents
 *     tags: [Demo]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - documents
 *             properties:
 *               sessionId:
 *                 type: integer
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Documents uploaded successfully
 */
router.post('/upload-documents', demoController.uploadMiddleware, demoController.uploadDocuments);

/**
 * @swagger
 * /api/demo/cad-data:
 *   post:
 *     summary: Save CAD analysis data
 *     tags: [Demo]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *             properties:
 *               sessionId:
 *                 type: integer
 *               siteArea:
 *                 type: number
 *               buildingArea:
 *                 type: number
 *               floorArea:
 *                 type: number
 *               bcr:
 *                 type: number
 *               far:
 *                 type: number
 *               rawData:
 *                 type: object
 *     responses:
 *       200:
 *         description: CAD data saved successfully
 */
router.post('/cad-data', demoController.saveCadData);

/**
 * @swagger
 * /api/demo/infrastructure-data:
 *   post:
 *     summary: Save infrastructure explorer data
 *     tags: [Demo]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *             properties:
 *               sessionId:
 *                 type: integer
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               radius:
 *                 type: number
 *               buildings:
 *                 type: object
 *               roads:
 *                 type: object
 *               railways:
 *                 type: object
 *               waterways:
 *                 type: object
 *               rawData:
 *                 type: object
 *     responses:
 *       200:
 *         description: Infrastructure data saved successfully
 */
router.post('/infrastructure-data', demoController.saveInfrastructureData);

/**
 * @swagger
 * /api/demo/ocr-data:
 *   post:
 *     summary: Save OCR data
 *     tags: [Demo]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *             properties:
 *               sessionId:
 *                 type: integer
 *               fileName:
 *                 type: string
 *               extractedText:
 *                 type: string
 *               engine:
 *                 type: string
 *               rawData:
 *                 type: object
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: OCR data saved successfully
 */
router.post('/ocr-data', demoController.uploadMiddleware, demoController.saveOcrData);

/**
 * @swagger
 * /api/demo/sessions:
 *   get:
 *     summary: Get all demo sessions (Admin only)
 *     tags: [Demo]
 *     responses:
 *       200:
 *         description: Sessions retrieved successfully
 */
router.get('/sessions', demoController.getAllSessions);

/**
 * @swagger
 * /api/demo/sessions/{id}:
 *   get:
 *     summary: Get demo session by ID
 *     tags: [Demo]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Session retrieved successfully
 */
router.get('/sessions/:id', demoController.getSessionById);

export default router;
