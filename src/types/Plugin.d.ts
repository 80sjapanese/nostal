export type ParamType = 'slider' | 'select' | 'checkbox';

export interface BaseParam {
  key: string;
  label: string;
  type: ParamType;
  // 条件付き表示: { key: 'targetParam', value: targetValue }
  // 指定したキーのパラメータが指定した値のときのみ表示する
  visibleIf?: { key: string; value: string | number | boolean };
}

export interface SliderParam extends BaseParam {
  type: 'slider';
  default: number;
  min: number;
  max: number;
  softMin?: number;
  softMax?: number;
}

export interface SelectParam extends BaseParam {
  type: 'select';
  default: string | number;
  options: { label: string; value: string | number }[];
}

export interface CheckboxParam extends BaseParam {
  type: 'checkbox';
  default: boolean;
}

export type ParamDef = SliderParam | SelectParam | CheckboxParam;

export interface PluginDefinition {
  id: string;
  name: string;
  category: 'subjects' | 'lens' | 'film' | 'post' | 'print';
  parameters: ParamDef[];
  fragmentShader: string;
  assets?: Record<string, string>; // { noiseMap: '/path/to/noise.png' }
  saveSnapshot?: string; // スナップショット保存名
  needsSnapshot?: string[]; // 必要なスナップショット名
  getEffectRadius?: (params: Record<string, any>, scale: number) => number;
}

export interface LayerInstance {
  id: string;
  pluginId: string;
  visible: boolean;
  params: Record<string, any>; // number | string | boolean
}