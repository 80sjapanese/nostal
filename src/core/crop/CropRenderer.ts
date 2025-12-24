import * as THREE from 'three';
import type { CropState } from '../../types/Crop';

export class CropRenderer {
  static renderPreview(image: HTMLImageElement, state: CropState, targetMaxDim = 1024): string {
    const width = state.boxWidth;
    const height = state.boxHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      -width / 2, width / 2,
      height / 2, -height / 2,
      0.1, 1000
    );
    camera.position.z = 10;

    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    const geometry = new THREE.PlaneGeometry(image.naturalWidth, image.naturalHeight);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);

    const baseGroup = new THREE.Group();
    baseGroup.add(mesh);
    baseGroup.rotation.z = -(state.baseRotationIndex * 90) * Math.PI / 180;
    baseGroup.scale.set(state.flipX, state.flipY, 1);

    const panScaleGroup = new THREE.Group();
    panScaleGroup.add(baseGroup);
    panScaleGroup.scale.set(state.scale, state.scale, 1);
    panScaleGroup.position.x = state.panX - state.boxOffsetX;
    panScaleGroup.position.y = -(state.panY - state.boxOffsetY);

    const smoothGroup = new THREE.Group();
    smoothGroup.add(panScaleGroup);
    smoothGroup.rotation.z = -state.smoothRotation * Math.PI / 180;

    scene.add(smoothGroup);

    // target size preserving aspect
    const aspect = width / height;
    let renderW: number, renderH: number;
    if (width > height) {
      renderW = targetMaxDim;
      renderH = targetMaxDim / aspect;
    } else {
      renderH = targetMaxDim;
      renderW = targetMaxDim * aspect;
    }

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    (renderer as any).outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setSize(Math.floor(renderW), Math.floor(renderH));
    renderer.setPixelRatio(1);

    renderer.render(scene, camera);

    const dataURL = renderer.domElement.toDataURL('image/png');

    renderer.dispose();
    geometry.dispose();
    material.dispose();
    texture.dispose();

    return dataURL;
  }
}
