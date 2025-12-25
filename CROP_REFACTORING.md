# クロップ機能のリファクタリング

## 概要

クロップ機能を保守性の高い構造に再編成しました。

## 変更内容

### 1. 型定義の統一 (`src/types/Crop.ts`)

**変更前:**
- `CropState` のみ定義
- UI固有の状態が別の場所で定義され、重複していた

**変更後:**
```typescript
export interface CropState {
  // コア状態（ストアに保存される）
  scale, panX, panY, rotation, etc.
}

export interface CropperUIState extends CropState {
  // UI専用の一時的な状態
  isDraggingImage, isResizingBox, etc.
}
```

### 2. ロジックの分離

**変更前:**
- `ImageCropper.tsx`: 1018行の巨大なコンポーネント
- すべてのロジックとUIが混在

**変更後:**

#### カスタムフック (`src/ui/hooks/`)

- **`useCropState.ts`** (107行)
  - クロップ状態の初期化と管理
  - ヘルパー関数: `getBoxCorners()`, `getRequiredScale()`

- **`useCropInteraction.ts`** (93行)
  - マウスインタラクション処理
  - ドラッグ、リサイズのイベントハンドリング

- **`useCropLogic.ts`** (177行)
  - ビジネスロジック: `calculateResize()`, `clampPan()`, `animateReset()`
  - 計算とアニメーション処理

#### ユーティリティ (`src/core/crop/`)

- **`cropUtils.ts`** (96行)
  - Three.jsレンダリングのコア関数
  - `createCropScene()`: シーン構築
  - `renderCropPreview()`: プレビュー生成

- **`CropRenderer.ts`** (13行)
  - 後方互換性のためのラッパークラス
  - 新しいコードでは `cropUtils.ts` を直接使用推奨

#### コンポーネント (`src/ui/components/`)

- **`ImageCropper.tsx`** (約600行 → 約600行だが、より整理された構造)
  - メインコンポーネント
  - サブコンポーネント:
    - `CropBox`: クロップボックスとハンドル
    - `CropToolbar`: コントロールパネル

## 利点

### 1. 保守性の向上
- 各ファイルが単一責任を持つ
- 機能ごとに明確に分離

### 2. テスト容易性
- ロジックがフックとして独立
- UIなしでテスト可能

### 3. 再利用性
- カスタムフックを他のコンポーネントでも使用可能
- `cropUtils`は汎用的なユーティリティとして機能

### 4. 型安全性
- `CropState`と`CropperUIState`の明確な区別
- TypeScriptの型推論が効果的に働く

## ファイル構造

```
src/
├── types/
│   └── Crop.ts                    # 型定義（統一）
├── core/
│   └── crop/
│       ├── cropUtils.ts          # レンダリングユーティリティ（新規）
│       └── CropRenderer.ts       # 後方互換ラッパー（更新）
└── ui/
    ├── hooks/
    │   ├── useCropState.ts       # 状態管理（新規）
    │   ├── useCropInteraction.ts # インタラクション（新規）
    │   └── useCropLogic.ts       # ビジネスロジック（新規）
    └── components/
        └── ImageCropper.tsx      # メインコンポーネント（リファクタリング済み）
```

## マイグレーションガイド

### CropRendererを使用している場合

**変更前:**
```typescript
import { CropRenderer } from '../../core/crop/CropRenderer';
const dataURL = CropRenderer.renderPreview(image, state);
```

**変更後（推奨）:**
```typescript
import { renderCropPreview } from '../../core/crop/cropUtils';
const dataURL = renderCropPreview(image, state);
```

**注:** `CropRenderer`は後方互換性のために残されていますが、新しいコードでは`cropUtils`を直接使用してください。

## 今後の拡張性

この新しい構造により、以下のような機能追加が容易になります:

1. **複数のクロップモード**
   - `useCropState`に新しいモードを追加
   
2. **プリセット機能**
   - `useCropLogic`にプリセット関連の関数を追加

3. **ジェスチャーサポート**
   - `useCropInteraction`にタッチイベントを追加

4. **カスタムアニメーション**
   - `animateReset`を拡張または新しいアニメーション関数を追加
