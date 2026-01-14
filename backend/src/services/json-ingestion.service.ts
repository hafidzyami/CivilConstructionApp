import fs from 'fs';
import path from 'path';
import neo4jConnection from '../lib/neo4j';

interface JsonArticle {
  article_number: string;
  title: string;
  level: number;
  node: 'article' | 'sub article';
  mentions?: string;
  national_relation?: string;
  content: string;
}

interface JsonRegulation {
  document_info: {
    title: string;
    description?: string;
    effective_date?: string;
    ordinance_number?: string;
    related_national_law?: string;
  };
  articles: JsonArticle[];
}

export class JsonIngestionService {
  /**
   * Parse article number to determine hierarchy
   */
  private parseArticleNumber(articleNumber: string): {
    id: string;
    isBase: boolean;
    level: number;
    parentNumber: string | null;
  } {
    // Clean the article number (remove any non-numeric/dash characters)
    const cleaned = articleNumber.replace(/[^0-9-]/g, '');

    // Split by dash to determine hierarchy
    const parts = cleaned.split('-');
    const level = parts.length - 1;
    const isBase = level === 0;

    // Parent is everything except the last part
    let parentNumber = null;
    if (!isBase) {
      const parentParts = parts.slice(0, -1);
      parentNumber = parentParts.join('-');
    }

    return {
      id: `article_${cleaned}`,
      isBase,
      level,
      parentNumber
    };
  }

  /**
   * Parse mentions field to extract article references
   */
  private parseMentions(mentions: string | undefined): string[] {
    if (!mentions || mentions.trim() === '') {
      return [];
    }

    // Split by comma and clean
    return mentions
      .split(',')
      .map(m => m.trim())
      .filter(m => m !== '')
      .map(m => `article_${m.replace(/[^0-9-]/g, '')}`);
  }

  /**
   * Parse national_relation field to extract related national articles
   */
  private parseNationalRelation(nationalRelation: string | undefined): string[] {
    if (!nationalRelation || nationalRelation.trim() === '') {
      return [];
    }

    // Extract article numbers from text like "Building Act Article 11, Article 14"
    const regex = /Article\s+(\d+(?:-\d+)*)/gi;
    const matches = [...nationalRelation.matchAll(regex)];

    return matches.map(match => `article_${match[1].replace(/[^0-9-]/g, '')}`);
  }

