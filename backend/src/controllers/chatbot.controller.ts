import { Request, Response } from 'express';
import chatbotService from '../services/chatbot.service';
import knowledgeBaseService from '../services/knowledge-base.service.v2';
import neo4jConnection from '../lib/neo4j';
import { z } from 'zod';

// Validation schemas
const chatQuerySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  sessionId: z.string().optional(),
  searchMode: z.enum(['llm-generated', 'similarity', 'auto']).optional(),
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
      res.status(400).json({
        error: 'Invalid request',
        details: validation.error.errors,
      });
      return;
    }

    const { query, sessionId = 'default', searchMode } = validation.data;

    const response = await chatbotService.processQuery(query, sessionId, searchMode);

    res.status(200).json({
      success: true,
      response,
    });
  } catch (error: any) {
    console.error('Error processing chat query:', error);
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

    const history = chatbotService.getHistory(sessionId);

    res.status(200).json({
      success: true,
      history,
    });
  } catch (error: any) {
    console.error('Error getting chat history:', error);
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

    chatbotService.clearHistory(sessionId);

    res.status(200).json({
      success: true,
      message: 'Chat history cleared',
    });
  } catch (error: any) {
    console.error('Error clearing chat history:', error);
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
    const stats = await knowledgeBaseService.getStats();

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error('Error getting regulations:', error);
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
      res.status(400).json({
        error: 'Invalid request',
        details: validation.error.errors,
      });
      return;
    }

    const { query } = validation.data;
    const limit = parseInt(req.query.limit as string) || 10;

    const results = await knowledgeBaseService.searchArticles(query, limit);

    res.status(200).json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error: any) {
    console.error('Error searching articles:', error);
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
      res.status(400).json({
        error: 'Article ID is required',
      });
      return;
    }

    const article = await knowledgeBaseService.getArticleDetails(articleId);

    if (!article) {
      res.status(404).json({
        error: 'Article not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      article,
    });
  } catch (error: any) {
    console.error('Error getting article details:', error);
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
    console.log('🔄 Starting knowledge base re-ingestion...');

    // Re-ingest using the v2 service (clears and reloads from JSON)
    const result = await knowledgeBaseService.reingest();

    if (!result.success) {
      throw new Error('Re-ingestion failed');
    }

    console.log('✅ Knowledge base re-ingestion completed successfully!');
    console.log(`   📊 Statistics:
       - Regulations: ${result.summary.regulations}
       - Articles: ${result.summary.articles}
       - SubArticles: ${result.summary.subArticles}
       - MENTIONS relationships: ${result.summary.mentions}
       - RELATED_TO relationships: ${result.summary.relatedTo}`);

    res.status(200).json({
      success: true,
      message: 'Knowledge base re-ingested successfully',
      summary: result.summary,
    });
  } catch (error: any) {
    console.error('❌ Error re-ingesting knowledge base:', error);
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

    res.status(200).json({
      success: true,
      stats: summary,
    });
  } catch (error: any) {
    console.error('Error getting knowledge base stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get knowledge base stats',
      message: error.message,
    });
  }
};
