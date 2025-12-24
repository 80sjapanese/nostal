export interface CropState {
  scale: number;
  baseScale: number;
  smoothRotation: number;
  baseRotationIndex: number;
  flipX: number;
  flipY: number;
  panX: number;
  panY: number;
  boxWidth: number;
  boxHeight: number;
  boxOffsetX: number;
  boxOffsetY: number;
  aspectRatioVal: number | null;
}
