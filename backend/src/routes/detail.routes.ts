import { Router } from 'express';
import detailController from '../controllers/detail.controller';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Detail:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated id of the detail
 *         latitude:
 *           type: number
 *           format: float
 *           description: Latitude coordinate
 *         longitude:
 *           type: number
 *           format: float
 *           description: Longitude coordinate
 *         address:
 *           type: string
 *           description: Address of the location
 *         environment:
 *           type: object
 *           description: Environment data in JSON format
 *         decision:
 *           type: string
 *           description: Decision made
 *         explanation:
 *           type: string
 *           description: Explanation of the decision
 *         status:
 *           type: string
 *           enum: [PENDING, PROCESSING, COMPLETED, FAILED]
 *           description: Analysis status
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *         deletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Deletion timestamp (soft delete)
 *     CreateDetailInput:
 *       type: object
 *       required:
 *         - latitude
 *         - longitude
 *       properties:
 *         latitude:
 *           type: number
 *           format: float
 *         longitude:
 *           type: number
 *           format: float
 *         address:
 *           type: string
 *         environment:
 *           type: object
 *         decision:
 *           type: string
 *         explanation:
 *           type: string
 *         status:
 *           type: string
 *           enum: [PENDING, PROCESSING, COMPLETED, FAILED]
 *     UpdateDetailInput:
 *       type: object
 *       properties:
 *         latitude:
 *           type: number
 *           format: float
 *         longitude:
 *           type: number
 *           format: float
 *         address:
 *           type: string
 *         environment:
 *           type: object
 *         decision:
 *           type: string
 *         explanation:
 *           type: string
 *         status:
 *           type: string
 *           enum: [PENDING, PROCESSING, COMPLETED, FAILED]
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *         message:
 *           type: string
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 */

/**
 * @swagger
 * /api/details:
 *   get:
 *     summary: Get all details with pagination
 *     tags: [Details]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Detail'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', detailController.getAll);

/**
 * @swagger
 * /api/details/{id}:
 *   get:
 *     summary: Get detail by ID
 *     tags: [Details]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Detail ID
 *     responses:
 *       200:
 *         description: Detail found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Detail'
 *       404:
 *         description: Detail not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', detailController.getById);

/**
 * @swagger
 * /api/details:
 *   post:
 *     summary: Create a new detail
 *     tags: [Details]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDetailInput'
 *     responses:
 *       201:
 *         description: Detail created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Detail'
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', detailController.create);

/**
 * @swagger
 * /api/details/{id}:
 *   put:
 *     summary: Update a detail
 *     tags: [Details]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Detail ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateDetailInput'
 *     responses:
 *       200:
 *         description: Detail updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Detail'
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Detail not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/:id', detailController.update);

/**
 * @swagger
 * /api/details/{id}:
 *   delete:
 *     summary: Delete a detail (soft delete)
 *     tags: [Details]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Detail ID
 *     responses:
 *       200:
 *         description: Detail deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Detail not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:id', detailController.delete);

export default router;
