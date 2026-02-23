import { Request, Response } from 'express';
import { uploadFile } from '../lib/minio';
import multer from 'multer';
import prisma from '../lib/prisma';
import complianceService from '../services/compliance.service';
import logger from '../lib/logger';

const CONTEXT = 'Demo';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

export const uploadMiddleware = upload.array('documents', 10);
export const uploadDxfMiddleware = upload.single('dxfFile');

// Get or create demo session
export const getOrCreateSession = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      logger.warn(CONTEXT, 'getOrCreateSession: missing userId');
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    logger.info(CONTEXT, 'getOrCreateSession: start', { userId });

    // Find existing session or create new one
    let session = await prisma.demoSession.findFirst({
      where: { userId: parseInt(userId) },
      include: {
        documents: true,
        cadData: true,
        floorplanData: true,
        infrastructureData: true,
        ocrData: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      session = await prisma.demoSession.create({
        data: { userId: parseInt(userId) },
        include: {
          documents: true,
          cadData: true,
          floorplanData: true,
          infrastructureData: true,
          ocrData: true,
        },
      });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'getOrCreateSession: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Upload documents
export const uploadDocuments = async (req: Request, res: Response) => {
  try {
    const { sessionId, documentType } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    if (!files || files.length === 0) {
      logger.warn(CONTEXT, 'uploadDocuments: no files uploaded', { sessionId });
      return res.status(400).json({
        success: false,
        message: 'No files uploaded',
      });
    }

    logger.info(CONTEXT, 'uploadDocuments: uploading files', { sessionId, count: files.length });

    // Upload files to MinIO and save to database
    const uploadedDocs = [];
    for (const file of files) {
      const fileUrl = await uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        {
          sessionId: sessionId.toString(),
        }
      );

      const doc = await prisma.demoDocument.create({
        data: {
          sessionId: parseInt(sessionId),
          fileName: file.originalname,
          fileUrl,
          mimeType: file.mimetype,
          fileSize: file.size,
          documentType: documentType || null,
        },
      });

      uploadedDocs.push(doc);
    }

    res.json({
      success: true,
      data: uploadedDocs,
      message: `${uploadedDocs.length} document(s) uploaded successfully`,
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'uploadDocuments: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Save CAD data
export const saveCadData = async (req: Request, res: Response) => {
  try {
    const { sessionId, siteArea, buildingArea, floorArea, bcr, far, buildingHeight, numFloors, rawData, dxfFileUrl } = req.body;

    if (!sessionId) {
      logger.warn(CONTEXT, 'saveCadData: missing sessionId');
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    logger.info(CONTEXT, 'saveCadData: saving CAD data', { sessionId });

    const cadData = await prisma.demoCadData.upsert({
      where: { sessionId: parseInt(sessionId) },
      update: {
        dxfFileUrl: dxfFileUrl || undefined,
        siteArea: siteArea ? parseFloat(siteArea) : null,
        buildingArea: buildingArea ? parseFloat(buildingArea) : null,
        floorArea: floorArea ? parseFloat(floorArea) : null,
        bcr: bcr ? parseFloat(bcr) : null,
        far: far ? parseFloat(far) : null,
        buildingHeight: buildingHeight ? parseFloat(buildingHeight) : null,
        numFloors: numFloors ? parseInt(numFloors) : null,
        rawData: rawData || null,
      },
      create: {
        sessionId: parseInt(sessionId),
        dxfFileUrl: dxfFileUrl || null,
        siteArea: siteArea ? parseFloat(siteArea) : null,
        buildingArea: buildingArea ? parseFloat(buildingArea) : null,
        floorArea: floorArea ? parseFloat(floorArea) : null,
        bcr: bcr ? parseFloat(bcr) : null,
        far: far ? parseFloat(far) : null,
        buildingHeight: buildingHeight ? parseFloat(buildingHeight) : null,
        numFloors: numFloors ? parseInt(numFloors) : null,
        rawData: rawData || null,
      },
    });

    res.json({
      success: true,
      data: cadData,
      message: 'CAD data saved successfully',
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'saveCadData: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Save infrastructure data
export const saveInfrastructureData = async (req: Request, res: Response) => {
  try {
    const { sessionId, latitude, longitude, radius, buildings, roads, railways, waterways, results, rawData } = req.body;

    if (!sessionId) {
      logger.warn(CONTEXT, 'saveInfrastructureData: missing sessionId');
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    logger.info(CONTEXT, 'saveInfrastructureData: saving infrastructure', { sessionId });

    // Extract labeled features from results
    let labeledFeatures = null;
    if (results && results.labeled) {
      labeledFeatures = results.labeled;
    }

    const infraData = await prisma.demoInfrastructure.upsert({
      where: { sessionId: parseInt(sessionId) },
      update: {
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        radius: radius ? parseFloat(radius) : null,
        buildings: buildings || null,
        roads: roads || null,
        railways: railways || null,
        waterways: waterways || null,
        labeledFeatures: labeledFeatures,
        rawData: results || rawData || null, // Use results if provided, fallback to rawData
      },
      create: {
        sessionId: parseInt(sessionId),
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        radius: radius ? parseFloat(radius) : null,
        buildings: buildings || null,
        roads: roads || null,
        railways: railways || null,
        waterways: waterways || null,
        labeledFeatures: labeledFeatures,
        rawData: results || rawData || null, // Use results if provided, fallback to rawData
      },
    });

    res.json({
      success: true,
      data: infraData,
      message: 'Infrastructure data saved successfully',
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'saveInfrastructureData: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Save OCR data
export const saveOcrData = async (req: Request, res: Response) => {
  try {
    const { sessionId, fileName, fileUrl, extractedText, engine, rawData, documentType } = req.body;
    const file = req.file as Express.Multer.File;

    if (!sessionId) {
      logger.warn(CONTEXT, 'saveOcrData: missing sessionId');
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    logger.info(CONTEXT, 'saveOcrData: saving OCR data', { sessionId, engine });

    let finalFileUrl = fileUrl || ''; // Use provided fileUrl first
    if (file && !finalFileUrl) {
      // Only upload if file provided and no fileUrl
      finalFileUrl = await uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        {
          sessionId: sessionId.toString(),
          type: 'ocr',
        }
      );
    }

    const ocrData = await prisma.demoOcr.create({
      data: {
        sessionId: parseInt(sessionId),
        fileName: fileName || file?.originalname || 'unknown',
        fileUrl: finalFileUrl,
        extractedText: extractedText || null,
        engine: engine || null,
        documentType: documentType || null,
        rawData: rawData || null,
      },
    });

    res.json({
      success: true,
      data: ocrData,
      message: 'OCR data saved successfully',
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'saveOcrData: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all sessions (for admin)
export const getAllSessions = async (req: Request, res: Response) => {
  try {
    logger.info(CONTEXT, 'getAllSessions: fetching all sessions');
    const sessions = await prisma.demoSession.findMany({
      include: {
        documents: true,
        cadData: true,
        floorplanData: true,
        infrastructureData: true,
        ocrData: true,
        complianceResult: true,
        chatHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: sessions,
      count: sessions.length,
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'getAllSessions: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get session by ID
export const getSessionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    logger.info(CONTEXT, 'getSessionById: fetching session', { id });

    const session = await prisma.demoSession.findUnique({
      where: { id: parseInt(id) },
      include: {
        documents: true,
        cadData: true,
        floorplanData: true,
        infrastructureData: true,
        ocrData: true,
      },
    });

    if (!session) {
      logger.warn(CONTEXT, 'getSessionById: session not found', { id });
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    logger.info(CONTEXT, 'getSessionById: succeeded', { id });
    res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'getSessionById: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete session
export const deleteSession = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    logger.info(CONTEXT, 'deleteSession: deleting session', { id });

    // Check if session exists
    const session = await prisma.demoSession.findUnique({
      where: { id: parseInt(id) },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    // Delete session (cascade will delete related records)
    await prisma.demoSession.delete({
      where: { id: parseInt(id) },
    });

    res.json({
      success: true,
      message: 'Session deleted successfully',
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'deleteSession: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get next user ID
export const getNextUserId = async (req: Request, res: Response) => {
  try {
    logger.info(CONTEXT, 'getNextUserId: fetching next user ID');
    const lastSession = await prisma.demoSession.findFirst({
      orderBy: { userId: 'desc' },
    });

    const nextUserId = lastSession ? lastSession.userId + 1 : 1;

    res.json({
      success: true,
      data: { userId: nextUserId },
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'getNextUserId: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Upload DXF file
export const uploadDxf = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    const file = req.file as Express.Multer.File;

    if (!sessionId) {
      logger.warn(CONTEXT, 'uploadDxf: missing sessionId');
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    if (!file) {
      logger.warn(CONTEXT, 'uploadDxf: no DXF file uploaded', { sessionId });
      return res.status(400).json({
        success: false,
        message: 'No DXF file uploaded',
      });
    }

    logger.info(CONTEXT, 'uploadDxf: uploading DXF', { sessionId, file: file.originalname });

    // Upload DXF file to MinIO
    const fileUrl = await uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      {
        sessionId: sessionId.toString(),
        type: 'cad',
      }
    );

    // Update CAD data with DXF file URL
    const cadData = await prisma.demoCadData.upsert({
      where: { sessionId: parseInt(sessionId) },
      update: {
        dxfFileUrl: fileUrl,
      },
      create: {
        sessionId: parseInt(sessionId),
        dxfFileUrl: fileUrl,
      },
    });

    res.json({
      success: true,
      data: { fileUrl, cadData },
      message: 'DXF file uploaded successfully',
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'uploadDxf: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Save floor plan analysis data (CubiCasa5k)
export const saveFloorplanData = async (req: Request, res: Response) => {
  try {
    const { sessionId, imageUrl, roomStats, iconStats, roomSummary, iconSummary, imageWidth, imageHeight, rawData } = req.body;

    if (!sessionId) {
      logger.warn(CONTEXT, 'saveFloorplanData: missing sessionId');
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    logger.info(CONTEXT, 'saveFloorplanData: saving floor plan data', { sessionId });

    const floorplanData = await prisma.demoFloorplanData.upsert({
      where: { sessionId: parseInt(sessionId) },
      update: {
        imageUrl: imageUrl || undefined,
        roomStats: roomStats || null,
        iconStats: iconStats || null,
        roomSummary: roomSummary || null,
        iconSummary: iconSummary || null,
        imageWidth: imageWidth ? parseInt(imageWidth) : null,
        imageHeight: imageHeight ? parseInt(imageHeight) : null,
        rawData: rawData || null,
      },
      create: {
        sessionId: parseInt(sessionId),
        imageUrl: imageUrl || null,
        roomStats: roomStats || null,
        iconStats: iconStats || null,
        roomSummary: roomSummary || null,
        iconSummary: iconSummary || null,
        imageWidth: imageWidth ? parseInt(imageWidth) : null,
        imageHeight: imageHeight ? parseInt(imageHeight) : null,
        rawData: rawData || null,
      },
    });

    res.json({
      success: true,
      data: floorplanData,
      message: 'Floor plan data saved successfully',
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'saveFloorplanData: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Check compliance against regulations
export const checkCompliance = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      logger.warn(CONTEXT, 'checkCompliance: missing sessionId');
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    logger.info(CONTEXT, 'checkCompliance: running compliance check', { sessionId });

    // Perform compliance check
    const result = await complianceService.checkCompliance(parseInt(sessionId));

    // Save result to database
    await complianceService.saveComplianceResult(parseInt(sessionId), result);

    res.json({
      success: true,
      data: result,
      message: 'Compliance check completed successfully',
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'checkCompliance: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get compliance result
export const getComplianceResult = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      logger.warn(CONTEXT, 'getComplianceResult: missing sessionId');
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    logger.info(CONTEXT, 'getComplianceResult: fetching result', { sessionId });
    const result = await complianceService.getComplianceResult(parseInt(sessionId));

    if (!result) {
      logger.warn(CONTEXT, 'getComplianceResult: result not found', { sessionId });
      return res.status(404).json({
        success: false,
        message: 'Compliance result not found. Please run compliance check first.',
      });
    }

    logger.info(CONTEXT, 'getComplianceResult: succeeded', { sessionId, status: result.status });
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error(CONTEXT, 'getComplianceResult: failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
