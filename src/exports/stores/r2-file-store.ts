import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import type { R2Config } from '../../config/env.js';
import {
  type ExportFileStore,
  type ObjectKeyParams,
  type ObjectStat,
  type WriteObjectParams,
  type WriteObjectResult,
} from './export-file-store.js';

export class R2FileStore implements ExportFileStore {
  readonly driver = 'r2' as const;

  private readonly client: S3Client;

  constructor(private readonly config: R2Config, client?: S3Client) {
    this.client =
      client ??
      new S3Client({
        endpoint: config.endpoint,
        region: 'auto',
        forcePathStyle: config.forcePathStyle,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      } satisfies S3ClientConfig);
  }

  async ensureReady(): Promise<void> {
    await this.client.send(
      new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: '.storage-healthcheck',
      }),
    ).catch((error: unknown) => {
      if (this.isNotFound(error)) return undefined;
      throw error;
    });
  }

  async writeObject(params: WriteObjectParams): Promise<WriteObjectResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );

    const stat = await this.stat({ key: params.key });
    return {
      key: params.key,
      size: stat.size,
      contentType: stat.contentType ?? params.contentType,
    };
  }

  async readObject(params: ObjectKeyParams): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: params.key,
      }),
    );

    const body = response.Body;
    if (!body) return Buffer.alloc(0);
    if (body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }

    const asBlob = body as { transformToByteArray?: () => Promise<Uint8Array> };
    if (asBlob.transformToByteArray) {
      return Buffer.from(await asBlob.transformToByteArray());
    }

    return Buffer.from([]);
  }

  async exists(params: ObjectKeyParams): Promise<boolean> {
    try {
      await this.stat(params);
      return true;
    } catch (error) {
      if (this.isNotFound(error)) return false;
      throw error;
    }
  }

  async stat(params: ObjectKeyParams): Promise<ObjectStat> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: params.key,
      }),
    );

    return {
      size: response.ContentLength ?? null,
      contentType: response.ContentType ?? null,
    };
  }

  async deleteObject(params: ObjectKeyParams): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: params.key,
      }),
    );
  }

  async getDownloadStream(params: ObjectKeyParams): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: params.key,
      }),
    );

    if (!response.Body) {
      return Readable.from([]);
    }
    if (response.Body instanceof Readable) {
      return response.Body;
    }

    const body = response.Body as AsyncIterable<Uint8Array>;
    return Readable.from(body);
  }

  private isNotFound(error: unknown): boolean {
    if (error instanceof NoSuchKey || error instanceof NotFound) return true;
    const metadata = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata;
    const name =
      error instanceof Error
        ? error.name
        : (error as { name?: string } | null)?.name;
    return (
      name === 'NotFound' ||
      name === 'NoSuchKey' ||
      metadata?.httpStatusCode === 404
    );
  }
}
