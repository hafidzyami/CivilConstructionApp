import { Router } from 'express';
import { getOSMData } from '../controllers/osm.controller';

const router = Router();

/**
 * @swagger
 * /api/osm:
 *   post:
 *     summary: Fetch OpenStreetMap infrastructure data
 *     tags: [OSM]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lat
 *               - lon
 *               - radius
 *             properties:
 *               lat:
 *                 type: number
 *                 description: Latitude coordinate
 *                 example: -6.9147
 *               lon:
 *                 type: number
 *                 description: Longitude coordinate
 *                 example: 107.6098
 *               radius:
 *                 type: number
 *                 description: Search radius in meters
 *                 example: 5000
 *     responses:
 *       200:
 *         description: GeoJSON FeatureCollection of infrastructure
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   example: FeatureCollection
 *                 features:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Missing or invalid parameters
 *       500:
 *         description: Server error or Overpass API error
 */
router.post('/', getOSMData);

export default router;
