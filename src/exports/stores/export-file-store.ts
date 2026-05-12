import type { Readable } from 'node:stream';

export type WriteObjectParams = {
  key: string;
  body: Buffer | Uint8Array | Readable;
  contentType: string;
};

export type ObjectKeyParams = {
  key: string;
};

export type ObjectStat = {
  size: number | null;
  contentType: string | null;
};

export type WriteObjectResult = {
  key: string;
  size: number | null;
  contentType: string | null;
};

export interface ExportFileStore {
  readonly driver: 'r2';
  ensureReady(): Promise<void>;
  writeObject(params: WriteObjectParams): Promise<WriteObjectResult>;
  readObject(params: ObjectKeyParams): Promise<Buffer>;
  exists(params: ObjectKeyParams): Promise<boolean>;
  stat(params: ObjectKeyParams): Promise<ObjectStat>;
  deleteObject?(params: ObjectKeyParams): Promise<void>;
  getDownloadStream(params: ObjectKeyParams): Promise<Readable>;
}
