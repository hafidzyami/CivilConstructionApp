import neo4j, { Driver, Session } from 'neo4j-driver';
import dotenv from 'dotenv';

dotenv.config();

class Neo4jConnection {
  private driver: Driver | null = null;
  private static instance: Neo4jConnection;

  private constructor() {}

  public static getInstance(): Neo4jConnection {
    if (!Neo4jConnection.instance) {
      Neo4jConnection.instance = new Neo4jConnection();
    }
    return Neo4jConnection.instance;
  }

  public async connect(): Promise<Driver> {
    if (this.driver) {
      return this.driver;
    }

    const uri = process.env.NEO4J_URI || 'bolt://neo4j:7687';
    const username = process.env.NEO4J_USERNAME || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password';

    try {
      this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
        maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
      });

      await this.driver.verifyConnectivity();
      console.log('✅ Connected to Neo4j successfully');

      return this.driver;
    } catch (error) {
      console.error('❌ Failed to connect to Neo4j:', error);
      throw error;
    }
  }

  public getDriver(): Driver {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized. Call connect() first.');
    }
    return this.driver;
  }

  public getSession(): Session {
    return this.getDriver().session();
  }

  public async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      console.log('Neo4j connection closed');
      this.driver = null;
    }
  }

  public async initializeSchema(): Promise<void> {
    const session = this.getSession();
    try {
      // Create constraints for unique nodes
      await session.run(`
        CREATE CONSTRAINT regulation_name IF NOT EXISTS
        FOR (r:Regulation) REQUIRE r.name IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT article_id IF NOT EXISTS
        FOR (a:Article) REQUIRE a.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT zone_code IF NOT EXISTS
        FOR (z:Zone) REQUIRE z.code IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT subarticle_id IF NOT EXISTS
        FOR (s:SubArticle) REQUIRE s.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT regional_article_id IF NOT EXISTS
        FOR (ra:RegionalArticle) REQUIRE ra.id IS UNIQUE
      `);

      await session.run(`
        CREATE CONSTRAINT regional_subarticle_id IF NOT EXISTS
        FOR (rs:RegionalSubArticle) REQUIRE rs.id IS UNIQUE
      `);

      // Create indexes for better query performance
      await session.run(`
        CREATE INDEX regulation_level IF NOT EXISTS
        FOR (r:Regulation) ON (r.level)
      `);

      await session.run(`
        CREATE INDEX article_topic IF NOT EXISTS
        FOR (a:Article) ON (a.topic)
      `);

      await session.run(`
        CREATE INDEX subarticle_topic IF NOT EXISTS
        FOR (s:SubArticle) ON (s.topic)
      `);

      await session.run(`
        CREATE INDEX subarticle_level IF NOT EXISTS
        FOR (s:SubArticle) ON (s.level)
      `);

      // Create vector index for semantic search on Article text
      await session.run(`
        CREATE VECTOR INDEX article_text_embedding IF NOT EXISTS
        FOR (a:Article) ON (a.textEmbedding)
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: 1536,
          \`vector.similarity_function\`: 'cosine'
        }}
      `);

      // Create fulltext index for text search across all article types
      await session.run(`
        CREATE FULLTEXT INDEX articleSearch IF NOT EXISTS
        FOR (n:Article|SubArticle|RegionalArticle|RegionalSubArticle)
        ON EACH [n.name, n.text, n.title, n.articleNumber]
      `);

      console.log('✅ Neo4j schema initialized successfully');
    } catch (error: any) {
      // Ignore errors if constraints/indexes already exist
      if (!error.message.includes('already exists') && !error.message.includes('An equivalent')) {
        console.error('Error initializing schema:', error);
        throw error;
      }
    } finally {
      await session.close();
    }
  }

  public async checkDataExists(): Promise<boolean> {
    const session = this.getSession();
    try {
      const result = await session.run(`
        MATCH (r:Regulation)
        RETURN count(r) as count
      `);

      const count = result.records[0]?.get('count').toNumber() || 0;
      return count > 0;
    } catch (error) {
      console.error('Error checking data existence:', error);
      return false;
    } finally {
      await session.close();
    }
  }

  public async clearDatabase(): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(`MATCH (n) DETACH DELETE n`);
      console.log('✅ Database cleared successfully');
    } catch (error) {
      console.error('Error clearing database:', error);
      throw error;
    } finally {
      await session.close();
    }
  }
}

export default Neo4jConnection.getInstance();
