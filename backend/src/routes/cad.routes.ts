import express from 'express';
import multer from 'multer';
import path from 'path';
import * as cadController from '../controllers/cad.controller';

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '../../uploads/') });

router.post('/layers', upload.single('file'), cadController.getLayers);
router.post('/process', upload.single('file'), cadController.processCad);

export default router;