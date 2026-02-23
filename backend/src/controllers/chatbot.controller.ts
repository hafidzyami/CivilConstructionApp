import { Request, Response } from 'express';
import chatbotService from '../services/chatbot.service';
import knowledgeBaseService from '../services/knowledge-base.service.v2';
import complianceService from '../services/compliance.service';
import neo4jConnection from '../lib/neo4j';
import prisma from '../lib/prisma';
import { z } from 'zod';
import logger from '../lib/logger';

const CONTEXT = 'Chatbot';

// Validation schemas
const chatQuerySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  sessionId: z.string().optional(),
  searchMode: z.enum(['llm-generated', 'similarity', 'auto']).optional(),
});

const resultChatQuerySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  sessionId: z.string().min(1, 'Session ID is required'),
  demoSessionId: z.number().int().positive('Demo session ID must be a positive integer'),
});

const articleIdSchema = z.object({
  articleId: z.string().min(1, 'Article ID is required'),
});

/**
 * POST /api/chatbot/query
 * Process a user query and return a response
 */
export const processChatQuery = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = chatQuerySchema.safeParse(req.body);

    if (!validation.success) {
      logger.warn(CONTEXT, 'processChatQuery: validation failed', { errors: validation.error.errors });
      res.status(400).json({
        error: 'Invalid request',
        details: validation.error.errors,
      });
      return;
    }

    const { query, sessionId = 'default', searchMode } = validation.data;
    logger.info(CONTEXT, 'processChatQuery: processing query', { sessionId, searchMode, queryLength: query.length });

    const response = await chatbotService.processQuery(query, sessionId, searchMode);

    logger.info(CONTEXT, 'processChatQuery: succeeded', { sessionId });
    res.status(200).json({
      success: true,
      response,
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'processChatQuery: failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to process query',
      message: error.message,
    });
  }
};

/**
 * GET /api/chatbot/history/:sessionId
 * Get conversation history for a session
 */
export const getChatHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId = 'default' } = req.params;
    logger.info(CONTEXT, 'getChatHistory: fetching history', { sessionId });

    const history = chatbotService.getHistory(sessionId);

    logger.info(CONTEXT, 'getChatHistory: succeeded', { sessionId, count: history.length });
    res.status(200).json({
      success: true,
      history,
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'getChatHistory: failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to get chat history',
      message: error.message,
    });
  }
};

/**
 * DELETE /api/chatbot/history/:sessionId
 * Clear conversation history for a session
 */
export const clearChatHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId = 'default' } = req.params;
    logger.info(CONTEXT, 'clearChatHistory: clearing history', { sessionId });

    chatbotService.clearHistory(sessionId);

    logger.info(CONTEXT, 'clearChatHistory: succeeded', { sessionId });
    res.status(200).json({
      success: true,
      message: 'Chat history cleared',
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'clearChatHistory: failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to clear chat history',
      message: error.message,
    });
  }
};

/**
 * GET /api/chatbot/regulations
 * Get all available regulations
 */
export const getRegulations = async (req: Request, res: Response): Promise<void> => {
  try {
    logger.info(CONTEXT, 'getRegulations: fetching stats');
    const stats = await knowledgeBaseService.getStats();

    logger.info(CONTEXT, 'getRegulations: succeeded');
    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'getRegulations: failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to get regulations',
      message: error.message,
    });
  }
};

/**
 * POST /api/chatbot/search
 * Search articles by text
 */
export const searchArticles = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = chatQuerySchema.safeParse(req.body);

    if (!validation.success) {
      logger.warn(CONTEXT, 'searchArticles: validation failed', { errors: validation.error.errors });
      res.status(400).json({
        error: 'Invalid request',
        details: validation.error.errors,
      });
      return;
    }

    const { query } = validation.data;
    const limit = parseInt(req.query.limit as string) || 10;
    logger.info(CONTEXT, 'searchArticles: searching', { query, limit });

    const results = await knowledgeBaseService.searchArticles(query, limit);

    logger.info(CONTEXT, 'searchArticles: succeeded', { count: results.length });
    res.status(200).json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'searchArticles: failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to search articles',
      message: error.message,
    });
  }
};

/**
 * GET /api/chatbot/article/:articleId
 * Get article details with relationships
 */
export const getArticleDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { articleId } = req.params;

    if (!articleId) {
      logger.warn(CONTEXT, 'getArticleDetails: missing articleId');
      res.status(400).json({
        error: 'Article ID is required',
      });
      return;
    }

    logger.info(CONTEXT, 'getArticleDetails: fetching article', { articleId });
    const article = await knowledgeBaseService.getArticleDetails(articleId);

    if (!article) {
      logger.warn(CONTEXT, 'getArticleDetails: article not found', { articleId });
      res.status(404).json({
        error: 'Article not found',
      });
      return;
    }

    logger.info(CONTEXT, 'getArticleDetails: succeeded', { articleId });
    res.status(200).json({
      success: true,
      article,
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'getArticleDetails: failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to get article details',
      message: error.message,
    });
  }
};

/**
 * POST /api/chatbot/admin/reingest
 * Clear and re-ingest all knowledge base data
 * ⚠️ WARNING: This will delete ALL existing data in Neo4j!
 */
