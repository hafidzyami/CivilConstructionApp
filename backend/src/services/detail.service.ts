import { Prisma } from '@prisma/client'; // Updated import
import prisma from '../lib/prisma';

export class DetailService {
  async getAllDetails(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    
    const [details, total] = await Promise.all([
      prisma.detail.findMany({
        where: {
          deletedAt: null,
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.detail.count({
        where: {
          deletedAt: null,
        },
      }),
    ]);

    return {
      data: details,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getDetailById(id: number) {
    const detail = await prisma.detail.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!detail) {
      throw new Error('Detail not found');
    }

    return detail;
  }

  async createDetail(data: Prisma.DetailCreateInput) {
    return await prisma.detail.create({
      data,
    });
  }

  async updateDetail(id: number, data: Prisma.DetailUpdateInput) {
    // Check if detail exists
    await this.getDetailById(id);

    return await prisma.detail.update({
      where: { id },
      data,
    });
  }

  async deleteDetail(id: number) {
    // Check if detail exists
    await this.getDetailById(id);

    // Soft delete
    return await prisma.detail.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}

export default new DetailService();