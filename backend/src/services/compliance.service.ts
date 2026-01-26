import neo4jConnection from '../lib/neo4j';
import prisma from '../lib/prisma';
import neo4j from 'neo4j-driver';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ComplianceCheckInput {
  sessionId: number;
  // CAD Data
  siteArea?: number;
  buildingArea?: number;
  floorArea?: number;
  bcr?: number;
  far?: number;
  // Infrastructure Data
  latitude?: number;
  longitude?: number;
  nearbyRoads?: any;
  nearbyBuildings?: any;
  // OCR Data
  extractedText?: string[];
  // Additional context
  buildingType?: string;
  zoneType?: string;
  numberOfFloors?: number;
}

export interface RegulationRule {
  articleId: string;
  articleNumber: string;
  title: string;
  regulation: string;
  level: string;
  text: string;
  topic?: string;
  value?: number;
  unit?: string;
  operator?: string;
}

export interface ComplianceResult {
  status: 'accepted' | 'rejected' | 'review_required';
  overallScore: number;
  checks: ComplianceCheck[];
  summary: string;
  applicableRegulations: RegulationRule[];
  recommendations: string[];
}

export interface ComplianceCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  actualValue?: number | string;
  requiredValue?: number | string;
  regulation?: string;
  articleId?: string;
  message: string;
}

