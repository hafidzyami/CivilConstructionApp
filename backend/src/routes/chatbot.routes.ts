import { Router } from 'express';
import * as chatbotController from '../controllers/chatbot.controller';

const router = Router();

/**
 * @swagger
 * /api/chatbot/query:
 *   post:
 *     summary: Process a chatbot query
 *     tags: [Chatbot]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: User's question or query
 *               sessionId:
 *                 type: string
 *                 description: Session ID for conversation tracking
 *     responses:
 *       200:
 *         description: Query processed successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post('/query', chatbotController.processChatQuery);

/**
 * @swagger
 * /api/chatbot/history/{sessionId}:
 *   get:
 *     summary: Get conversation history
 *     tags: [Chatbot]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         schema:
 *           type: string
 *         required: true
 *         description: Session ID
 *     responses:
 *       200:
 *         description: History retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/history/:sessionId', chatbotController.getChatHistory);

/**
 * @swagger
 * /api/chatbot/history/{sessionId}:
 *   delete:
 *     summary: Clear conversation history
 *     tags: [Chatbot]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         schema:
 *           type: string
 *         required: true
 *         description: Session ID
 *     responses:
 *       200:
 *         description: History cleared successfully
 *       500:
 *         description: Server error
 */
router.delete('/history/:sessionId', chatbotController.clearChatHistory);

/**
 * @swagger
 * /api/chatbot/regulations:
 *   get:
 *     summary: Get all available regulations
 *     tags: [Chatbot]
 *     responses:
 *       200:
 *         description: Regulations retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/regulations', chatbotController.getRegulations);

/**
 * @swagger
 * /api/chatbot/search:
 *   post:
 *     summary: Search articles by text
 *     tags: [Chatbot]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: Search query
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: Search completed successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post('/search', chatbotController.searchArticles);

/**
 * @swagger
 * /api/chatbot/article/{articleId}:
 *   get:
 *     summary: Get article details with relationships
 *     tags: [Chatbot]
 *     parameters:
 *       - in: path
 *         name: articleId
 *         schema:
 *           type: string
 *         required: true
 *         description: Article ID
 *     responses:
 *       200:
 *         description: Article retrieved successfully
 *       404:
 *         description: Article not found
 *       500:
 *         description: Server error
 */
router.get('/article/:articleId', chatbotController.getArticleDetails);

/**
 * @swagger
 * /api/chatbot/admin/reingest:
 *   post:
 *     summary: Clear and re-ingest all knowledge base data
 *     description: ⚠️ WARNING - This will delete ALL existing data in Neo4j and re-ingest from source documents
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Knowledge base re-ingested successfully
 *       500:
 *         description: Server error
 */
router.post('/admin/reingest', chatbotController.reingestKnowledgeBase);

/**
 * @swagger
 * /api/chatbot/admin/stats:
 *   get:
 *     summary: Get knowledge base statistics
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/admin/stats', chatbotController.getKnowledgeBaseStats);

export default router;
