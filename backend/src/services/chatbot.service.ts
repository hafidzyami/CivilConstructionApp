import { GoogleGenerativeAI } from '@google/generative-ai';
import knowledgeBaseService from './knowledge-base.service.v2';
import neo4j from 'neo4j-driver';
import neo4jConnection from '../lib/neo4j';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatResponse {
  message: string;
  sources?: Array<{
    regulation: string;
    articleId: string;
    text: string;
    relevance?: string;
  }>;
  suggestedQuestions?: string[];
  searchMethod?: 'llm-generated' | 'similarity' | 'fixed-query' | 'fulltext';
}

export type SearchMode = 'llm-generated' | 'similarity' | 'auto';

class ChatbotService {
  private conversationHistory: Map<string, ChatMessage[]> = new Map();
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;
  private searchMode: Map<string, SearchMode> = new Map(); // Track search mode per session

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        generationConfig: {
          temperature: 0.3, // Lower temperature for more consistent, professional responses
          topP: 0.9,
          topK: 30,
        },
      });
      console.log('✅ Gemini LLM initialized for chatbot');
    } else {
      console.warn('⚠️  GEMINI_API_KEY not found. Chatbot will use basic responses.');
    }
  }

  /**
   * Set search mode for a session
   */
  setSearchMode(sessionId: string, mode: SearchMode): void {
    this.searchMode.set(sessionId, mode);
    console.log(`🔧 Search mode for session ${sessionId} set to: ${mode}`);
  }

  /**
   * Get search mode for a session (defaults to 'auto')
   */
  getSearchMode(sessionId: string): SearchMode {
    return this.searchMode.get(sessionId) || 'auto';
  }

  /**
   * Process ANY user query naturally using LLM + RAG
   */
  async processQuery(
    query: string,
    sessionId: string = 'default',
    searchMode?: SearchMode
  ): Promise<ChatResponse> {
    try {
      // Update search mode if provided
      if (searchMode) {
        this.setSearchMode(sessionId, searchMode);
      }

      // Store user message
      this.addMessage(sessionId, 'user', query);

      // ALWAYS use LLM for natural conversation
      const response = await this.generateNaturalResponse(query, sessionId);

      // Store assistant message
      this.addMessage(sessionId, 'assistant', response.message);

      return response;
    } catch (error) {
      console.error('Error processing query:', error);
      return {
        message:
          'I apologize, but I encountered an error. Could you please rephrase your question?',
        suggestedQuestions: this.getDefaultSuggestions(),
      };
    }
  }

  /**
   * Generate natural, conversational response using LLM + Knowledge Base
   */
  private async generateNaturalResponse(
    query: string,
    sessionId: string
  ): Promise<ChatResponse> {
    // If no Gemini, use basic fallback
    if (!this.model) {
      return this.generateBasicResponse(query);
    }

    try {
      // Get conversation history
      const history = this.getHistory(sessionId).slice(-6); // Last 3 exchanges

      // Build conversation context
      const conversationContext = history
        .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');

      // First, use LLM to understand the query and extract search terms
      const intentPrompt = `You are a helpful assistant for building regulations.

${conversationContext ? `Previous conversation:\n${conversationContext}\n\n` : ''}

Current user message: "${query}"

Task: Determine if this is:
1. A greeting/pleasantry (hi, hello, thanks, etc.)
2. A question about what you can do / your capabilities
3. A request to list/show available regulations
4. A question about building regulations that needs knowledge base search

For regulation queries, extract the best search terms:
- If asking about a specific article (e.g., "article 52", "what is article 52", "tell me about article 52-3"), extract ONLY the article number (e.g., "article 52", "article 52-3")
- If asking about a topic (e.g., "building coverage", "parking requirements"), extract the main keywords
- Preserve article numbers exactly as mentioned

Respond in this JSON format:
{
  "type": "greeting" | "capabilities" | "list_regulations" | "regulation_query",
  "searchTerms": "search terms for knowledge base (article number OR topic keywords)",
  "conversational": true/false
}

Examples:
- "tell me about article 52" → {"type": "regulation_query", "searchTerms": "article 52", "conversational": true}
- "what is article 52-3?" → {"type": "regulation_query", "searchTerms": "article 52-3", "conversational": true}
- "what are parking requirements" → {"type": "regulation_query", "searchTerms": "parking requirements", "conversational": true}

Return ONLY valid JSON, no explanations.`;

      const intentResult = await this.model.generateContent(intentPrompt);
      let intentText = intentResult.response.text().trim();

      // Clean up JSON response
      if (intentText.startsWith('```json')) {
        intentText = intentText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (intentText.startsWith('```')) {
        intentText = intentText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const intent = JSON.parse(intentText);

      // Handle based on intent
      if (intent.type === 'greeting') {
        return await this.handleGreeting(query, conversationContext);
      }

      if (intent.type === 'capabilities') {
        return await this.handleCapabilities(query, conversationContext);
      }

      if (intent.type === 'list_regulations') {
        return await this.handleListRegulations(query, conversationContext);
      }

      // For regulation queries, retrieve from knowledge base
      const searchTerms = intent.searchTerms || query;
      const context = await this.retrieveContext(searchTerms, sessionId);

      // Generate conversational response with context
      return await this.generateResponseWithContext(query, context, conversationContext);
    } catch (error) {
      console.error('Error in natural response generation:', error);
      // Fallback to basic search
      const context = await this.retrieveContext(query, sessionId);
      return await this.generateResponseWithContext(query, context, '');
    }
  }

  /**
   * Handle greeting naturally
   */
  private async handleGreeting(query: string, conversationContext: string): Promise<ChatResponse> {
    const prompt = `You are a Building Regulations Assistant.

${conversationContext ? `Previous conversation:\n${conversationContext}\n\n` : ''}

User just said: "${query}"

Respond professionally and concisely. Briefly mention you can help with building regulations and construction standards (national and Chuncheon regional). Ask what they would like to know.

AVOID filler phrases like "Great to hear from you!", "Feel free to ask!", or ending with "Does that make sense?"

Response (1-2 sentences):`;

    const result = await this.model!.generateContent(prompt);
    const message = result.response.text();

    return {
      message,
      suggestedQuestions: [
        'What regulations do you have access to?',
        'Can you explain building coverage ratio?',
        'Tell me about parking requirements',
      ],
    };
  }

  /**
   * Handle capabilities question naturally
   */
  private async handleCapabilities(
    query: string,
    conversationContext: string
  ): Promise<ChatResponse> {
    const stats = await knowledgeBaseService.getStats();

    const prompt = `You are a Building Regulations Assistant.

${conversationContext ? `Previous conversation:\n${conversationContext}\n\n` : ''}

User asked: "${query}"

Available regulations in your knowledge base:
- National regulations: ${stats.articles} articles, ${stats.subArticles} sub-articles
- Regional regulations: ${stats.regionalArticles} articles, ${stats.regionalSubArticles} sub-articles
- Total: ${stats.regulations} regulations with ${stats.mentions} cross-references and ${stats.relatedTo} national-regional links

Explain what you can help with:
1. You have access to national and Chuncheon building regulations
2. You can answer questions about specific topics (BCR, FAR, height, parking, public space, etc.)
3. You can compare national vs regional regulations
4. All your answers come from the official regulations in your knowledge base

Keep it professional and informative, 2-4 sentences.

AVOID filler phrases like "Does that make sense?", "Feel free to ask!", or overly casual language.

Response:`;

    const result = await this.model!.generateContent(prompt);
    const message = result.response.text();

    return {
      message,
      suggestedQuestions: [
        'What is the building coverage ratio?',
        'Compare national and Chuncheon public space rules',
        'Tell me about height restrictions',
      ],
    };
  }

  /**
   * Handle list regulations request naturally
   */
  private async handleListRegulations(
    query: string,
    conversationContext: string
  ): Promise<ChatResponse> {
    const stats = await knowledgeBaseService.getStats();

    const prompt = `You are a Building Regulations Assistant.

${conversationContext ? `Previous conversation:\n${conversationContext}\n\n` : ''}

User asked: "${query}"

Available regulations in your knowledge base:
- National regulations: ${stats.articles} articles, ${stats.subArticles} sub-articles
- Regional regulations (Chuncheon): ${stats.regionalArticles} articles, ${stats.regionalSubArticles} sub-articles
- Total: ${stats.regulations} regulations with ${stats.mentions} cross-references and ${stats.relatedTo} national-regional links

Respond conversationally, explaining what regulations are available in a natural way. Mention both national and regional coverage. Keep it friendly and informative.

Response:`;

    const result = await this.model!.generateContent(prompt);
    const message = result.response.text();

    return {
      message,
      sources: [
        {
          regulation: 'National Building Regulations',
          articleId: 'overview',
          text: `${stats.articles} articles and ${stats.subArticles} sub-articles`,
          relevance: 'Available regulation',
        },
        {
          regulation: 'Chuncheon Regional Regulations',
          articleId: 'overview',
          text: `${stats.regionalArticles} articles and ${stats.regionalSubArticles} sub-articles`,
          relevance: 'Available regulation',
        },
      ],
      suggestedQuestions: [
        'Tell me about the Building Act Enforcement Decree',
        'What does Chuncheon ordinance cover?',
        'Explain building coverage ratio',
      ],
    };
  }

  /**
   * Generate Neo4j Cypher query using LLM based on user intent
   */
  private async generateCypherQuery(query: string): Promise<string | null> {
    if (!this.model) {
      return null;
    }

    const cypherPrompt = `You are a Neo4j Cypher query generator for a building regulations knowledge base.

SCHEMA:
Nodes:
- Regulation (properties: id, name, level, authority)
- Article (properties: id, name, text, title, articleNumber)
- SubArticle (properties: id, name, text, title, level, articleNumber)
- RegionalArticle (properties: id, name, text, title, articleNumber)
- RegionalSubArticle (properties: id, name, text, title, level, articleNumber)

Relationships:
- (Regulation)-[:CONTAINS]->(Article)
- (Regulation)-[:CONTAINS*]->(SubArticle)
- (Article|SubArticle)-[:CONTAINS]->(SubArticle)
- (Article|SubArticle)-[:MENTIONS]->(Article|SubArticle)
- (RegionalArticle|RegionalSubArticle)-[:RELATED_TO]->(Article|SubArticle)

Key Information:
- Article IDs follow pattern: "article_52", "article_52-3", etc.
- Article names follow pattern: "Article 52", "Article 52-3", etc.
- articleNumber property stores the number as string: "52", "52-3", etc.

USER QUERY: "${query}"

Task: Generate a Cypher query to find relevant articles based on the user's query.

If user asks about a specific article (e.g., "article 52", "tell me about article 52"):
- Search by id: "article_52"
- OR search by articleNumber: "52"
- OR search by name containing: "Article 52"
- Return the article with its regulation and related articles

If user asks about a topic (e.g., "parking", "building coverage"):
- Use fulltext search on text and title properties
- Return relevant articles sorted by relevance

IMPORTANT:
- Return ONLY the Cypher query, no explanations
- Use LIMIT 10 for safety
- Always return: node.id, node.name, node.text, node.title, node.articleNumber, regulation.name, regulation.level
- Sort by relevance (score or match quality)

Example for "article 52":
MATCH (node) WHERE node.id = 'article_52' OR node.articleNumber = '52'
  AND (node:Article OR node:SubArticle OR node:RegionalArticle OR node:RegionalSubArticle)
MATCH (r:Regulation)-[:CONTAINS*1..]->(node)
RETURN node.id as articleId, node.name as name, node.text as text, node.title as title, node.articleNumber as articleNumber, r.name as regulation, r.level as level, labels(node)[0] as nodeType, 1.0 as score
LIMIT 10

Generate the Cypher query:`;

    try {
      const result = await this.model.generateContent(cypherPrompt);
      let cypherQuery = result.response.text().trim();

      // Clean up response
      if (cypherQuery.startsWith('```cypher')) {
        cypherQuery = cypherQuery.replace(/^```cypher\s*/, '').replace(/\s*```$/, '');
      } else if (cypherQuery.startsWith('```')) {
        cypherQuery = cypherQuery.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      console.log('🔍 Generated Cypher query:', cypherQuery);
      return cypherQuery;
    } catch (error) {
      console.error('Error generating Cypher query:', error);
      return null;
    }
  }

  /**
   * Execute LLM-generated Cypher query
   */
  private async executeDynamicQuery(cypherQuery: string): Promise<any[]> {
    const session = neo4jConnection.getSession();

    try {
      const result = await session.run(cypherQuery);

      return result.records.map((record: any) => ({
        articleId: record.get('articleId'),
        name: record.get('name'),
        text: record.get('text'),
        title: record.get('title'),
        articleNumber: record.get('articleNumber'),
        regulation: record.get('regulation'),
        level: record.get('level'),
        nodeType: record.get('nodeType'),
        score: record.get('score') || 1.0,
      }));
    } catch (error) {
      console.error('Error executing dynamic query:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Generate text embedding using Gemini
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.genAI) {
      return null;
    }

    try {
      const embeddingModel = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
      const result = await embeddingModel.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }

  /**
   * Search using vector similarity (semantic search)
   */
  private async searchBySimilarity(query: string, limit: number = 10): Promise<any[]> {
    const session = neo4jConnection.getSession();

    try {
      // Generate embedding for the query
      const embedding = await this.generateEmbedding(query);

      if (!embedding) {
        console.log('⚠️  Could not generate embedding, falling back');
        return [];
      }

      console.log(`🔍 Using vector similarity search (embedding dimension: ${embedding.length})`);

      // Search using vector similarity
      const result = await session.run(
        `
        CALL db.index.vector.queryNodes('article_text_embedding', $limit, $embedding)
        YIELD node, score
        MATCH (r:Regulation)-[:CONTAINS*1..]->(node)
        WHERE node:Article OR node:SubArticle OR node:RegionalArticle OR node:RegionalSubArticle
        RETURN
          node.id as articleId,
          node.name as name,
          node.text as text,
          node.title as title,
          node.articleNumber as articleNumber,
          r.name as regulation,
          r.level as level,
          labels(node)[0] as nodeType,
          score
        ORDER BY score DESC
        `,
        { embedding, limit: neo4j.int(limit) }
      );

      return result.records.map((record: any) => ({
        articleId: record.get('articleId'),
        name: record.get('name'),
        text: record.get('text'),
        title: record.get('title'),
        articleNumber: record.get('articleNumber'),
        regulation: record.get('regulation'),
        level: record.get('level'),
        nodeType: record.get('nodeType'),
        score: record.get('score'),
      }));
    } catch (error) {
      console.error('Error in similarity search:', error);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Retrieve relevant context from Neo4j knowledge base with configurable search strategy
   */
  private async retrieveContext(
    query: string,
    sessionId: string = 'default'
  ): Promise<{
    articles: any[];
    hasResults: boolean;
    searchMethod: 'llm-generated' | 'similarity' | 'fixed-query' | 'fulltext';
  }> {
    const mode = this.getSearchMode(sessionId);
    console.log(`🔍 Search mode: ${mode}`);

    try {
      // Strategy 1: Similarity Search (if explicitly requested or auto mode)
      if (mode === 'similarity' || mode === 'auto') {
        const similarityResults = await this.searchBySimilarity(query, 10);

        if (similarityResults.length > 0) {
          console.log(`✅ Found ${similarityResults.length} results using similarity search`);
          return {
            articles: similarityResults,
            hasResults: true,
            searchMethod: 'similarity',
          };
        }

        if (mode === 'similarity') {
          // If explicitly set to similarity but no results, still try fallback
          console.log('⚠️  Similarity search found no results, trying fallback');
        }
      }

      // Strategy 2: LLM-Generated Cypher Query (if explicitly requested or auto mode)
      if (mode === 'llm-generated' || mode === 'auto') {
        const cypherQuery = await this.generateCypherQuery(query);

        if (cypherQuery) {
          try {
            const articles = await this.executeDynamicQuery(cypherQuery);

            if (articles.length > 0) {
              console.log(`✅ Found ${articles.length} results using LLM-generated query`);
              return {
                articles,
                hasResults: true,
                searchMethod: 'llm-generated',
              };
            }
          } catch (error) {
            console.error('LLM-generated query failed:', error);
          }
        }
      }

      // Strategy 3: Fallback to fixed parameterized query
      console.log('⚠️  Using fallback fixed query');
      const articles = await knowledgeBaseService.searchArticles(query, 10);

      return {
        articles,
        hasResults: articles.length > 0,
        searchMethod: articles.length > 0 ? 'fixed-query' : 'fulltext',
      };
    } catch (error) {
      console.error('Error retrieving context:', error);
      return { articles: [], hasResults: false, searchMethod: 'fulltext' };
    }
  }

  /**
   * Generate conversational response with knowledge base context
   */
  private async generateResponseWithContext(
    query: string,
    context: { articles: any[]; hasResults: boolean; searchMethod?: string },
    conversationContext: string
  ): Promise<ChatResponse> {
    // If no relevant articles found
    if (!context.hasResults) {
      if (!this.model) {
        return {
          message: `I couldn't find information about "${query}" in my knowledge base. Could you try asking about specific topics like building coverage ratio, height limits, parking, or public space requirements?`,
          suggestedQuestions: this.getDefaultSuggestions(),
        };
      }

      // Get stats for context
      const stats = await knowledgeBaseService.getStats();

      // Check if user was asking about a specific article number
      const articleNumberMatch = query.match(/\barticle\s+(\d+(?:-\d+)*)\b/i) || query.match(/^(\d+(?:-\d+)*)$/);
      const articleNumber = articleNumberMatch ? articleNumberMatch[1] : null;

      // Use LLM to respond naturally even when no context
      const prompt = `You are a Building Regulations Assistant.

${conversationContext ? `Previous conversation:\n${conversationContext}\n\n` : ''}

User asked: "${query}"

You searched your knowledge base but found no relevant regulations matching this query.

${articleNumber ? `IMPORTANT: The user asked about Article ${articleNumber} specifically. Explain that Article ${articleNumber} does not exist in your knowledge base. This could mean:
1. The article was deleted or repealed from the regulation
2. The article number was skipped in the regulation
3. The article exists in a different regulation not currently in your knowledge base

Mention that your national regulation has articles numbered from 1 to 121, but not all numbers are used (some were deleted, some were never created).` : ''}

Available regulations in your knowledge base:
- National regulations: ${stats.articles} articles (numbered 1-121 with gaps), ${stats.subArticles} sub-articles
- Regional regulations (Chuncheon): ${stats.regionalArticles} articles, ${stats.regionalSubArticles} sub-articles

Common topics you can help with:
- Building coverage ratio (BCR)
- Floor area ratio (FAR)
- Height restrictions
- Parking requirements
- Public space requirements
- Setback requirements

Respond professionally, ${articleNumber ? `explaining that Article ${articleNumber} doesn't exist in your knowledge base and why that might be` : 'explaining you don\'t have information about their specific query'}. Suggest related topics they could ask about.

AVOID filler phrases like "Does that make sense?", "Let me know if you have questions!", or overly casual greetings like "Hey there!"

Response:`;

      const result = await this.model.generateContent(prompt);
      return {
        message: result.response.text(),
        suggestedQuestions: this.getDefaultSuggestions(),
        searchMethod: context.searchMethod as 'llm-generated' | 'similarity' | 'fixed-query' | 'fulltext',
      };
    }

    // Build context from retrieved articles and sub-articles
    const contextText = context.articles
      .slice(0, 8) // Top 8 articles/sub-articles
      .map((article, idx) => {
        const nodeTypeLabel = article.nodeType === 'SubArticle' ? ` (Sub-Article, Level ${article.subLevel})` : '';
        return `[Source ${idx + 1}]
Regulation: ${article.regulation} (${article.level})
Authority: ${article.authority}
Article: ${article.articleId}${nodeTypeLabel}
${article.topic ? `Topic: ${article.topic}` : ''}
${article.value !== null ? `Value: ${article.operator || ''} ${article.value}${article.unit || ''}` : ''}
Content: ${article.text.slice(0, 800)}
---`;
      })
      .join('\n\n');

    // Get stats for additional context
    const stats = await knowledgeBaseService.getStats();

    // Create conversational RAG prompt
    const prompt = `You are a professional Building Regulations Assistant. Your goal is to provide accurate, clear, and informative answers about building codes and regulations.

${conversationContext ? `CONVERSATION HISTORY:\n${conversationContext}\n\n` : ''}

USER QUESTION:
"${query}"

KNOWLEDGE BASE CONTEXT:
${contextText}

AVAILABLE REGULATIONS:
- National regulations: ${stats.articles} articles, ${stats.subArticles} sub-articles
- Regional regulations (Chuncheon): ${stats.regionalArticles} articles, ${stats.regionalSubArticles} sub-articles

INSTRUCTIONS:
1. Answer the user's question in a clear, professional, and informative tone
2. Use ONLY the information from the context above - don't make up anything
3. Cite your sources naturally (e.g., "According to the Building Act...", "Article 56 states...")
4. If comparing national vs regional, explain the differences clearly
5. If regional overrides national, mention that
6. Keep it clear and easy to understand - avoid overly legal language unless necessary
7. If the context doesn't fully answer the question, acknowledge what you can answer and what you can't
8. Use bullet points or numbered lists when explaining multiple requirements

STRICTLY AVOID (NEVER USE THESE):
- Filler phrases: "Does that make sense?", "Let me know if you have questions!", "Feel free to ask!", "Hope that helps!", "Hope that clears things up!"
- Casual greetings: "Hey there!", "Hi there!", "Great question!", "Good question!"
- Rhetorical questions at the end of responses
- Phrases like "So, you're asking about...", "right?", "you know?"
- Redundant confirmations or unnecessary pleasantries

Start your response directly with the information. Be concise and professional.

YOUR RESPONSE:`;

    const result = await this.model!.generateContent(prompt);
    const responseText = result.response.text();

    // Generate suggested follow-up questions
    const followUpPrompt = `Based on this conversation about building regulations:

User asked: "${query}"
Your answer: "${responseText.slice(0, 400)}..."

Generate 3 natural follow-up questions the user might want to ask next. Make them conversational and relevant. Return only the questions, one per line.`;

    let suggestedQuestions: string[];
    try {
      const followUpResult = await this.model!.generateContent(followUpPrompt);
      suggestedQuestions = followUpResult.response
        .text()
        .split('\n')
        .filter((q: string) => q.trim().length > 0)
        .map((q: string) => q.replace(/^[\d\-\.\)\*]\s*/, '').trim())
        .slice(0, 3);
    } catch {
      suggestedQuestions = this.getDefaultSuggestions();
    }

    return {
      message: responseText,
      sources: context.articles.slice(0, 5).map((article) => ({
        regulation: article.regulation,
        articleId: article.articleId,
        text: article.text.slice(0, 500),
        relevance: 'Retrieved from knowledge base',
      })),
      suggestedQuestions:
        suggestedQuestions.length > 0 ? suggestedQuestions : this.getDefaultSuggestions(),
      searchMethod: context.searchMethod as 'llm-generated' | 'similarity' | 'fixed-query' | 'fulltext',
    };
  }

  /**
   * Basic response when Gemini not available
   */
  private async generateBasicResponse(query: string): Promise<ChatResponse> {
    const lowerQuery = query.toLowerCase();

    // Basic greetings
    if (/^(hi|hello|hey|thanks|thank you)/.test(lowerQuery)) {
      return {
        message:
          'Hello! I can help you with building regulations from national and Chuncheon sources. What would you like to know?',
        suggestedQuestions: this.getDefaultSuggestions(),
      };
    }

    // Try to search knowledge base
    const context = await this.retrieveContext(query);

    if (!context.hasResults) {
      return {
        message:
          'I couldn\'t find relevant information about that. Try asking about: building coverage ratio, height limits, parking requirements, or public space regulations.',
        suggestedQuestions: this.getDefaultSuggestions(),
      };
    }

    // Simple response with results
    const { articles } = context;
    let message = `Here's what I found:\n\n`;

    articles.slice(0, 3).forEach((article, idx) => {
      message += `**${idx + 1}. ${article.regulation}** (${article.level})\n`;
      if (article.topic) message += `Topic: ${article.topic}\n`;
      if (article.value !== null) {
        message += `Value: ${article.operator || ''} ${article.value}${article.unit || ''}\n`;
      }
      message += `${article.text.slice(0, 200)}...\n\n`;
    });

    return {
      message,
      sources: articles.slice(0, 5).map((a) => ({
        regulation: a.regulation,
        articleId: a.articleId,
        text: a.text,
        relevance: 'Search result',
      })),
      suggestedQuestions: this.getDefaultSuggestions(),
    };
  }

  /**
   * Get default suggested questions
   */
  private getDefaultSuggestions(): string[] {
    return [
      'What regulations are available?',
      'Explain building coverage ratio',
      'What are the height restrictions?',
      'Tell me about parking requirements',
    ];
  }

  /**
   * Add message to conversation history
   */
  private addMessage(sessionId: string, role: 'user' | 'assistant', content: string): void {
    if (!this.conversationHistory.has(sessionId)) {
      this.conversationHistory.set(sessionId, []);
    }

    this.conversationHistory.get(sessionId)!.push({
      role,
      content,
      timestamp: new Date(),
    });

    // Keep only last 20 messages
    const messages = this.conversationHistory.get(sessionId)!;
    if (messages.length > 20) {
      this.conversationHistory.set(sessionId, messages.slice(-20));
    }
  }

  /**
   * Get conversation history
   */
  getHistory(sessionId: string): ChatMessage[] {
    return this.conversationHistory.get(sessionId) || [];
  }

  /**
   * Clear conversation history
   */
  clearHistory(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
  }
}

export default new ChatbotService();
