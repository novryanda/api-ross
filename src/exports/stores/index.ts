import { getR2Config } from '../../config/env.js';
import type { ExportFileStore } from './export-file-store.js';
import { R2FileStore } from './r2-file-store.js';

export function createExportFileStore(): ExportFileStore {
  return new R2FileStore(getR2Config());
}

export type { ExportFileStore } from './export-file-store.js';
export { R2FileStore } from './r2-file-store.js';
