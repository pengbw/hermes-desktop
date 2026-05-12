import * as THREE from "three";
import { SceneManager } from "./SceneManager";

export type RenderCallback = (delta: number, elapsed: number, now: number) => void;

export class RenderLoop {
  private sceneManager: SceneManager;
  private clock: THREE.Clock;
  private animId = 0;
  private running = false;
  private callbacks: RenderCallback[] = [];
  private lastFrameTime = 0;

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
    this.clock = new THREE.Clock();
    this.lastFrameTime = performance.now();
  }

  addCallback(cb: RenderCallback) {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter((c) => c !== cb);
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.lastFrameTime = performance.now();
    this.tick();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animId);
  }

  private tick = () => {
    if (!this.running) return;
    this.animId = requestAnimationFrame(this.tick);

    const now = performance.now();
    const delta = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;
    const elapsed = this.clock.elapsedTime;

    for (const cb of this.callbacks) {
      cb(delta, elapsed, now);
    }

    this.sceneManager.render();
  };

  dispose() {
    this.stop();
    this.callbacks = [];
  }
}
