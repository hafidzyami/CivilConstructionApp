import * as Minio from 'minio';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config();

// MinIO Configuration Class
class MinioConfig {
  private static instance: MinioConfig;
  private client: Minio.Client;
  private publicClient: Minio.Client | null = null;
  private bucketName: string;
  private bucketInitialized = false;

  private constructor() {
    const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = parseInt(process.env.MINIO_PORT || '9000');
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    const accessKey = process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || '';
    const secretKey = process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '';

    console.log('🔧 MinIO Configuration:', {
      endpoint,
      port,
      useSSL,
      accessKey: accessKey ? `${accessKey.substring(0, 4)}...` : 'NOT SET',
      secretKey: secretKey ? '***SET***' : 'NOT SET',
    });

    // Internal client
    this.client = new Minio.Client({
      endPoint: endpoint,
      port: port,
      useSSL: useSSL,
      accessKey: accessKey,
      secretKey: secretKey,
    });

    // Public client for presigned URLs (if public URL is set)
    const publicUrl = process.env.MINIO_PUBLIC_URL;
    if (publicUrl) {
      try {
        const url = new URL(publicUrl);
        this.publicClient = new Minio.Client({
          endPoint: url.hostname,
          port: url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80),
          useSSL: url.protocol === 'https:',
          accessKey: accessKey,
          secretKey: secretKey,
        });
        console.log('✅ Public MinIO client initialized for:', url.hostname);
      } catch (error) {
        console.warn('⚠️  Failed to parse MINIO_PUBLIC_URL, using internal client for URLs');
      }
    }

    this.bucketName = process.env.MINIO_BUCKET_NAME || 'civil-llm';
  }

  public static getInstance(): MinioConfig {
    if (!MinioConfig.instance) {
      MinioConfig.instance = new MinioConfig();
    }
    return MinioConfig.instance;
  }

  public getClient(): Minio.Client {
    return this.client;
  }

  public getPublicClient(): Minio.Client {
    return this.publicClient || this.client;
  }

  public getBucketName(): string {
    return this.bucketName;
  }

  public async ensureBucketExists(): Promise<void> {
    if (this.bucketInitialized) {
      return;
    }

    try {
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.bucketName, 'us-east-1');
        console.log(`✅ MinIO bucket '${this.bucketName}' created`);

        // Set bucket policy to public read
        const policy = {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.bucketName}/*`],
            },
          ],
        };
        await this.client.setBucketPolicy(this.bucketName, JSON.stringify(policy));
        console.log(`✅ MinIO bucket policy set to public read`);
      } else {
        console.log(`✅ MinIO bucket '${this.bucketName}' already exists`);
      }
      this.bucketInitialized = true;
    } catch (error: any) {
      console.error('❌ Error ensuring MinIO bucket exists:', error);
      throw error;
    }
  }
}

// Export singleton instance
const minioConfig = MinioConfig.getInstance();
const minioClient = minioConfig.getClient();
const BUCKET_NAME = minioConfig.getBucketName();

// Initialize bucket
export const initializeBucket = async () => {
  try {
    await minioConfig.ensureBucketExists();
  } catch (error: any) {
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
    // Ensure bucket exists
    await minioConfig.ensureBucketExists();

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

    // Construct public URL directly (bucket is public read)
    const publicUrl = process.env.MINIO_PUBLIC_URL || 'http://localhost:9000';
    const fileUrl = `${publicUrl}/${BUCKET_NAME}/${objectName}`;

    console.log('✅ File uploaded:', { objectName, url: fileUrl });

    return fileUrl;
  } catch (error) {
    console.error('❌ Error uploading file to MinIO:', error);
    throw error;
  }
};

export const deleteFile = async (objectName: string): Promise<void> => {
  try {
    await minioClient.removeObject(BUCKET_NAME, objectName);
    console.log('✅ File deleted:', objectName);
  } catch (error) {
    console.error('❌ Error deleting file from MinIO:', error);
    throw error;
  }
};

export default minioClient;
