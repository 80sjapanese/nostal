import type { CropState } from '../../types/Crop';
import { renderCropPreview } from './cropUtils';

/**
 * クロップ処理のレンダリングユーティリティ
 * @deprecated このクラスは後方互換性のために残されています。
 * 新しいコードでは cropUtils.ts の renderCropPreview を直接使用してください。
 */
export class CropRenderer {
  static renderPreview(image: HTMLImageElement, state: CropState, targetMaxDim = 1024): string {
    return renderCropPreview(image, state, targetMaxDim);
  }
}
