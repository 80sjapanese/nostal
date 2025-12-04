# Scalable WebGL Image Processing Architecture (Design Doc)

このプロジェクトは、Three.js をベースとした、スケーラブルかつ保守性の高い、大規模なWebブラウザ向け画像処理エンジンです。
機能の追加・削除がコアシステムに影響を与えない「マイクロカーネル・アーキテクチャ」を採用し、写真現像のプロセスに基づいて区分されたエフェクトを、ユーザーが自由に適用し、写真現像のプロセスに基づいて区分されたレイヤーにおいて順番を指定します。

## 1\. コア・アーキテクチャ (Core Principles)

### 責務の分離 (Separation of Concerns)

  * **Host (Core System)**:
      * UIの自動生成、アセットのロード、WebGLコンテキスト管理、レンダリングパイプラインの構築、ファイル書き出しを担当。
      * **具体的な画像処理ロジック（色を変えるなど）は一切持たない。**
  * **Plugin (Effects)**:
      * パラメータ定義、シェーダーコード、アセット、処理の優先度（Priority）のみを持つ。
      * **DOM操作、WebGLコンテキストへの直接アクセスは禁止。**

-----

### 技術スタック (Technology Stack)

本プロジェクトでは、Core（画像処理エンジン）と UI（操作盤）を疎結合に保つため、以下のスタックを選定しています。

  * **Language**: **TypeScript**
      * 型定義 (`.d.ts`) により、プラグインとホスト間の契約（Contract）をコンパイル時に保証するため必須。
  * **Bundler**: **Vite**
      * 静的アセット（画像/LUT）のURL解決 (`import ...?url`) や、GLSLの文字列読み込み (`import ...?raw`) をネイティブサポートしているため採用。
  * **Core Engine**: **Three.js** (Vanilla)
      * `react-three-fiber` 等のラッパーは**使用しない**。画像処理ロジックは React のライフサイクルから切り離し、純粋な TypeScript クラス (`src/core`) として管理する。
  * **UI Framework**: **React**
      * プラグイン定義配列 (`parameters`) から UI コンポーネントを動的生成 (Auto-GUI) する「宣言的UI」構築のために採用。
  * **State Management**: **Zustand**
      * **【重要】** React コンポーネント外（Core Engine）からも状態へのアクセス・購読が可能であるため採用。Redux や Context API は、Vanilla JS との連携が複雑になるため不採用。
  * **UI Components**: **Radix UI** + **Tailwind CSS**
      * アクセシビリティが確保されたヘッドレスUI (Radix) に、Tailwind で独自スタイルを当てる。スライダーのツマミやカラーピッカーなどの複雑なパーツ構築コストを下げるため。
      * Color Picker: `react-colorful`

-----

### State同期戦略：The React-WebGL Bridge

本アプリケーションの最大の技術的課題は、**「React の State 更新」と「WebGL の描画ループ」の同期**です。

  * **課題**: React のステート更新で再レンダリングを発生させると、高頻度な更新（スライダー操作など）においてパフォーマンスが著しく低下する。また、React のレンダリングサイクルと WebGL の `requestAnimationFrame` は非同期である。
  * **解決策**: **「Zustand を介した Transient Updates（一時的な更新）」** パターンを採用する。

#### データフロー (Data Flow)

1.  **UI Layer (React)**

      * ユーザーがスライダーを操作する。
      * React は再レンダリングせず、**Zustand ストアの値のみ**を更新する (`setParam`)。
      * UI 上の数値表示など、必要な箇所だけがセレクタ経由で再描画される。

2.  **The Bridge (Zustand)**

      * React (UI) と Core (Engine) の中間に位置する「唯一の真実のソース」。
      * `subscribeWithSelector` ミドルウェアを使用し、特定の値の変更を監視可能にする。

3.  **Core Layer (Three.js)**

      * Engine クラスは初期化時に Zustand ストアを購読 (`store.subscribe`) する。
      * 値の変更を検知すると、即座に該当プラグインのシェーダー `uniforms` を書き換える。
      * **React の再レンダリングを待たずに**、次の `requestAnimationFrame` で新しい値が描画される。

