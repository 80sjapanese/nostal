import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { useAppStore } from '../store/useAppStore';
import { getPlugin } from './pluginRegistry';

export class Engine {
  // Simple in-memory cache to reuse textures across undo/redo crop steps
  private static textureCache: Map<string, THREE.Texture> = new Map();
  private static imageCache: Map<string, HTMLImageElement> = new Map();
  private static readonly CACHE_LIMIT = 8;

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private imageTexture: THREE.Texture | null = null;
  private canvas: HTMLCanvasElement;
  
  private renderWidth: number = 1024;
  private renderHeight: number = 1024;

  // レイヤーIDとShaderPassの紐付け管理
  private passMap = new Map<string, ShaderPass>();
  // 前回のレイヤー構造（IDの配列）を保持して差分検知に使う
  private prevLayerStructure: string[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    
    this.renderer = new THREE.WebGLRenderer({ 
      canvas, 
      antialias: false,
      alpha: true, 
      preserveDrawingBuffer: true 
    });
    
    this.renderer.setPixelRatio(1);
    // ガンマ補正なしのリニア出力
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    this.scene = new THREE.Scene();
    
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.camera.position.set(0, 0, 1);
    this.camera.lookAt(0, 0, 0);

    this.setupSubscribers();

    const currentSrc = useAppStore.getState().imageSrc;
    if (currentSrc) {
      this.loadImage(currentSrc);
    }
  }

  private setupSubscribers() {
    // 画像変更 -> 全リビルド
    useAppStore.subscribe(state => state.imageSrc, (src) => {
      if (src) this.loadImage(src);
    });

    // レイヤー変更 -> 構造が変わったかチェックして分岐
    useAppStore.subscribe(state => state.layers, (layers) => {
      if (!this.imageTexture) return;

      const currentStructure = layers.map(l => `${l.id}-${l.visible}`);
      const isStructureChanged = !this.arraysEqual(this.prevLayerStructure, currentStructure);

      if (isStructureChanged) {
        this.rebuildPipeline();
      } else {
        this.updatePassParameters();
      }
      this.render();
    });

    // 一時パラメータ変更（ドラッグ中） -> 値だけ更新
    useAppStore.subscribe(state => state.transientParams, () => {
      if (this.imageTexture) {
        this.updatePassParameters();
        this.render();
      }
    });

    // 比較モード変更 -> 再描画（Composerをバイパスするか切り替え）
    useAppStore.subscribe(state => state.isComparing, () => {
      this.render();
    });
  }

