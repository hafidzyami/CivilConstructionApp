import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import logger from './lib/logger';
import { swaggerSpec } from './config/swagger';
import ocrRoutes from './routes/ocr.routes';
import osmRoutes from './routes/osm.routes';
import chatbotRoutes from './routes/chatbot.routes';
import cadRoutes from './routes/cad.routes';
import demoRoutes from './routes/demo.routes';
import segmentationRoutes from './routes/segmentation.routes';
import cubicasaRoutes from './routes/cubicasa.routes';
import initService from './services/init.service';
import { initializeBucket } from './lib/minio';

dotenv.config();

// Ensure temporary upload directory exists (for receiving files before forwarding to OCR service)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  logger.info('Server', `Created temporary uploads directory: ${uploadDir}`);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// HTTP request/response logger middleware
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const start = Date.now();
  const { method, originalUrl, ip } = req;
  logger.info('HTTP', `→ ${method} ${originalUrl}`, { ip });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    logger[level]('HTTP', `← ${method} ${originalUrl} ${statusCode}`, { duration: `${duration}ms`, ip });
  });

  next();
});

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/api/ocr', ocrRoutes);
app.use('/api/osm', osmRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/cad', cadRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/segmentation', segmentationRoutes);
app.use('/api/cubicasa', cubicasaRoutes);

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
  logger.warn('HTTP', `Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('HTTP', `Unhandled error on ${req.method} ${req.originalUrl}`, { message: err.message });
  if (err.stack) logger.error('HTTP', err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

app.listen(PORT, async () => {
  logger.info('Server', `🚀 Running on http://localhost:${PORT}`);
  logger.info('Server', `📚 API Docs available at http://localhost:${PORT}/api-docs`);

  // Initialize MinIO bucket
  try {
    await initializeBucket();
  } catch (error) {
    logger.error('MinIO', 'Initialization failed, but server will continue', { error: String(error) });
  }

  // Initialize knowledge base
  await initService.initialize();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Server', '🛑 Received SIGINT, shutting down gracefully...');
  await initService.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Server', '🛑 Received SIGTERM, shutting down gracefully...');
  await initService.shutdown();
  process.exit(0);
});

export default app;