#### 実装パターン (Implementation Pattern)

**Store (Zustand):**

```typescript
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export const useAppStore = create(
  subscribeWithSelector((set) => ({
    params: {}, // { pluginId: { key: value } }
    setParam: (id, key, value) => set((state) => {
      // Immer等でDeep Merge推奨
      state.params[id][key] = value; 
      return { params: { ...state.params } };
    }),
  }))
);
```

**UI Component (React):**

```tsx
// スライダーを動かしても、このコンポーネント自体は再レンダリングさせない設計も可能
const handleChange = (val) => useAppStore.getState().setParam(pluginId, key, val);
```

**Core Engine (Vanilla JS):**

```typescript
import { useAppStore } from '@/store';

class Engine {
  constructor() {
    // Reactを介さず、ストアの変更を直接検知してGPUに反映させる
    useAppStore.subscribe(
      (state) => state.params,
      (newParams, oldParams) => {
         // 差分検知ロジック
         this.updateUniforms(newParams);
         this.requestRender();
      }
    );
  }
}
```

この戦略により、\*\*「React の宣言的な書きやすさ」**と**「WebGL のネイティブなパフォーマンス」\*\*を両立させます。

-----

-----

## 2\. ディレクトリ構成 (Directory Structure)

写真現像のプロセスに基づき、優先度（Priority）とディレクトリをリンクさせて管理します。

```text
src/
├── core/                    # エンジン本体 (UI非依存)
│   ├── engine.ts            # Main Loop, Context Management
│   ├── pipeline/            # EffectComposer, Snapshot System
│   └── loader/              # AssetLoader (Texture, LUT)
│
├── types/                   # 型定義 (The Contract)
│   └── Plugin.d.ts          # プラグインのインターフェース定義
│
└── plugins/                 # ビルトイン・エフェクト (Priority順)
    ├── subjects/            # 被写体・下地処理
    │   ├── exposure/
    │   │   ├── index.ts     # 定義ファイル
    │   │   └── shader.glsl  # シェーダー
    │   └── skin-tone/
    │
    ├── lens/                # 光学・レンズエフェクト
    │   ├── bloom/
    │   └── chromatic/
    │
    ├── film/                # フィルムシミュレーション
    │   ├── simulation/
    │   │   ├── index.ts
    │   │   ├── shader.glsl
    │   │   └── luts/        # アセットはフォルダ内に配置
    │   │       └── kodak.cube
    │   └── grain/           
    │
    ├── post/                # [300-399] ポストプロセス
    │   └── grading/
    │
    └── print/               # 最終出力・保護
        ├── skin-protect/    # (Snapshot利用)
        └── frame/           # 
```

-----

## 3\. プラグイン仕様 (Plugin Specification)

各エフェクトは1つのフォルダで完結し、必ず `index.ts` を持ちます。JSONファイルは使用せず、TypeScriptオブジェクトとして定義します。

### プラグイン定義オブジェクト (`index.ts`)

```typescript
import shader from './shader.glsl?raw'; // 文字列としてロード
import noiseUrl from './noise.png?url'; // URLとしてロード
import { PluginDefinition } from '@/types/Plugin';

const MyPlugin: PluginDefinition = {
  id: 'unique-id',
  name: 'エフェクト名',

  // UI自動生成のためのパラメータ定義
  parameters: [
    {
      key: 'intensity',
      type: 'slider',
      label: '強度',
      default: 0.5,
      // UI上の操作範囲 (Soft Limits)
      softMin: 0.0, softMax: 1.0,
      // 数値入力可能な絶対範囲 (Hard Limits)
      min: 0.0, max: 5.0 
    }
  ],

  // 必要なアセット (Viteによって解決されたURLを渡す)
  assets: {
    noiseMap: noiseUrl
  },

  // スナップショット機能 (後述)
  saveSnapshot: 'my_snapshot_name', // 処理結果を保存する場合
  needsSnapshot: ['base_image'],    // 過去の画像を使う場合

  // 影響範囲の計算 (タイリング書き出し用)
  getEffectRadius: (params, scale) => {
    return params.intensity * scale * 20.0;
  },

  fragmentShader: shader
};

export default MyPlugin;
```

