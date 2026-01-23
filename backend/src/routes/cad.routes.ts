import express from 'express';
import multer from 'multer';
import path from 'path';
import * as cadController from '../controllers/cad.controller';

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '../../uploads/') });

router.post('/layers', upload.single('file'), cadController.getLayers);
router.post('/process', upload.single('file'), cadController.processCad);
router.post('/process-auto', upload.single('file'), cadController.processCadAuto);
router.post('/process-llm', upload.single('file'), cadController.processCadLLM);

export default router;