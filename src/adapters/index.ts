import { APP_MODE } from '../version';
import type { AmanDataAdapter } from './AmanDataAdapter';
import { ApiDataAdapter } from './ApiDataAdapter';
import { PreviewDataAdapter } from './PreviewDataAdapter';

export const dataAdapter: AmanDataAdapter =
  APP_MODE === 'production' ? new ApiDataAdapter() : new PreviewDataAdapter();

export function getPreviewAdapter(): PreviewDataAdapter | null {
  return APP_MODE === 'preview' && dataAdapter instanceof PreviewDataAdapter
    ? dataAdapter
    : null;
}

export type { AmanDataAdapter } from './AmanDataAdapter';
