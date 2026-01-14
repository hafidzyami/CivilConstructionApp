import neo4jConnection from '../lib/neo4j';
import { jsonIngestionService } from './json-ingestion.service';
import neo4j from 'neo4j-driver';

export interface ArticleSearchResult {
  articleId: string;
  text: string;
  title?: string;
  regulation: string;
  level: string;
  nodeType: 'Article' | 'SubArticle';
  subLevel?: number;
  score: number;
}

export interface ArticleDetails extends ArticleSearchResult {
  mentions: string[];
  relatedTo: string[];
  containedIn: string[];
  contains: string[];
}

class KnowledgeBaseServiceV2 {
  /**
   * Initialize knowledge base from JSON files
   */
  async initialize(): Promise<void> {
    const hasData = await jsonIngestionService.hasExistingData();

    if (hasData) {
      console.log('✅ Knowledge base already exists');
      return;
    }

    console.log('📚 Knowledge base is empty, initializing from JSON files...');
    await jsonIngestionService.ingestAll();
  }

  /**
   * Reingest knowledge base (clear and reload)
   */
  async reingest(): Promise<{ success: boolean; summary: any }> {
    try {
      await jsonIngestionService.clearAll();
      await jsonIngestionService.ingestAll();

      const stats = await this.getStats();

      return {
        success: true,
        summary: stats
      };
    } catch (error) {
      console.error('Error during reingest:', error);
      throw error;
    }
  }

