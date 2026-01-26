import { Request, Response } from 'express';
import chatbotService from '../services/chatbot.service';
import knowledgeBaseService from '../services/knowledge-base.service.v2';
import complianceService from '../services/compliance.service';
import neo4jConnection from '../lib/neo4j';
import { z } from 'zod';

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

/**
 * POST /api/chatbot/result-query
 * Process a chatbot query with compliance result context
 * This endpoint allows users to ask follow-up questions about their compliance result
 */
export const processResultChatQuery = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = resultChatQuerySchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: validation.error.errors,
      });
      return;
    }

    const { query, sessionId, demoSessionId } = validation.data;

    // Get compliance result for context
    const complianceResult = await complianceService.getComplianceResult(demoSessionId);

    if (!complianceResult) {
      res.status(404).json({
        error: 'Compliance result not found',
        message: 'Please complete the compliance check first before asking questions about the result.',
      });
      return;
    }

    // Build compliance context for the chatbot
    const complianceContext = buildComplianceContext(complianceResult);

    // Process query with compliance context
    const response = await chatbotService.processQueryWithContext(
      query,
      sessionId,
      complianceContext
    );

    res.status(200).json({
      success: true,
      response,
      complianceStatus: complianceResult.status,
    });
  } catch (error: any) {
    console.error('Error processing result chat query:', error);
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
