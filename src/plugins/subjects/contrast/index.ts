import { PluginDefinition } from '../../../types/Plugin';

// シンプルかつ確実なコントラスト処理
const fragmentShader = `
uniform float contrast; // -100 to 100
uniform sampler2D tDiffuse;
varying vec2 vUv;

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  
  // -100 ~ 100 を 0.0 ~ 2.0 の係数に変換
  // -100 -> 0.0 (グレー)
  // 0 -> 1.0 (等倍)
  // 100 -> 2.0 (ハイコントラスト)
  float factor = (contrast + 100.0) / 100.0;
  
  // コントラスト計算: 中心(0.5)からの距離を拡大縮小する
  color.rgb = (color.rgb - 0.5) * factor + 0.5;
  
  // アルファチャンネルは変更しない
  gl_FragColor = vec4(color.rgb, color.a);
}
`;

const ContrastPlugin: PluginDefinition = {
  id: 'contrast',
  name: 'Contrast',
  category: 'subjects',
  parameters: [
    {
      key: 'contrast',
      type: 'slider',
      label: 'Contrast',
      default: 0,
      min: -100,
      max: 100
    }
  ],
  fragmentShader,
  getEffectRadius: (params, scale) => 0
};

export default ContrastPlugin;