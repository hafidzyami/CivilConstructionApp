import { Request, Response } from 'express';
import { uploadFile } from '../lib/minio';
import multer from 'multer';
import prisma from '../lib/prisma';
import complianceService from '../services/compliance.service';

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
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

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
    console.error('Error getting/creating session:', error);
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
      return res.status(400).json({
        success: false,
        message: 'No files uploaded',
      });
    }

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
    console.error('Error uploading documents:', error);
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
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

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
    console.error('Error saving CAD data:', error);
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
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

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
    console.error('Error saving infrastructure data:', error);
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
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

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
    console.error('Error saving OCR data:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all sessions (for admin)
export const getAllSessions = async (req: Request, res: Response) => {
  try {
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
    console.error('Error getting all sessions:', error);
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
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    console.error('Error getting session:', error);
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
    console.error('Error deleting session:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get next user ID
export const getNextUserId = async (req: Request, res: Response) => {
  try {
    const lastSession = await prisma.demoSession.findFirst({
      orderBy: { userId: 'desc' },
    });

    const nextUserId = lastSession ? lastSession.userId + 1 : 1;

    res.json({
      success: true,
      data: { userId: nextUserId },
    });
  } catch (error: any) {
    console.error('Error getting next user ID:', error);
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
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No DXF file uploaded',
      });
    }

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
    console.error('Error uploading DXF file:', error);
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
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

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
    console.error('Error saving floor plan data:', error);
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
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

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
    console.error('Error checking compliance:', error);
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
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    const result = await complianceService.getComplianceResult(parseInt(sessionId));

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Compliance result not found. Please run compliance check first.',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error getting compliance result:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
