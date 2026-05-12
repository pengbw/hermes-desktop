import * as THREE from "three";

export interface LightingConfig {
  ambientColor?: number;
  ambientIntensity?: number;
  keyColor?: number;
  keyIntensity?: number;
  keyPosition?: THREE.Vector3;
  fillColor?: number;
  fillIntensity?: number;
  fillPosition?: THREE.Vector3;
  rimColor?: number;
  rimIntensity?: number;
  rimPosition?: THREE.Vector3;
}

const DEFAULT_CONFIG: Required<LightingConfig> = {
  ambientColor: 0xffffff,
  ambientIntensity: 0.8,
  keyColor: 0xffeedd,
  keyIntensity: 1.6,
  keyPosition: new THREE.Vector3(2, 4, 3),
  fillColor: 0x8888ff,
  fillIntensity: 0.4,
  fillPosition: new THREE.Vector3(-3, 2, 1),
  rimColor: 0xffddaa,
  rimIntensity: 0.3,
  rimPosition: new THREE.Vector3(0, 2, -3),
};

export class LightingSetup {
  ambient: THREE.AmbientLight;
  key: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;

  constructor(scene: THREE.Scene, config: LightingConfig = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    this.ambient = new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity);
    this.key = new THREE.DirectionalLight(cfg.keyColor, cfg.keyIntensity);
    this.key.position.copy(cfg.keyPosition);
    this.fill = new THREE.DirectionalLight(cfg.fillColor, cfg.fillIntensity);
    this.fill.position.copy(cfg.fillPosition);
    this.rim = new THREE.DirectionalLight(cfg.rimColor, cfg.rimIntensity);
    this.rim.position.copy(cfg.rimPosition);

    scene.add(this.ambient, this.key, this.fill, this.rim);
  }

  setKeyIntensity(intensity: number) {
    this.key.intensity = intensity;
  }

  setAmbientIntensity(intensity: number) {
    this.ambient.intensity = intensity;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.ambient, this.key, this.fill, this.rim);
  }
}
