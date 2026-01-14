import neo4jConnection from '../lib/neo4j';
import knowledgeBaseService from './knowledge-base.service.v2';

class InitializationService {
  /**
   * Initialize the application - connect to Neo4j and ensure data is loaded
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Starting application initialization...');

      // Connect to Neo4j
      await neo4jConnection.connect();

      // Initialize schema (create constraints and indexes)
      await neo4jConnection.initializeSchema();

      // Initialize knowledge base from JSON files (auto-ingests if empty)
      await knowledgeBaseService.initialize();

      console.log('🎉 Application initialization completed!');
    } catch (error) {
      console.error('❌ Application initialization failed:', error);
      console.error(
        '⚠️  The application will continue running, but knowledge base features may not work properly.'
      );
      console.error('💡 Please check your Neo4j connection settings and JSON files.');
      // Don't throw - allow app to start even if Neo4j fails
    }
  }

  /**
   * Shutdown cleanup
   */
  async shutdown(): Promise<void> {
    try {
      console.log('🛑 Shutting down application...');
      await neo4jConnection.close();
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }
}

export default new InitializationService();
