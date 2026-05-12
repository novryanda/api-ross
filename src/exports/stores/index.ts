import {
  getExportStorageDriver,
  getR2Config,
} from '../../config/env.js';
import type { ExportFileStore } from './export-file-store.js';
import { LocalFileStore } from './local-file-store.js';
import { R2FileStore } from './r2-file-store.js';

export function createExportFileStore(): ExportFileStore {
  const driver = getExportStorageDriver();
  if (driver === 'r2') {
    return new R2FileStore(getR2Config());
  }
  return new LocalFileStore();
}

export type { ExportFileStore } from './export-file-store.js';
export { LocalFileStore } from './local-file-store.js';
export { R2FileStore } from './r2-file-store.js';