-----

## 4\. レンダリング・パイプライン (Pipeline Logic)

### 適用順序の制御

Coreシステムは起動時に `src/plugins` 以下のすべてのプラグインを読み込み、`priority` プロパティの値に基づいて昇順にソートして適用します。

  * 数値が小さいほど先に実行されます（例：露出補正）。
  * 数値が大きいほど後に実行されます（例：フレーム枠）。

### スナップショット・システム (Snapshot / Time Travel)

「過去の処理結果」を「未来の処理」で使用する必要がある場合（ある地点の色からスキントーンを抽出し、後で適用するなど）は、以下の仕組みを採用してください。

1.  **保存 (`saveSnapshot`)**:
      * プラグインがこのキーを指定すると、そのパスの描画結果がシステム内の `RenderTargetBank` にコピーされ、指定した名前で保存されます。
2.  **利用 (`needsSnapshot`)**:
      * プラグインがこのキーを指定すると、システムはバンクからテクスチャを取り出し、自動的に `uniform sampler2D [名前];` としてシェーダーに注入します。

-----

## 5\. 解像度非依存と書き出し (Resolution & Export)

### 解像度非依存 (Resolution Independence)

プレビュー画面（低解像度）と書き出し画像（高解像度）で、エフェクトの見た目（ボケの大きさ、ノイズの粒度）を完全に一致させる必要があります。

  * **Hostの責務**:
      * 現在の処理解像度が、基準サイズ（例: 高さ1080px）に対して何倍かを示す `u_scale` を常に計算し、シェーダーに渡す。
  * **Pluginの責務**:
      * 距離やピクセルサイズを扱う際は、必ず `value * u_scale` を行う。
      * 画像テクスチャを使用する際は、アスペクト比補正を行い、`u_scale` を考慮してUV座標を調整する。

### タイリング書き出し (Tiling Export)

GPUの最大テクスチャサイズ（通常4096px〜16384px）を超える画像を書き出すための戦略です。

1.  **Padding計算**:
      * 有効な全プラグインの `getEffectRadius()` を呼び出し、必要な「のりしろ（Padding）」を算出する。
2.  **分割処理**:
      * 巨大画像をタイル状に分割し、それぞれのタイルに `Padding` を足した領域をレンダリングする。
3.  **合成**:
      * レンダリング結果の中心部分（Paddingを除いた部分）のみを切り出し、最終的なCanvasに結合する。

-----

## 6\. アセット管理 (Asset Management)

  * **配置**: アセットファイル（画像、LUT、シェーダー）は、必ずそれを使用するプラグインのフォルダ内に配置する。
  * **読み込み**: `index.ts` 内で Vite の `?url` (画像/LUT) や `?raw` (GLSL) サフィックスを使用してインポートする。
  * **禁止事項**: ソースコード内で `/public/assets/...` のような絶対パスをハードコードしてはならない。

-----

## 7\. 開発フロー (Development Workflow)

1.  **新規エフェクト作成**:
      * `src/plugins` 内の適切なカテゴリ（priority範囲）のフォルダに新規フォルダを作成。
      * `index.ts` と `shader.glsl` を作成。
2.  **実装**:
      * `index.ts` にパラメータを定義。
      * `shader.glsl` に処理を記述。
3.  **テスト**:
      * アプリを起動し、パラメータを操作してプレビューを確認。
      * `u_scale` の挙動を確認するため、ウィンドウサイズを変えたり、高解像度書き出しテストを行う。
4.  **登録**:
      * ビルトインプラグインとして自動的に読み込まれる（またはプラグインローダーに登録する）。

-----

このドキュメントは、本プロジェクトの「憲法」です。
設計に迷った際は、**「Hostはロジックを持たない」「PluginはDOMを触らない」「フォルダ単位で完結させる」** という原則に立ち返ってください。