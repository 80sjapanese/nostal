import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { useAppStore } from '../store/useAppStore';
import { getPlugin } from './pluginRegistry';
import { LayerInstance, PluginDefinition } from '../types/Plugin';

export class Engine {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private imageTexture: THREE.Texture | null = null;
  private canvas: HTMLCanvasElement;
  private layerPasses = new Map<string, ShaderPass>();
  
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

    useAppStore.subscribe(
      (state) => state.layers,
      (layers, prevLayers) => {
        if (!this.imageTexture) return;

        if (!this.composer || this.needsPipelineRebuild(layers, prevLayers)) {
          this.rebuildPipeline();
        } else {
          this.updateLayerUniforms(layers);
        }

        this.render();
      }
    );

    useAppStore.subscribe(
      (state) => state.transientParams,
      () => {
        if (!this.imageTexture || !this.composer) return;
        this.updateLayerUniforms(useAppStore.getState().layers);
        this.render();
      }
    );
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

    this.layerPasses.clear();
    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(this.renderWidth, this.renderHeight);
    
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
    const { layers } = useAppStore.getState();
    
    layers.forEach(layer => {
      if (!layer.visible) return;
      const plugin = getPlugin(layer.pluginId);
      if (!plugin) return;
      
      const resolvedParams = this.resolveLayerParams(layer, plugin);

      const material = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          ...this.createUniforms(plugin, resolvedParams)
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
      this.layerPasses.set(layer.id, pass);
    });
  }

  private createUniforms(plugin: PluginDefinition, params: Record<string, any>) {
    const uniforms: Record<string, { value: any }> = {};
    plugin.parameters.forEach((param) => {
      const val = params[param.key] ?? (param as any).default;
      uniforms[param.key] = { value: val };
    });
    return uniforms;
  }

  private resolveLayerParams(layer: LayerInstance, plugin: PluginDefinition) {
    const { transientParams } = useAppStore.getState();
    const pending = transientParams[layer.id] || {};
    const combined = { ...layer.params, ...pending };
    const resolved: Record<string, any> = {};

    plugin.parameters.forEach((param) => {
      const value = combined[param.key];
      if (value !== undefined) {
        resolved[param.key] = value;
      } else if ('default' in param) {
        resolved[param.key] = (param as any).default;
      }
    });

    return resolved;
  }

  private needsPipelineRebuild(nextLayers: LayerInstance[], prevLayers?: LayerInstance[]) {
    if (!prevLayers || nextLayers.length !== prevLayers.length) return true;

    for (let i = 0; i < nextLayers.length; i += 1) {
      const next = nextLayers[i];
      const prev = prevLayers[i];
      if (!prev) return true;
      if (next.id !== prev.id) return true;
      if (next.pluginId !== prev.pluginId) return true;
      if (next.visible !== prev.visible) return true;
    }

    return false;
  }

  private updateLayerUniforms(layers: LayerInstance[]) {
    layers.forEach((layer) => {
      const pass = this.layerPasses.get(layer.id);
      if (!pass) return;

      const plugin = getPlugin(layer.pluginId);
      if (!plugin) return;

      const resolvedParams = this.resolveLayerParams(layer, plugin);
      plugin.parameters.forEach((param) => {
        const uniform = pass.uniforms[param.key];
        if (uniform) {
          uniform.value = resolvedParams[param.key] ?? (param as any).default;
        }
      });
    });
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