  /**
   * Ingest a single regulation from JSON file
   */
  async ingestRegulation(
    jsonPath: string,
    regulationLevel: 'National' | 'Regional',
    authority: string
  ): Promise<void> {
    const session = neo4jConnection.getSession();

    try {
      console.log(`📥 Ingesting ${regulationLevel} regulation from: ${path.basename(jsonPath)}`);

      // Read JSON file
      const fileContent = fs.readFileSync(jsonPath, 'utf-8');
      const data: JsonRegulation = JSON.parse(fileContent);

      // Create Regulation node
      const regulationId = `${regulationLevel.toLowerCase()}_regulation`;
      const regulationName = data.document_info.title;

      await session.run(
        `
        MERGE (r:Regulation {id: $id})
        SET r.name = $name,
            r.level = $level,
            r.authority = $authority,
            r.description = $description,
            r.effectiveDate = $effectiveDate
        RETURN r
        `,
        {
          id: regulationId,
          name: regulationName,
          level: regulationLevel,
          authority,
          description: data.document_info.description || null,
          effectiveDate: data.document_info.effective_date || null
        }
      );

      console.log(`✅ Created Regulation node: ${regulationName}`);

      // Process articles
      let articleCount = 0;
      let subArticleCount = 0;

      // Determine node labels based on regulation level
      const articleLabel = regulationLevel === 'National' ? 'Article' : 'RegionalArticle';
      const subArticleLabel = regulationLevel === 'National' ? 'SubArticle' : 'RegionalSubArticle';

      for (const article of data.articles) {
        const parsed = this.parseArticleNumber(article.article_number);

        // Display name for Neo4j (e.g., "Article 1", "Article 3-2")
        const displayName = `Article ${article.article_number}`;

        if (parsed.isBase) {
          // Create Article or RegionalArticle node
          await session.run(
            `
            MATCH (r:Regulation {id: $regulationId})
            CALL apoc.create.node([$label], {
              id: $id,
              name: $name,
              text: $text,
              title: $title,
              articleNumber: $articleNumber
            }) YIELD node
            MERGE (r)-[:CONTAINS]->(node)
            RETURN node
            `,
            {
              regulationId,
              label: articleLabel,
              id: parsed.id,
              name: displayName,
              text: article.content,
              title: article.title,
              articleNumber: article.article_number
            }
          );
          articleCount++;
        } else {
          // Create SubArticle or RegionalSubArticle node
          const parentId = `article_${parsed.parentNumber}`;

          await session.run(
            `
            CALL apoc.create.node([$label], {
              id: $id,
              name: $name,
              text: $text,
              title: $title,
              level: $level,
              articleNumber: $articleNumber
            }) YIELD node
            WITH node
            OPTIONAL MATCH (parent) WHERE parent.id = $parentId
              AND (parent:Article OR parent:SubArticle OR parent:RegionalArticle OR parent:RegionalSubArticle)
            FOREACH (p IN CASE WHEN parent IS NOT NULL THEN [parent] ELSE [] END |
              MERGE (p)-[:CONTAINS]->(node)
            )
            RETURN node
            `,
            {
              label: subArticleLabel,
              id: parsed.id,
              name: displayName,
              text: article.content,
              title: article.title,
              level: parsed.level,
              articleNumber: article.article_number,
              parentId
            }
          );
          subArticleCount++;
        }
      }

      console.log(`✅ Created ${articleCount} Articles and ${subArticleCount} SubArticles`);

      // Create MENTIONS relationships
      let mentionsCount = 0;
      for (const article of data.articles) {
        const parsed = this.parseArticleNumber(article.article_number);
        const mentions = this.parseMentions(article.mentions);

        if (mentions.length > 0) {
          for (const mentionedId of mentions) {
            await session.run(
              `
              MATCH (source) WHERE source.id = $sourceId
                AND (source:Article OR source:SubArticle OR source:RegionalArticle OR source:RegionalSubArticle)
              MATCH (target) WHERE target.id = $targetId
                AND (target:Article OR target:SubArticle OR target:RegionalArticle OR target:RegionalSubArticle)
              MERGE (source)-[:MENTIONS]->(target)
              `,
              {
                sourceId: parsed.id,
                targetId: mentionedId
              }
            );
            mentionsCount++;
          }
        }
      }

      console.log(`✅ Created ${mentionsCount} MENTIONS relationships`);

      // Create RELATED_TO relationships (for regional regulations)
      if (regulationLevel === 'Regional') {
        let relatedCount = 0;
        for (const article of data.articles) {
          const parsed = this.parseArticleNumber(article.article_number);
          const relatedArticles = this.parseNationalRelation(article.national_relation);

          if (relatedArticles.length > 0) {
            for (const nationalId of relatedArticles) {
              await session.run(
                `
                MATCH (regional) WHERE regional.id = $regionalId
                  AND (regional:RegionalArticle OR regional:RegionalSubArticle)
                MATCH (national) WHERE national.id = $nationalId
                  AND (national:Article OR national:SubArticle)
                MERGE (regional)-[:RELATED_TO]->(national)
                `,
                {
                  regionalId: parsed.id,
                  nationalId
                }
              );
              relatedCount++;
            }
          }
        }

        console.log(`✅ Created ${relatedCount} RELATED_TO relationships`);
      }

      console.log(`\n🎉 Successfully ingested ${regulationLevel} regulation!`);
    } catch (error) {
      console.error(`❌ Error ingesting regulation:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Ingest all regulations from JSON files
   */
  async ingestAll(): Promise<void> {
    const dataDir = path.join(__dirname, '../../data/regulations');

    // Check if JSON files exist
    const nationalJsonPath = path.join(dataDir, 'national-regulation.json');
    const regionalJsonPath = path.join(dataDir, 'regional-regulation.json');

    if (!fs.existsSync(nationalJsonPath)) {
      throw new Error(`National regulation JSON not found: ${nationalJsonPath}`);
    }

    console.log('🚀 Starting knowledge base ingestion from JSON files...\n');

    // Ingest National regulation
    await this.ingestRegulation(
      nationalJsonPath,
      'National',
      'Ministry of Land, Infrastructure and Transport'
    );

    // Ingest Regional regulation (if exists)
    if (fs.existsSync(regionalJsonPath)) {
      console.log(''); // Empty line for spacing
      await this.ingestRegulation(
        regionalJsonPath,
        'Regional',
        'Chuncheon City Government'
      );
    } else {
      console.log('⚠️  Regional regulation JSON not found, skipping...');
    }

    console.log('\n✨ All regulations ingested successfully!');
  }

  /**
   * Check if knowledge base already exists
   */
  async hasExistingData(): Promise<boolean> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(`
        MATCH (r:Regulation)
        RETURN count(r) as count
      `);

      const count = result.records[0]?.get('count').toNumber() || 0;
      return count > 0;
    } finally {
      await session.close();
    }
  }

  /**
   * Clear all knowledge base data
   */
  async clearAll(): Promise<void> {
    const session = neo4jConnection.getSession();

    try {
      console.log('🗑️  Clearing existing knowledge base...');

      await session.run(`
        MATCH (n)
        WHERE n:Regulation OR n:Article OR n:SubArticle OR n:RegionalArticle OR n:RegionalSubArticle
        DETACH DELETE n
      `);

      console.log('✅ Knowledge base cleared');
    } finally {
      await session.close();
    }
  }
}

export const jsonIngestionService = new JsonIngestionService();