  private arraysEqual(a: string[], b: string[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private loadImage(src: string) {
    const useCached = Engine.textureCache.get(src);
    if (useCached) {
      this.imageTexture = useCached;
      const img = Engine.imageCache.get(src)!;
      const maxDim = 1024;
      const aspect = img.naturalWidth / img.naturalHeight;
      if (img.naturalWidth > img.naturalHeight) {
        this.renderWidth = Math.min(img.naturalWidth, maxDim);
        this.renderHeight = this.renderWidth / aspect;
      } else {
        this.renderHeight = Math.min(img.naturalHeight, maxDim);
        this.renderWidth = this.renderHeight * aspect;
      }
      this.renderWidth = Math.floor(this.renderWidth);
      this.renderHeight = Math.floor(this.renderHeight);
      this.renderer.setSize(this.renderWidth, this.renderHeight);
      this.prevLayerStructure = [];
      this.rebuildPipeline();
      this.render();
      return;
    }

    // Use HTMLImageElement to reliably handle both file URLs and data URLs
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.NoColorSpace; // treat as linear to match existing pipeline
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;

      // Cache eviction (simple FIFO)
      Engine.textureCache.set(src, tex);
      Engine.imageCache.set(src, img);
      if (Engine.textureCache.size > Engine.CACHE_LIMIT) {
        const firstKey = Engine.textureCache.keys().next().value as string;
        const firstTex = Engine.textureCache.get(firstKey);
        if (firstTex) firstTex.dispose();
        Engine.textureCache.delete(firstKey);
        Engine.imageCache.delete(firstKey);
      }

      this.imageTexture = tex;

      const maxDim = 1024;
      const aspect = img.naturalWidth / img.naturalHeight;

      if (img.naturalWidth > img.naturalHeight) {
        this.renderWidth = Math.min(img.naturalWidth, maxDim);
        this.renderHeight = this.renderWidth / aspect;
      } else {
        this.renderHeight = Math.min(img.naturalHeight, maxDim);
        this.renderWidth = this.renderHeight * aspect;
      }

      this.renderWidth = Math.floor(this.renderWidth);
      this.renderHeight = Math.floor(this.renderHeight);

      this.renderer.setSize(this.renderWidth, this.renderHeight);

      this.prevLayerStructure = [];
      this.rebuildPipeline();
      this.render();
    };
    img.src = src;
  }

  private rebuildPipeline() {
    if (!this.imageTexture) return;

    // 16bit (HalfFloatType) のレンダーターゲットを使用
    const renderTarget = new THREE.WebGLRenderTarget(this.renderWidth, this.renderHeight, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false
    });
    
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.setSize(this.renderWidth, this.renderHeight);
    
    this.passMap.clear();

    // Base Pass
    const planeGeo = new THREE.PlaneGeometry(2, 2);
    const planeMat = new THREE.MeshBasicMaterial({ 
      map: this.imageTexture,
      side: THREE.DoubleSide,
      transparent: true
    });
    
    this.scene.clear();
    this.scene.add(new THREE.Mesh(planeGeo, planeMat));
    
    const basePass = new RenderPass(this.scene, this.camera);
    basePass.clear = true;
    basePass.clearAlpha = 0;
    this.composer.addPass(basePass);

    // Layer Passes
    const { layers, transientParams } = useAppStore.getState();
    
    this.prevLayerStructure = layers.map(l => `${l.id}-${l.visible}`);

    layers.forEach(layer => {
      if (!layer.visible) return;
      const plugin = getPlugin(layer.pluginId);
      if (!plugin) return;
      
      const currentParams = { ...layer.params, ...(transientParams[layer.id] || {}) };

      const material = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          ...this.createUniforms(plugin, currentParams)
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: plugin.fragmentShader,
        transparent: true
      });

      const pass = new ShaderPass(material);
      this.composer?.addPass(pass);

      this.passMap.set(layer.id, pass);
    });
  }

  private updatePassParameters() {
    const { layers, transientParams } = useAppStore.getState();

    layers.forEach(layer => {
      const pass = this.passMap.get(layer.id);
      if (!pass || !layer.visible) return;

      const plugin = getPlugin(layer.pluginId);
      if (!plugin) return;

      const currentParams = { ...layer.params, ...(transientParams[layer.id] || {}) };
      
      if (pass.material instanceof THREE.ShaderMaterial) {
        const uniforms = pass.material.uniforms;
        plugin.parameters.forEach((p: any) => {
           const val = currentParams[p.key] ?? p.default;
           if (uniforms[p.key]) {
             uniforms[p.key].value = val;
           }
        });
      }
    });
  }

  private createUniforms(plugin: any, params: Record<string, number>) {
    const uniforms: Record<string, { value: any }> = {};
    plugin.parameters.forEach((p: any) => {
        const val = params[p.key] ?? p.default;
        uniforms[p.key] = { value: val };
    });
    return uniforms;
  }

  public render() {
    // 比較モードなら Composer (エフェクト) をバイパスする
    const isComparing = useAppStore.getState().isComparing;

    if (this.composer && !isComparing) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
  
  // 【ここが重要】メモリリークを防ぐための後始末メソッド
  public dispose() {
    this.renderer.dispose();
    this.imageTexture?.dispose();
    this.passMap.clear();
    // シーン内のメッシュやマテリアルも解放するのがベスト
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (object.material instanceof THREE.Material) {
          object.material.dispose();
        }
      }
    });
  }
}