class ComplianceService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        generationConfig: {
          temperature: 0.2,
          topP: 0.9,
          topK: 30,
        },
      });
      console.log('✅ Gemini LLM initialized for compliance service');
    }
  }

  /**
   * Fetch all relevant regulations for compliance checking
   */
  async fetchRelevantRegulations(input: ComplianceCheckInput): Promise<RegulationRule[]> {
    const session = neo4jConnection.getSession();

    try {
      // Fetch regulations related to common compliance checks
      const searchTerms = [
        'building coverage',
        'floor area ratio',
        'site area',
        'height',
        'setback',
        'parking',
        'open space',
        'fire',
        'structure',
        'permit',
        'building area',
      ];

      const result = await session.run(
        `
        UNWIND $searchTerms as term
        CALL db.index.fulltext.queryNodes('articleSearch', term) YIELD node, score
        WHERE score > 0.5
        MATCH (r:Regulation)-[:CONTAINS*1..]->(node)
        WHERE node:Article OR node:SubArticle OR node:RegionalArticle OR node:RegionalSubArticle
        RETURN DISTINCT
          node.id as articleId,
          node.articleNumber as articleNumber,
          node.name as name,
          node.text as text,
          node.title as title,
          node.level as subLevel,
          r.name as regulation,
          r.level as level,
          labels(node)[0] as nodeType,
          max(score) as score
        ORDER BY score DESC
        LIMIT 50
        `,
        { searchTerms }
      );

      return result.records.map((record: any) => ({
        articleId: record.get('articleId'),
        articleNumber: record.get('articleNumber') || '',
        title: record.get('title') || record.get('name') || '',
        regulation: record.get('regulation'),
        level: record.get('level'),
        text: record.get('text') || '',
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Fetch session data from database
   */
  async fetchSessionData(sessionId: number): Promise<ComplianceCheckInput> {
    const sessionData = await prisma.demoSession.findUnique({
      where: { id: sessionId },
      include: {
        cadData: true,
        infrastructureData: true,
        ocrData: true,
      },
    });

    if (!sessionData) {
      throw new Error('Session not found');
    }

    const input: ComplianceCheckInput = {
      sessionId,
    };

    // Extract CAD data
    if (sessionData.cadData) {
      input.siteArea = sessionData.cadData.siteArea || undefined;
      input.buildingArea = sessionData.cadData.buildingArea || undefined;
      input.floorArea = sessionData.cadData.floorArea || undefined;
      input.bcr = sessionData.cadData.bcr || undefined;
      input.far = sessionData.cadData.far || undefined;
    }

    // Extract infrastructure data
    if (sessionData.infrastructureData) {
      input.latitude = sessionData.infrastructureData.latitude || undefined;
      input.longitude = sessionData.infrastructureData.longitude || undefined;
      input.nearbyRoads = sessionData.infrastructureData.roads || undefined;
      input.nearbyBuildings = sessionData.infrastructureData.buildings || undefined;
    }

    // Extract OCR data
    if (sessionData.ocrData && sessionData.ocrData.length > 0) {
      input.extractedText = sessionData.ocrData
        .map((ocr) => ocr.extractedText)
        .filter((text): text is string => text !== null);
    }

    return input;
  }

  /**
   * Perform basic compliance checks without LLM
   */
  performBasicChecks(input: ComplianceCheckInput, regulations: RegulationRule[]): ComplianceCheck[] {
    const checks: ComplianceCheck[] = [];

    // Check Building Coverage Ratio (BCR)
    if (input.bcr !== undefined) {
      // Standard BCR limits vary by zone, using common limits
      const bcrLimit = 60; // 60% is common for residential
      checks.push({
        name: 'Building Coverage Ratio (BCR)',
        status: input.bcr <= bcrLimit ? 'pass' : 'fail',
        actualValue: `${input.bcr.toFixed(2)}%`,
        requiredValue: `≤ ${bcrLimit}%`,
        regulation: 'Building Act',
        message:
          input.bcr <= bcrLimit
            ? `BCR of ${input.bcr.toFixed(2)}% is within the allowed limit of ${bcrLimit}%`
            : `BCR of ${input.bcr.toFixed(2)}% exceeds the allowed limit of ${bcrLimit}%`,
      });
    } else if (input.siteArea && input.buildingArea) {
      const calculatedBcr = (input.buildingArea / input.siteArea) * 100;
      const bcrLimit = 60;
      checks.push({
        name: 'Building Coverage Ratio (BCR)',
        status: calculatedBcr <= bcrLimit ? 'pass' : 'fail',
        actualValue: `${calculatedBcr.toFixed(2)}%`,
        requiredValue: `≤ ${bcrLimit}%`,
        regulation: 'Building Act',
        message:
          calculatedBcr <= bcrLimit
            ? `BCR of ${calculatedBcr.toFixed(2)}% is within the allowed limit`
            : `BCR of ${calculatedBcr.toFixed(2)}% exceeds the allowed limit of ${bcrLimit}%`,
      });
    }

    // Check Floor Area Ratio (FAR)
    if (input.far !== undefined) {
      // Standard FAR limits vary by zone, using common limits
      const farLimit = 200; // 200% is common for general residential
      checks.push({
        name: 'Floor Area Ratio (FAR)',
        status: input.far <= farLimit ? 'pass' : 'fail',
        actualValue: `${input.far.toFixed(2)}%`,
        requiredValue: `≤ ${farLimit}%`,
        regulation: 'Building Act',
        message:
          input.far <= farLimit
            ? `FAR of ${input.far.toFixed(2)}% is within the allowed limit of ${farLimit}%`
            : `FAR of ${input.far.toFixed(2)}% exceeds the allowed limit of ${farLimit}%`,
      });
    } else if (input.siteArea && input.floorArea) {
      const calculatedFar = (input.floorArea / input.siteArea) * 100;
      const farLimit = 200;
      checks.push({
        name: 'Floor Area Ratio (FAR)',
        status: calculatedFar <= farLimit ? 'pass' : 'fail',
        actualValue: `${calculatedFar.toFixed(2)}%`,
        requiredValue: `≤ ${farLimit}%`,
        regulation: 'Building Act',
        message:
          calculatedFar <= farLimit
            ? `FAR of ${calculatedFar.toFixed(2)}% is within the allowed limit`
            : `FAR of ${calculatedFar.toFixed(2)}% exceeds the allowed limit of ${farLimit}%`,
      });
    }

    // Check minimum site area
    if (input.siteArea !== undefined) {
      const minSiteArea = 60; // 60 sqm minimum for residential
      checks.push({
        name: 'Minimum Site Area',
        status: input.siteArea >= minSiteArea ? 'pass' : 'fail',
        actualValue: `${input.siteArea.toFixed(2)} m²`,
        requiredValue: `≥ ${minSiteArea} m²`,
        regulation: 'Building Act',
        message:
          input.siteArea >= minSiteArea
            ? `Site area of ${input.siteArea.toFixed(2)} m² meets the minimum requirement`
            : `Site area of ${input.siteArea.toFixed(2)} m² is below the minimum of ${minSiteArea} m²`,
      });
    }

    // Check building permit requirement based on floor area
    if (input.floorArea !== undefined) {
      const permitThreshold = 100; // Buildings over 100 sqm typically require permit
      checks.push({
        name: 'Building Permit Requirement',
        status: 'warning',
        actualValue: `${input.floorArea.toFixed(2)} m²`,
        requiredValue: `> ${permitThreshold} m² requires permit`,
        regulation: 'Building Act Article 11',
        message:
          input.floorArea > permitThreshold
            ? `Building with floor area of ${input.floorArea.toFixed(2)} m² requires building permit`
            : `Building with floor area of ${input.floorArea.toFixed(2)} m² may qualify for simplified report process`,
      });
    }

    // Check if location data is available for infrastructure assessment
    if (input.latitude && input.longitude) {
      checks.push({
        name: 'Location Assessment',
        status: 'pass',
        actualValue: `${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}`,
        regulation: 'Urban Planning Act',
        message: 'Location data available for infrastructure assessment',
      });

      // Check road access
      if (input.nearbyRoads) {
        const roadsData = input.nearbyRoads as any;
        const hasRoadAccess = roadsData.features?.length > 0 || Object.keys(roadsData).length > 0;
        checks.push({
          name: 'Road Access',
          status: hasRoadAccess ? 'pass' : 'warning',
          regulation: 'Building Act Article 44',
          message: hasRoadAccess
            ? 'Site has nearby road access'
            : 'Road access should be verified',
        });
      }
    }

    return checks;
  }

  /**
   * Use LLM to analyze compliance with detailed regulations
   */
  async analyzeWithLLM(
    input: ComplianceCheckInput,
    regulations: RegulationRule[],
    basicChecks: ComplianceCheck[]
  ): Promise<{
    additionalChecks: ComplianceCheck[];
    summary: string;
    recommendations: string[];
  }> {
    if (!this.model) {
      return {
        additionalChecks: [],
        summary: this.generateBasicSummary(basicChecks),
        recommendations: this.generateBasicRecommendations(basicChecks),
      };
    }

    // Prepare regulation context
    const regulationContext = regulations
      .slice(0, 20)
      .map(
        (reg, idx) =>
          `[${idx + 1}] ${reg.regulation} - ${reg.title || reg.articleId}\n${reg.text.slice(0, 500)}`
      )
      .join('\n\n');

    // Prepare building data context
    const buildingContext = `
Building Data:
- Site Area: ${input.siteArea ? `${input.siteArea.toFixed(2)} m²` : 'Not provided'}
- Building Area: ${input.buildingArea ? `${input.buildingArea.toFixed(2)} m²` : 'Not provided'}
- Total Floor Area: ${input.floorArea ? `${input.floorArea.toFixed(2)} m²` : 'Not provided'}
- Building Coverage Ratio: ${input.bcr ? `${input.bcr.toFixed(2)}%` : 'Not calculated'}
- Floor Area Ratio: ${input.far ? `${input.far.toFixed(2)}%` : 'Not calculated'}
- Number of Floors: ${input.numberOfFloors || 'Not provided'}
- Building Type: ${input.buildingType || 'Not specified'}
- Zone Type: ${input.zoneType || 'Not specified'}
- Location: ${input.latitude && input.longitude ? `${input.latitude}, ${input.longitude}` : 'Not provided'}
`;

    const basicChecksContext = basicChecks
      .map(
        (check) =>
          `- ${check.name}: ${check.status.toUpperCase()} - ${check.message}`
      )
      .join('\n');

    const prompt = `You are a Building Regulation Compliance Expert. Analyze the following building project data against the provided regulations.

${buildingContext}

Basic Compliance Checks Already Performed:
${basicChecksContext}

Relevant Regulations:
${regulationContext}

${input.extractedText && input.extractedText.length > 0 ? `\nExtracted Document Text:\n${input.extractedText.slice(0, 3).join('\n---\n').slice(0, 2000)}` : ''}

Based on the regulations and building data, provide:

1. ADDITIONAL COMPLIANCE ISSUES not covered by basic checks (if any)
2. A brief SUMMARY of the overall compliance status (2-3 sentences)
3. RECOMMENDATIONS for the applicant (3-5 bullet points)

Format your response as JSON:
{
  "additionalChecks": [
    {
      "name": "Check name",
      "status": "pass|fail|warning",
      "message": "Explanation"
    }
  ],
  "summary": "Overall compliance summary",
  "recommendations": ["Recommendation 1", "Recommendation 2", ...]
}

Return ONLY valid JSON, no explanations.`;

    try {
      const result = await this.model.generateContent(prompt);
      let responseText = result.response.text().trim();

      // Clean JSON response
      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const analysis = JSON.parse(responseText);

      return {
        additionalChecks: analysis.additionalChecks || [],
        summary: analysis.summary || this.generateBasicSummary(basicChecks),
        recommendations: analysis.recommendations || this.generateBasicRecommendations(basicChecks),
      };
    } catch (error) {
      console.error('Error in LLM analysis:', error);
      return {
        additionalChecks: [],
        summary: this.generateBasicSummary(basicChecks),
        recommendations: this.generateBasicRecommendations(basicChecks),
      };
    }
  }

  /**
   * Generate basic summary without LLM
   */
  private generateBasicSummary(checks: ComplianceCheck[]): string {
    const passCount = checks.filter((c) => c.status === 'pass').length;
    const failCount = checks.filter((c) => c.status === 'fail').length;
    const warningCount = checks.filter((c) => c.status === 'warning').length;

    if (failCount === 0 && warningCount === 0) {
      return `All ${passCount} compliance checks passed. The building project appears to meet regulatory requirements.`;
    } else if (failCount === 0) {
      return `${passCount} checks passed with ${warningCount} warning(s). Review the warnings before proceeding.`;
    } else {
      return `${failCount} compliance issue(s) found out of ${checks.length} checks. Please address the failed requirements before proceeding.`;
    }
  }

  /**
   * Generate basic recommendations without LLM
   */
  private generateBasicRecommendations(checks: ComplianceCheck[]): string[] {
    const recommendations: string[] = [];
    const failedChecks = checks.filter((c) => c.status === 'fail');
    const warningChecks = checks.filter((c) => c.status === 'warning');

    if (failedChecks.length > 0) {
      recommendations.push('Address all failed compliance checks before submitting your application');
      failedChecks.forEach((check) => {
        recommendations.push(`Review and correct: ${check.name} - ${check.message}`);
      });
    }

    if (warningChecks.length > 0) {
      recommendations.push('Review warning items and provide additional documentation if needed');
    }

    if (recommendations.length === 0) {
      recommendations.push('Prepare all required documentation for permit application');
      recommendations.push('Consult with a licensed architect for detailed plans');
      recommendations.push('Schedule pre-application meeting with building authority if needed');
    }

    return recommendations.slice(0, 5);
  }

  /**
   * Main compliance check function
   */
  async checkCompliance(sessionId: number): Promise<ComplianceResult> {
    // Fetch session data
    const input = await this.fetchSessionData(sessionId);

    // Fetch relevant regulations from knowledge base
    const regulations = await this.fetchRelevantRegulations(input);

    // Perform basic checks
    const basicChecks = this.performBasicChecks(input, regulations);

    // Analyze with LLM for additional insights
    const llmAnalysis = await this.analyzeWithLLM(input, regulations, basicChecks);

    // Combine all checks
    const allChecks = [...basicChecks, ...llmAnalysis.additionalChecks];

    // Calculate overall score
    const passCount = allChecks.filter((c) => c.status === 'pass').length;
    const failCount = allChecks.filter((c) => c.status === 'fail').length;
    const totalChecks = allChecks.length;
    const overallScore = totalChecks > 0 ? Math.round((passCount / totalChecks) * 100) : 0;

    // Determine overall status
    let status: 'accepted' | 'rejected' | 'review_required';
    if (failCount === 0 && overallScore >= 80) {
      status = 'accepted';
    } else if (failCount > 2 || overallScore < 50) {
      status = 'rejected';
    } else {
      status = 'review_required';
    }

    return {
      status,
      overallScore,
      checks: allChecks,
      summary: llmAnalysis.summary,
      applicableRegulations: regulations.slice(0, 10),
      recommendations: llmAnalysis.recommendations,
    };
  }

  /**
   * Save compliance result to database
   */
  async saveComplianceResult(sessionId: number, result: ComplianceResult): Promise<void> {
    await prisma.demoComplianceResult.upsert({
      where: { sessionId },
      update: {
        status: result.status,
        overallScore: result.overallScore,
        summary: result.summary,
        checks: result.checks as any,
        applicableRegulations: result.applicableRegulations as any,
        recommendations: result.recommendations,
        updatedAt: new Date(),
      },
      create: {
        sessionId,
        status: result.status,
        overallScore: result.overallScore,
        summary: result.summary,
        checks: result.checks as any,
        applicableRegulations: result.applicableRegulations as any,
        recommendations: result.recommendations,
      },
    });
  }

  /**
   * Get compliance result from database
   */
  async getComplianceResult(sessionId: number): Promise<ComplianceResult | null> {
    const result = await prisma.demoComplianceResult.findUnique({
      where: { sessionId },
    });

    if (!result) {
      return null;
    }

    return {
      status: result.status as 'accepted' | 'rejected' | 'review_required',
      overallScore: result.overallScore,
      checks: result.checks as unknown as ComplianceCheck[],
      summary: result.summary,
      applicableRegulations: result.applicableRegulations as unknown as RegulationRule[],
      recommendations: result.recommendations,
    };
  }
}

export default new ComplianceService();
