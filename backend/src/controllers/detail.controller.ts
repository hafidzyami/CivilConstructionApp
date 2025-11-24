import { Request, Response } from 'express';
import detailService from '../services/detail.service';
import { createDetailSchema, updateDetailSchema } from '../schemas/detail.schema';

export class DetailController {
  async getAll(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await detailService.getAllDetails(page, limit);
      
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid ID format',
        });
      }

      const detail = await detailService.getDetailById(id);
      
      res.status(200).json({
        success: true,
        data: detail,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Detail not found') {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }
      
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const validatedData = createDetailSchema.parse(req.body);
      
      const detail = await detailService.createDetail(validatedData);
      
      res.status(201).json({
        success: true,
        data: detail,
        message: 'Detail created successfully',
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error,
        });
      }
      
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid ID format',
        });
      }

      const validatedData = updateDetailSchema.parse(req.body);
      
      const detail = await detailService.updateDetail(id, validatedData);
      
      res.status(200).json({
        success: true,
        data: detail,
        message: 'Detail updated successfully',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Detail not found') {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error,
        });
      }
      
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid ID format',
        });
      }

      await detailService.deleteDetail(id);
      
      res.status(200).json({
        success: true,
        message: 'Detail deleted successfully',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Detail not found') {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }
      
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
}

export default new DetailController();
