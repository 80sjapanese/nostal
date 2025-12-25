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

export interface CropperUIState extends CropState {
  naturalWidth: number;
  naturalHeight: number;
  currentImgWidth: number;
  currentImgHeight: number;
  isDraggingImage: boolean;
  lastMouseX: number;
  lastMouseY: number;
  isResizingBox: boolean;
  resizeDir: string | null;
  resizeStartBoxWidth: number;
  resizeStartBoxHeight: number;
  resizeStartBoxOffsetX: number;
  resizeStartBoxOffsetY: number;
  isAnimating: boolean;
}
