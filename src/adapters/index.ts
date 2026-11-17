import { APP_MODE, type AppMode } from '../version';
import type { AmanDataAdapter } from './AmanDataAdapter';
import { ApiDataAdapter } from './ApiDataAdapter';
import { PreviewDataAdapter } from './PreviewDataAdapter';

export function selectDataAdapter(mode: AppMode): AmanDataAdapter {
  if (mode === 'production') {
    return new ApiDataAdapter();
  }
  if (mode === 'preview') {
    return new PreviewDataAdapter();
  }
  throw new Error(`Unsupported AMAN data adapter mode: ${String(mode)}`);
}

export const dataAdapter: AmanDataAdapter = selectDataAdapter(APP_MODE);

export function getPreviewAdapter(): PreviewDataAdapter | null {
  if (APP_MODE !== 'preview') {
    return null;
  }
  return dataAdapter instanceof PreviewDataAdapter ? dataAdapter : null;
}

export type { AmanDataAdapter } from './AmanDataAdapter';
