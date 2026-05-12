import {
  promises as fs,
  createReadStream,
  createWriteStream,
  type ReadStream,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getExportStorageDir } from '../../config/env.js';
import type {
  ExportFileStore,
  ObjectKeyParams,
  ObjectStat,
  WriteObjectParams,
  WriteObjectResult,
} from './export-file-store.js';

/**
 * Thin filesystem wrapper used by the exports module. Keeps all path and
 * stream handling in one place so future swaps to object storage (S3, GCS)
 * only touch this file.
 */
export class LocalFileStore implements ExportFileStore {
  readonly driver = 'local' as const;
  private readonly rootDir: string;

  constructor(rootDir: string = getExportStorageDir()) {
    this.rootDir = resolve(rootDir);
  }

  async ensureReady(): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  resolvePath(fileName: string): string {
    return resolve(this.rootDir, fileName);
  }

  async writeFile(
    fileName: string,
    data: Buffer | Uint8Array,
  ): Promise<string> {
    const filePath = this.resolvePath(fileName);
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return filePath;
  }

  async writeObject(params: WriteObjectParams): Promise<WriteObjectResult> {
    const filePath = this.resolvePath(params.key);
    await fs.mkdir(dirname(filePath), { recursive: true });
    if (params.body instanceof Readable) {
      await pipeline(params.body, createWriteStream(filePath));
    } else {
      await fs.writeFile(filePath, params.body);
    }
    const info = await this.stat(filePath);
    return {
      key: filePath,
      size: info.size,
      contentType: params.contentType,
    };
  }

  async readObject(params: ObjectKeyParams): Promise<Buffer> {
    return fs.readFile(this.resolvePath(params.key));
  }

  async stat(filePath: string): Promise<ObjectStat>;
  async stat(params: ObjectKeyParams): Promise<ObjectStat>;
  async stat(filePathOrParams: string | ObjectKeyParams): Promise<ObjectStat> {
    const filePath =
      typeof filePathOrParams === 'string'
        ? filePathOrParams
        : this.resolvePath(filePathOrParams.key);
    const info = await fs.stat(filePath);
    return { size: info.size, contentType: null };
  }

  async exists(filePath: string): Promise<boolean>;
  async exists(params: ObjectKeyParams): Promise<boolean>;
  async exists(filePathOrParams: string | ObjectKeyParams): Promise<boolean> {
    const filePath =
      typeof filePathOrParams === 'string'
        ? filePathOrParams
        : this.resolvePath(filePathOrParams.key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  createReadStream(filePath: string): ReadStream {
    return createReadStream(filePath);
  }

  async getDownloadStream(params: ObjectKeyParams): Promise<ReadStream> {
    return this.createReadStream(this.resolvePath(params.key));
  }

  async deleteObject(params: ObjectKeyParams): Promise<void> {
    await fs.rm(this.resolvePath(params.key), { force: true });
  }
}