  /**
   * Extract article number from query (e.g., "article 52" -> "52", "article 52-3" -> "52-3")
   */
  private extractArticleNumber(query: string): string | null {
    // Match patterns like: "article 52", "Article 52-3", "52", "52-3"
    const patterns = [
      /\barticle\s+(\d+(?:-\d+)*)\b/i,
      /\bart\.?\s+(\d+(?:-\d+)*)\b/i,
      /^(\d+(?:-\d+)*)$/,
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Search articles by article number directly
   */
  async searchByArticleNumber(articleNumber: string, limit: number = 10): Promise<ArticleSearchResult[]> {
    const session = neo4jConnection.getSession();

    try {
      const articleId = `article_${articleNumber}`;

      // Direct lookup by article ID, articleNumber property, or name field
      const result = await session.run(
        `
        // Strategy 1: Direct match by node.id (e.g., "article_52")
        MATCH (node) WHERE node.id = $articleId
          AND (node:Article OR node:SubArticle OR node:RegionalArticle OR node:RegionalSubArticle)
        MATCH (r:Regulation)-[:CONTAINS*1..]->(node)
        RETURN
          node.id as articleId,
          node.name as name,
          node.text as text,
          node.title as title,
          node.level as subLevel,
          r.name as regulation,
          r.level as level,
          labels(node)[0] as nodeType,
          1.0 as score

        UNION ALL

        // Strategy 2: Match by articleNumber property (e.g., articleNumber = "52")
        MATCH (node) WHERE node.articleNumber = $articleNumber
          AND (node:Article OR node:SubArticle OR node:RegionalArticle OR node:RegionalSubArticle)
        MATCH (r:Regulation)-[:CONTAINS*1..]->(node)
        RETURN
          node.id as articleId,
          node.name as name,
          node.text as text,
          node.title as title,
          node.level as subLevel,
          r.name as regulation,
          r.level as level,
          labels(node)[0] as nodeType,
          0.95 as score

        UNION ALL

        // Strategy 3: Search by article number in name field (e.g., "Article 52")
        MATCH (node) WHERE node.name CONTAINS $articleDisplay
          AND (node:Article OR node:SubArticle OR node:RegionalArticle OR node:RegionalSubArticle)
        MATCH (r:Regulation)-[:CONTAINS*1..]->(node)
        RETURN
          node.id as articleId,
          node.name as name,
          node.text as text,
          node.title as title,
          node.level as subLevel,
          r.name as regulation,
          r.level as level,
          labels(node)[0] as nodeType,
          0.9 as score

        ORDER BY score DESC
        LIMIT $limit
        `,
        {
          articleId,
          articleNumber,
          articleDisplay: articleNumber,
          limit: neo4j.int(limit)
        }
      );

      return result.records.map((record: any) => ({
        articleId: record.get('articleId'),
        text: record.get('text'),
        title: record.get('title'),
        regulation: record.get('regulation'),
        level: record.get('level'),
        nodeType: record.get('nodeType') as 'Article' | 'SubArticle',
        subLevel: record.get('subLevel')?.toNumber(),
        score: record.get('score')
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Search articles by query text
   */
  async searchArticles(query: string, limit: number = 10): Promise<ArticleSearchResult[]> {
    const session = neo4jConnection.getSession();

    try {
      // First, try to extract article number from query
      const articleNumber = this.extractArticleNumber(query);

      if (articleNumber) {
        console.log(`🔍 Detected article number: ${articleNumber}`);
        const directResults = await this.searchByArticleNumber(articleNumber, limit);

        if (directResults.length > 0) {
          console.log(`✅ Found ${directResults.length} results by article number`);
          return directResults;
        }

        console.log(`⚠️  No direct match for article ${articleNumber}, falling back to fulltext search`);
      }

      // Fallback: Fulltext search in all article node types
      const result = await session.run(
        `
        CALL db.index.fulltext.queryNodes('articleSearch', $query) YIELD node, score
        MATCH (r:Regulation)-[:CONTAINS*1..]->(node)
        WHERE node:Article OR node:SubArticle OR node:RegionalArticle OR node:RegionalSubArticle
        RETURN
          node.id as articleId,
          node.name as name,
          node.text as text,
          node.title as title,
          node.level as subLevel,
          r.name as regulation,
          r.level as level,
          labels(node)[0] as nodeType,
          score
        ORDER BY score DESC
        LIMIT $limit
        `,
        { query, limit: neo4j.int(limit) }
      );

      return result.records.map((record: any) => ({
        articleId: record.get('articleId'),
        text: record.get('text'),
        title: record.get('title'),
        regulation: record.get('regulation'),
        level: record.get('level'),
        nodeType: record.get('nodeType') as 'Article' | 'SubArticle',
        subLevel: record.get('subLevel')?.toNumber(),
        score: record.get('score')
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get article details with relationships
   */
  async getArticleDetails(articleId: string): Promise<ArticleDetails | null> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(
        `
        MATCH (node) WHERE node.id = $articleId
          AND (node:Article OR node:SubArticle OR node:RegionalArticle OR node:RegionalSubArticle)
        MATCH (r:Regulation)-[:CONTAINS*1..]->(node)

        OPTIONAL MATCH (node)-[:MENTIONS]->(mentioned)
        WHERE mentioned:Article OR mentioned:SubArticle OR mentioned:RegionalArticle OR mentioned:RegionalSubArticle

        OPTIONAL MATCH (node)-[:RELATED_TO]->(related)
        WHERE related:Article OR related:SubArticle OR related:RegionalArticle OR related:RegionalSubArticle

        OPTIONAL MATCH (container)-[:CONTAINS]->(node)
        WHERE container:Article OR container:SubArticle OR container:RegionalArticle OR container:RegionalSubArticle OR container:Regulation

        OPTIONAL MATCH (node)-[:CONTAINS]->(child)
        WHERE child:Article OR child:SubArticle OR child:RegionalArticle OR child:RegionalSubArticle

        RETURN
          node.id as articleId,
          node.name as name,
          node.text as text,
          node.title as title,
          node.level as subLevel,
          r.name as regulation,
          r.level as level,
          labels(node)[0] as nodeType,
          collect(DISTINCT mentioned.id) as mentions,
          collect(DISTINCT related.id) as relatedTo,
          collect(DISTINCT container.id) as containedIn,
          collect(DISTINCT child.id) as contains
        `,
        { articleId }
      );

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      return {
        articleId: record.get('articleId'),
        text: record.get('text'),
        title: record.get('title'),
        regulation: record.get('regulation'),
        level: record.get('level'),
        nodeType: record.get('nodeType') as 'Article' | 'SubArticle',
        subLevel: record.get('subLevel')?.toNumber(),
        score: 0,
        mentions: record.get('mentions').filter((id: string | null) => id !== null),
        relatedTo: record.get('relatedTo').filter((id: string | null) => id !== null),
        containedIn: record.get('containedIn').filter((id: string | null) => id !== null),
        contains: record.get('contains').filter((id: string | null) => id !== null)
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Get knowledge base statistics
   */
  async getStats(): Promise<{
    regulations: number;
    articles: number;
    subArticles: number;
    regionalArticles: number;
    regionalSubArticles: number;
    mentions: number;
    relatedTo: number;
  }> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(`
        MATCH (r:Regulation)
        OPTIONAL MATCH (r)-[:CONTAINS]->(a:Article)
        OPTIONAL MATCH (r)-[:CONTAINS*2..]->(s:SubArticle)
        OPTIONAL MATCH (r)-[:CONTAINS]->(ra:RegionalArticle)
        OPTIONAL MATCH (r)-[:CONTAINS*2..]->(rs:RegionalSubArticle)
        OPTIONAL MATCH (node1)-[m:MENTIONS]->(node2)
        WHERE (node1:Article OR node1:SubArticle OR node1:RegionalArticle OR node1:RegionalSubArticle)
          AND (node2:Article OR node2:SubArticle OR node2:RegionalArticle OR node2:RegionalSubArticle)
        OPTIONAL MATCH (regional)-[rel:RELATED_TO]->(national)
        WHERE (regional:RegionalArticle OR regional:RegionalSubArticle)
          AND (national:Article OR national:SubArticle)
        RETURN
          count(DISTINCT r) as regulationCount,
          count(DISTINCT a) as articleCount,
          count(DISTINCT s) as subArticleCount,
          count(DISTINCT ra) as regionalArticleCount,
          count(DISTINCT rs) as regionalSubArticleCount,
          count(DISTINCT m) as mentionsCount,
          count(DISTINCT rel) as relatedToCount
      `);

      const record = result.records[0];
      return {
        regulations: record.get('regulationCount').toNumber(),
        articles: record.get('articleCount').toNumber(),
        subArticles: record.get('subArticleCount').toNumber(),
        regionalArticles: record.get('regionalArticleCount').toNumber(),
        regionalSubArticles: record.get('regionalSubArticleCount').toNumber(),
        mentions: record.get('mentionsCount').toNumber(),
        relatedTo: record.get('relatedToCount').toNumber()
      };
    } finally {
      await session.close();
    }
  }
}

export default new KnowledgeBaseServiceV2();
