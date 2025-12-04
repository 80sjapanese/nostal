import { PluginDefinition } from '../../../types/Plugin';

const fragmentShader = `
uniform int mode;        // 0: Saturation, 1: Hue
uniform float saturation; // -100 to 100
uniform float hue;        // -180 to 180
uniform int bw;          // 0 or 1 (checkbox)
uniform sampler2D tDiffuse;
varying vec2 vUv;

// RGB -> HSV 変換などのヘルパー関数を使わず、軽量な行列計算で行う
const vec3 W = vec3(0.2125, 0.7154, 0.0721); // Luminance coefficient

vec3 adjustSaturation(vec3 color, float adjustment) {
    vec3 intensity = vec3(dot(color, W));
    return mix(intensity, color, adjustment);
}

vec3 adjustHue(vec3 color, float angleDegrees) {
    float angle = radians(angleDegrees);
    float c = cos(angle);
    float s = sin(angle);
    // RGB回転行列
    vec3 weights = (vec3(2.0 * c, -sqrt(3.0) * s - c, sqrt(3.0) * s - c) + 1.0) / 3.0;
    float len = length(color);
    // 簡易的なHue回転
    return vec3(
        dot(color, weights.xyz),
        dot(color, weights.zxy),
        dot(color, weights.yzx)
    );
}

void main() {
    vec4 tex = texture2D(tDiffuse, vUv);
    vec3 color = tex.rgb;

    if (bw == 1) {
        // Black and White mode (Saturation = -100相当 = 0.0倍)
        color = adjustSaturation(color, 0.0);
    } else {
        if (mode == 0) {
            // Saturation Mode
            // UI: -100(gray) ~ 0(normal) ~ 100(double)
            // GLSL: 0.0 ~ 1.0 ~ 2.0
            float s = (saturation + 100.0) / 100.0;
            color = adjustSaturation(color, s);
        } else if (mode == 1) {
            // Hue Mode
            color = adjustHue(color, hue);
        }
    }

    gl_FragColor = vec4(color, tex.a);
}
`;

const UISamplePlugin: PluginDefinition = {
  id: 'ui-sample1',
  name: 'UI Sample 1',
  category: 'subjects',
  parameters: [
    {
      key: 'bw',
      type: 'checkbox',
      label: 'Black & White',
      default: false
    },
    {
      key: 'mode',
      type: 'select',
      label: 'Adjustment Mode',
      options: [
        { label: 'Saturation', value: 0 },
        { label: 'Hue', value: 1 }
      ],
      default: 0
    },
    {
      key: 'saturation',
      type: 'slider',
      label: 'Saturation',
      default: 0,
      min: -100,
      max: 100,
      visibleIf: { key: 'mode', value: 0 } // modeが0(Saturation)の時だけ表示
    },
    {
      key: 'hue',
      type: 'slider',
      label: 'Hue',
      default: 0,
      min: -180,
      max: 180,
      visibleIf: { key: 'mode', value: 1 } // modeが1(Hue)の時だけ表示
    }
  ],
  fragmentShader: fragmentShader,
  getEffectRadius: () => 0
};

export default UISamplePlugin;