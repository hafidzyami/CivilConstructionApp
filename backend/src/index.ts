import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import { swaggerSpec } from './config/swagger';
import ocrRoutes from './routes/ocr.routes';
import osmRoutes from './routes/osm.routes';
import chatbotRoutes from './routes/chatbot.routes';
import cadRoutes from './routes/cad.routes';
import demoRoutes from './routes/demo.routes';
import initService from './services/init.service';
import { initializeBucket } from './lib/minio';

dotenv.config();

// Ensure temporary upload directory exists (for receiving files before forwarding to OCR service)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`📁 Created temporary uploads directory: ${uploadDir}`);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/api/ocr', ocrRoutes);
app.use('/api/osm', osmRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/cad', cadRoutes);
app.use('/api/demo', demoRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'MarkAny GaneshaIT Civil Construction API',
    documentation: '/api-docs',
    version: '1.0.0',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);

  // Initialize MinIO bucket
  try {
    await initializeBucket();
  } catch (error) {
    console.error('⚠️  MinIO initialization failed, but server will continue:', error);
  }

  // Initialize knowledge base
  await initService.initialize();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await initService.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await initService.shutdown();
  process.exit(0);
});

export default app;
