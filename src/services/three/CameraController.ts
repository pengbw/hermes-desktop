import * as THREE from "three";

export interface CameraControllerOptions {
  camera: THREE.PerspectiveCamera;
  defaultPosition?: THREE.Vector3;
  defaultLookAt?: THREE.Vector3;
  mouseSensitivityX?: number;
  mouseSensitivityY?: number;
}

export class CameraController {
  camera: THREE.PerspectiveCamera;
  private defaultPosition: THREE.Vector3;
  private defaultLookAt: THREE.Vector3;
  private mouseSensitivityX: number;
  private mouseSensitivityY: number;
  private mouseX = 0;
  private mouseY = 0;

  constructor(options: CameraControllerOptions) {
    const {
      camera,
      defaultPosition = new THREE.Vector3(0, 1.0, 2.8),
      defaultLookAt = new THREE.Vector3(0, 0.8, 0),
      mouseSensitivityX = 0.35,
      mouseSensitivityY = 0.2,
    } = options;

    this.camera = camera;
    this.defaultPosition = defaultPosition;
    this.defaultLookAt = defaultLookAt;
    this.mouseSensitivityX = mouseSensitivityX;
    this.mouseSensitivityY = mouseSensitivityY;

    this.camera.position.copy(this.defaultPosition);
    this.camera.lookAt(this.defaultLookAt);
  }

  setMousePosition(normalizedX: number, normalizedY: number) {
    this.mouseX = normalizedX;
    this.mouseY = normalizedY;
  }

  getMouseRotation(): { rotX: number; rotY: number } {
    return {
      rotX: -this.mouseY * this.mouseSensitivityY,
      rotY: this.mouseX * this.mouseSensitivityX,
    };
  }

  reset() {
    this.camera.position.copy(this.defaultPosition);
    this.camera.lookAt(this.defaultLookAt);
    this.mouseX = 0;
    this.mouseY = 0;
  }

  updateAspect(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
