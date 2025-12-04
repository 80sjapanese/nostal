import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { useAppStore } from '../store/useAppStore';
import { getPlugin } from './pluginRegistry';

export class Engine {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private imageTexture: THREE.Texture | null = null;
  private canvas: HTMLCanvasElement;
  private passes: Map<string, ShaderPass> = new Map();
  
  private renderWidth: number = 1024;
  private renderHeight: number = 1024;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    
    this.renderer = new THREE.WebGLRenderer({ 
      canvas, 
      antialias: false,
      alpha: true, 
      preserveDrawingBuffer: true 
    });
    
    this.renderer.setPixelRatio(1);
    
    // 【修正1】エラー回避のため NoColorSpace ではなく LinearSRGBColorSpace を使用
    // これにより自動的なガンマ補正(sRGBEncoding)が無効化され、値がそのまま出力されます
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
    useAppStore.subscribe(state => state.imageSrc, (src) => {
      if (src) this.loadImage(src);
    });

    // パイプライン構造の変更（レイヤー追加・削除・並び替え・可視性）時のみ再構築
    useAppStore.subscribe(
      state => state.layers, 
      () => {
        if (this.imageTexture) {
          this.rebuildPipeline();
          this.render();
        }
      },
      // equalityFn: レイヤーのID、順序、可視性が変わった場合のみ通知
      { equalityFn: (a, b) => a.length === b.length && a.every((v, i) => v.id === b[i].id && v.visible === b[i].visible) }
    );

    // パラメータ変更時は uniform のみを更新
    useAppStore.subscribe(state => state.transientParams, () => {
      if (this.imageTexture) {
        this.updateUniforms();
        this.render();
      }
    });
  }

  private loadImage(src: string) {
    const loader = new THREE.TextureLoader();
    
    loader.load(src, (tex) => {
      if (this.imageTexture) this.imageTexture.dispose();

      this.imageTexture = tex;
      
      // 【修正2】テクスチャ側も NoColorSpace (または LinearSRGBColorSpace) に設定
      // "NoColorSpace" でエラーが出る場合は "LinearSRGBColorSpace" にしてください
      // ここでは念のため NoColorSpace のままにしますが、もし同様のエラーが出るなら変更してください
      tex.colorSpace = THREE.NoColorSpace; 
      
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false; 

      const maxDim = 1024;
      const aspect = tex.image.width / tex.image.height;
      
      if (tex.image.width > tex.image.height) {
        this.renderWidth = Math.min(tex.image.width, maxDim);
        this.renderHeight = this.renderWidth / aspect;
      } else {
        this.renderHeight = Math.min(tex.image.height, maxDim);
        this.renderWidth = this.renderHeight * aspect;
      }

      this.renderWidth = Math.floor(this.renderWidth);
      this.renderHeight = Math.floor(this.renderHeight);

      this.renderer.setSize(this.renderWidth, this.renderHeight);
      
      this.rebuildPipeline();
      this.render();
    });
  }

  private rebuildPipeline() {
    if (!this.imageTexture) return;

    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(this.renderWidth, this.renderHeight);
    this.passes.clear(); // Passのキャッシュをクリア
    
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
      this.passes.set(layer.id, pass); // 生成したPassをIDと紐付けてキャッシュ
    });
  }

  // パラメータ変更時にUniformの値だけを効率的に更新する
  private updateUniforms() {
    const { layers, transientParams } = useAppStore.getState();
    
    layers.forEach(layer => {
      const pass = this.passes.get(layer.id);
      if (!pass || !layer.visible) return;

      const plugin = getPlugin(layer.pluginId);
      if (!plugin) return;

      const currentParams = { ...layer.params, ...(transientParams[layer.id] || {}) };
      
      plugin.parameters.forEach((p: any) => {
        const uniform = pass.material.uniforms[p.key];
        if (uniform) {
          uniform.value = currentParams[p.key] ?? p.default;
        }
      });
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
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
  
  public dispose() {
    this.renderer.dispose();
    this.imageTexture?.dispose();
  }
}