export const reingestKnowledgeBase = async (req: Request, res: Response): Promise<void> => {
  try {
    logger.info(CONTEXT, 'reingestKnowledgeBase: starting re-ingestion...');

    // Re-ingest using the v2 service (clears and reloads from JSON)
    const result = await knowledgeBaseService.reingest();

    if (!result.success) {
      throw new Error('Re-ingestion failed');
    }

    logger.info(CONTEXT, 'reingestKnowledgeBase: succeeded', { summary: result.summary });
    res.status(200).json({
      success: true,
      message: 'Knowledge base re-ingested successfully',
      summary: result.summary,
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'reingestKnowledgeBase: failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to re-ingest knowledge base',
      message: error.message,
    });
  }
};

/**
 * GET /api/chatbot/admin/stats
 * Get knowledge base statistics
 */
export const getKnowledgeBaseStats = async (req: Request, res: Response): Promise<void> => {
  try {
    logger.info(CONTEXT, 'getKnowledgeBaseStats: fetching stats');
    const session = neo4jConnection.getSession();

    const stats = await session.run(`
      MATCH (r:Regulation)
      OPTIONAL MATCH (r)-[:CONTAINS]->(a:Article)
      OPTIONAL MATCH (r)-[:CONTAINS*2..]->(s:SubArticle)
      OPTIONAL MATCH (z:Zone)
      OPTIONAL MATCH (a)-[:APPLIES_TO]->(zone:Zone)
      OPTIONAL MATCH (s)-[:APPLIES_TO]->(subZone:Zone)
      OPTIONAL MATCH (regional)-[:OVERRIDES]->(national)
      WHERE (regional:Article OR regional:SubArticle)
        AND (national:Article OR national:SubArticle)
      RETURN
        count(DISTINCT r) as regulationCount,
        count(DISTINCT a) as articleCount,
        count(DISTINCT s) as subArticleCount,
        count(DISTINCT z) as zoneCount,
        count(DISTINCT zone) + count(DISTINCT subZone) as zonesWithArticles,
        count(DISTINCT regional) as overrideCount
    `);

    const record = stats.records[0];

    const summary = {
      regulations: record.get('regulationCount').toNumber(),
      articles: record.get('articleCount').toNumber(),
      subArticles: record.get('subArticleCount').toNumber(),
      zones: record.get('zoneCount').toNumber(),
      zonesWithArticles: record.get('zonesWithArticles').toNumber(),
      overrideRelationships: record.get('overrideCount').toNumber(),
    };

    await session.close();

    logger.info(CONTEXT, 'getKnowledgeBaseStats: succeeded', { summary });
    res.status(200).json({
      success: true,
      stats: summary,
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'getKnowledgeBaseStats: failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get knowledge base stats',
      message: error.message,
    });
  }
};

/**
 * POST /api/chatbot/result-query
 * Process a chatbot query with compliance result context
 * This endpoint allows users to ask follow-up questions about their compliance result
 */
export const processResultChatQuery = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = resultChatQuerySchema.safeParse(req.body);

    if (!validation.success) {
      logger.warn(CONTEXT, 'processResultChatQuery: validation failed', { errors: validation.error.errors });
      res.status(400).json({
        error: 'Invalid request',
        details: validation.error.errors,
      });
      return;
    }

    const { query, sessionId, demoSessionId } = validation.data;
    logger.info(CONTEXT, 'processResultChatQuery: processing', { sessionId, demoSessionId, queryLength: query.length });

    // Get compliance result for context
    const complianceResult = await complianceService.getComplianceResult(demoSessionId);

    if (!complianceResult) {
      logger.warn(CONTEXT, 'processResultChatQuery: compliance result not found', { demoSessionId });
      res.status(404).json({
        error: 'Compliance result not found',
        message: 'Please complete the compliance check first before asking questions about the result.',
      });
      return;
    }

    // Save user message to database
    await prisma.demoChatHistory.create({
      data: {
        sessionId: demoSessionId,
        chatSessionId: sessionId,
        role: 'user',
        content: query,
      },
    });

    // Build compliance context for the chatbot
    const complianceContext = buildComplianceContext(complianceResult);

    // Process query with compliance context
    const response = await chatbotService.processQueryWithContext(
      query,
      sessionId,
      complianceContext
    );

    // Save assistant response to database
    await prisma.demoChatHistory.create({
      data: {
        sessionId: demoSessionId,
        chatSessionId: sessionId,
        role: 'assistant',
        content: response.message,
        sources: response.sources || undefined,
      },
    });

    logger.info(CONTEXT, 'processResultChatQuery: succeeded', { sessionId, demoSessionId });
    res.status(200).json({
      success: true,
      response,
      complianceStatus: complianceResult.status,
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'processResultChatQuery: failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to process query',
      message: error.message,
    });
  }
};

/**
 * Build compliance context string for chatbot
 */
function buildComplianceContext(result: any): string {
  const checksContext = result.checks
    .map((check: any) => `- ${check.name}: ${check.status.toUpperCase()} - ${check.message}`)
    .join('\n');

  const regulationsContext = result.applicableRegulations
    .slice(0, 5)
    .map((reg: any) => `- ${reg.articleId}: ${reg.title || 'Untitled'} (${reg.regulation})`)
    .join('\n');

  const recommendationsContext = result.recommendations
    .map((rec: string, idx: number) => `${idx + 1}. ${rec}`)
    .join('\n');

  return `
COMPLIANCE CHECK RESULT:
Status: ${result.status.toUpperCase()}
Overall Score: ${result.overallScore}%

Summary: ${result.summary}

COMPLIANCE CHECKS:
${checksContext}

APPLICABLE REGULATIONS:
${regulationsContext}

RECOMMENDATIONS:
${recommendationsContext}
`;
}
