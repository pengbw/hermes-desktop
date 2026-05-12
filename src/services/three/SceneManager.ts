import * as THREE from "three";

export interface SceneManagerOptions {
  canvas: HTMLCanvasElement;
  width?: number;
  height?: number;
  alpha?: boolean;
  antialias?: boolean;
  pixelRatio?: number;
  clearColor?: number;
  clearAlpha?: number;
  shadowMap?: boolean;
}

export class SceneManager {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  private disposed = false;

  constructor(options: SceneManagerOptions) {
    const {
      canvas,
      width = 350,
      height = 500,
      alpha = true,
      antialias = true,
      pixelRatio,
      clearColor = 0x000000,
      clearAlpha = 0,
      shadowMap = true,
    } = options;

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha, antialias });
    this.renderer.setPixelRatio(pixelRatio ?? Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(clearColor, clearAlpha);
    this.renderer.shadowMap.enabled = shadowMap;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    this.camera.position.set(0, 1.0, 2.8);
    this.camera.lookAt(0, 0.8, 0);
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render() {
    if (!this.disposed) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  add(...objects: THREE.Object3D[]) {
    objects.forEach((obj) => this.scene.add(obj));
  }

  remove(...objects: THREE.Object3D[]) {
    objects.forEach((obj) => this.scene.remove(obj));
  }

  dispose() {
    this.disposed = true;
    try {
      this.renderer.dispose();
    } catch {}
  }
}
