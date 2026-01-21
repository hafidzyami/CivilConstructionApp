import * as Minio from 'minio';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config();

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || '',
  secretKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '',
});

const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'civil-llm';

// Initialize bucket
export const initializeBucket = async () => {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
      console.log(`✅ MinIO bucket '${BUCKET_NAME}' created`);

      // Set bucket policy to public read
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`],
          },
        ],
      };
      await minioClient.setBucketPolicy(BUCKET_NAME, JSON.stringify(policy));
    } else {
      console.log(`✅ MinIO bucket '${BUCKET_NAME}' already exists`);
    }
  } catch (error) {
    console.error('❌ Error initializing MinIO bucket:', error);
    throw error;
  }
};

export const uploadFile = async (
  file: Buffer | Readable,
  fileName: string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<string> => {
  try {
    const objectName = `demo/${Date.now()}-${fileName}`;
    
    await minioClient.putObject(
      BUCKET_NAME,
      objectName,
      file,
      Buffer.isBuffer(file) ? file.length : undefined,
      {
        'Content-Type': contentType,
        ...metadata,
      }
    );

    // Generate public URL
    const publicUrl = process.env.MINIO_PUBLIC_URL
      ? `${process.env.MINIO_PUBLIC_URL}${objectName}`
      : `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${BUCKET_NAME}/${objectName}`;

    return publicUrl;
  } catch (error) {
    console.error('❌ Error uploading file to MinIO:', error);
    throw error;
  }
};

export const deleteFile = async (objectName: string): Promise<void> => {
  try {
    await minioClient.removeObject(BUCKET_NAME, objectName);
  } catch (error) {
    console.error('❌ Error deleting file from MinIO:', error);
    throw error;
  }
};

export default minioClient;
