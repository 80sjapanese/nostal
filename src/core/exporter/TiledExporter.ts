import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { LayerInstance } from '../../types/Plugin';
import { getPlugin } from '../pluginRegistry';

export class TiledExporter {
  static async export(
    originalImage: HTMLImageElement,
    layers: LayerInstance[]
  ): Promise<Blob> {
    const fullWidth = originalImage.naturalWidth;
    const fullHeight = originalImage.naturalHeight;

    // 1. Padding計算
    let maxPadding = 0;
    const baseScale = Math.max(fullWidth, fullHeight) / 1080;

    layers.forEach(layer => {
      const plugin = getPlugin(layer.pluginId);
      if (plugin && plugin.getEffectRadius) {
        const radius = plugin.getEffectRadius(layer.params, baseScale);
        if (radius > maxPadding) maxPadding = radius;
      }
    });
    maxPadding = Math.ceil(maxPadding);

    // 2. タイル設定
    // 4096px などの大きなサイズでも良いが、安全のため 2048px 程度で分割
    const tileSize = 2048; 
    const cols = Math.ceil(fullWidth / tileSize);
    const rows = Math.ceil(fullHeight / tileSize);

    // 3. 出力用Canvas
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = fullWidth;
    outputCanvas.height = fullHeight;
    const ctx = outputCanvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create export context');

    // 4. WebGL準備
    // タイル + パディング分のサイズを確保できるだけのバッファ
    const maxRenderSize = tileSize + (maxPadding * 2);
    
    const glCanvas = document.createElement('canvas');
    glCanvas.width = maxRenderSize;
    glCanvas.height = maxRenderSize;
    
    const renderer = new THREE.WebGLRenderer({ 
        canvas: glCanvas, 
        antialias: false, 
        alpha: true,
        preserveDrawingBuffer: true 
    });
    renderer.setSize(maxRenderSize, maxRenderSize); // 初期サイズ（ループ内で変えても良い）
    
    // テクスチャ作成
    const texture = new THREE.Texture(originalImage);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    // エッジの処理: ClampToEdgeWrapping (デフォルト) により、
    // 画像外を参照しようとすると端の色が伸びる（パディングとして正しい挙動）
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;

    // シーンセットアップ
    const scene = new THREE.Scene();

    // 【重要】 Planeを画像の物理サイズに合わせて配置
    // 中心を (0,0) とし、幅W、高さHの板を置く
    const planeGeo = new THREE.PlaneGeometry(fullWidth, fullHeight);
    const planeMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const baseMesh = new THREE.Mesh(planeGeo, planeMat);
    scene.add(baseMesh);

    // カメラ設定
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    camera.position.z = 1;

    // Composer
    const composer = new EffectComposer(renderer);

    // Layer Passes
    const passes: ShaderPass[] = [];
    
    // Base Pass
    const basePass = new RenderPass(scene, camera);
    composer.addPass(basePass);

    // Effect Passes (先に生成しておく)
    layers.forEach(layer => {
        if (!layer.visible) return;
        const plugin = getPlugin(layer.pluginId);
        if (!plugin) return;
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                ...this.createUniforms(plugin, layer.params)
            },
            vertexShader: `
                varying vec2 vUv;
                void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
            `,
            fragmentShader: plugin.fragmentShader,
            transparent: true
        });
        passes.push(new ShaderPass(material));
    });
    passes.forEach(p => composer.addPass(p));

    // 5. タイリングループ
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const tileX = x * tileSize;
            const tileY = y * tileSize;
            const currentTileW = Math.min(tileSize, fullWidth - tileX);
            const currentTileH = Math.min(tileSize, fullHeight - tileY);

            // 必要なレンダリング範囲（パディング込み）
            // 画像座標系: 左上が(0,0)、右がX+、下がY+
            const renderX = tileX - maxPadding;
            const renderY = tileY - maxPadding;
            const renderW = currentTileW + (maxPadding * 2);
            const renderH = currentTileH + (maxPadding * 2);

            // バッファサイズを変更
            renderer.setSize(renderW, renderH);
            composer.setSize(renderW, renderH);

            // 【重要】 カメラを移動させて「パディング込みの範囲」だけを映す
            // Three.jsの座標系: 中心(0,0)、右がX+、上がY+
            // 画像座標(ix, iy) -> World座標(wx, wy) への変換
            // WX = ix - (fullWidth / 2) + (renderW / 2)  <-- 中心座標
            
            // レンダリングしたい矩形の中心座標（画像空間）
            const centerX_img = renderX + (renderW / 2);
            const centerY_img = renderY + (renderH / 2);

            // World空間に変換 (Y軸は反転)
            const worldX = centerX_img - (fullWidth / 2);
            const worldY = (fullHeight / 2) - centerY_img;

            // カメラ位置セット
            camera.position.set(worldX, worldY, 1);
            
            // カメラの画角設定 (Orthographic)
            // 中心から左右上下への距離
            camera.left = -renderW / 2;
            camera.right = renderW / 2;
            camera.top = renderH / 2;
            camera.bottom = -renderH / 2;
            camera.updateProjectionMatrix();

            // レンダリング
            composer.render();

            // Canvasへの転写
            // WebGLのバッファ全体(renderW, renderH)から、
            // 中心の(currentTileW, currentTileH)部分だけを取り出す
            
            // WebGLは下から上に向かって描画されるが、
            // カメラのWorldY変換で反転させているため、正立してレンダリングされているはず。
            // ただし、gl.readPixelsなどは左下が原点。
            // ctx.drawImage(canvas) は左上が原点。
            // Three.jsのレンダリング結果(canvas)は、DOM上では正立して見える状態。
            
            // 必要なデータは、バッファの中心にある。
            // バッファ内のオフセット
            const srcX = maxPadding;
            const srcY = maxPadding; // 上から見てpadding分降りたところ

            ctx.drawImage(
                glCanvas,
                srcX, srcY,              // ソースの切り出し開始位置
                currentTileW, currentTileH,
                tileX, tileY,            // 貼り付け先
                currentTileW, currentTileH
            );
        }
    }
    
    // 後始末
    renderer.dispose();
    texture.dispose();
    passes.forEach(p => p.dispose());
    
    return new Promise((resolve) => {
        outputCanvas.toBlob(blob => {
            if (blob) resolve(blob);
        }, 'image/png');
    });
  }

  private static createUniforms(plugin: any, params: Record<string, number>) {
    const uniforms: Record<string, { value: any }> = {};
    plugin.parameters.forEach((p: any) => {
        const val = params[p.key] ?? p.default;
        uniforms[p.key] = { value: val };
    });
    return uniforms;
  }
}