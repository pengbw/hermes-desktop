import * as THREE from "three";
import { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

export interface GestureData {
  name: string;
  target: Record<string, { x: number; y: number; z: number; w: number }>;
  lookAt?: { x: number; y: number };
  tilt?: number;
  duration: number;
  greeting?: boolean;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function slerpPose(
  base: { x: number; y: number; z: number; w: number },
  target: { x: number; y: number; z: number; w: number },
  t: number
) {
  const qa = new THREE.Quaternion(base.x, base.y, base.z, base.w);
  const qb = new THREE.Quaternion(target.x, target.y, target.z, target.w);
  const result = new THREE.Quaternion().slerpQuaternions(qa, qb, t);
  return { x: result.x, y: result.y, z: result.z, w: result.w };
}

export function getHumanoidBone(vrm: VRM, boneName: VRMHumanBoneName): THREE.Object3D | null {
  try {
    if (vrm.humanoid) {
      const node = vrm.humanoid.getNormalizedBoneNode(boneName);
      if (node) return node;
    }
  } catch {}
  return null;
}

export function findBoneInScene(vrm: VRM, namePart: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  vrm.scene.traverse((obj: THREE.Object3D) => {
    if (
      !found &&
      (obj as unknown as { isBone: boolean }).isBone &&
      obj.name.toLowerCase().includes(namePart.toLowerCase())
    ) {
      found = obj;
    }
  });
  return found;
}

export function setBoneRotation(
  bone: THREE.Object3D | null,
  rot: { x: number; y: number; z: number; w: number }
) {
  if (bone) bone.quaternion.set(rot.x, rot.y, rot.z, rot.w);
}

export function applyGestureSlerp(
  bones: Record<string, THREE.Object3D | null>,
  target: Record<string, { x: number; y: number; z: number; w: number }>,
  silentTarget: Record<string, { x: number; y: number; z: number; w: number }>,
  t: number
) {
  const allKeys = new Set([...Object.keys(silentTarget), ...Object.keys(target)]);
  for (const key of allKeys) {
    const restRot = silentTarget[key] || { x: 0, y: 0, z: 0, w: 1 };
    const targetRot = target[key] || restRot;
    setBoneRotation(bones[key], slerpPose(restRot, targetRot, t));
  }
}

export function initBones(vrm: VRM): Record<string, THREE.Object3D | null> {
  const bones: Record<string, THREE.Object3D | null> = {};
  const boneMap: Record<string, VRMHumanBoneName> = {
    hips: VRMHumanBoneName.Hips,
    spine: VRMHumanBoneName.Spine,
    chest: VRMHumanBoneName.Chest,
    upperChest: VRMHumanBoneName.UpperChest,
    neck: VRMHumanBoneName.Neck,
    head: VRMHumanBoneName.Head,
    leftEye: VRMHumanBoneName.LeftEye,
    rightEye: VRMHumanBoneName.RightEye,
    leftUpperLeg: VRMHumanBoneName.LeftUpperLeg,
    leftLowerLeg: VRMHumanBoneName.LeftLowerLeg,
    leftFoot: VRMHumanBoneName.LeftFoot,
    leftToes: VRMHumanBoneName.LeftToes,
    rightUpperLeg: VRMHumanBoneName.RightUpperLeg,
    rightLowerLeg: VRMHumanBoneName.RightLowerLeg,
    rightFoot: VRMHumanBoneName.RightFoot,
    rightToes: VRMHumanBoneName.RightToes,
    leftShoulder: VRMHumanBoneName.LeftShoulder,
    leftUpperArm: VRMHumanBoneName.LeftUpperArm,
    leftLowerArm: VRMHumanBoneName.LeftLowerArm,
    leftHand: VRMHumanBoneName.LeftHand,
    rightShoulder: VRMHumanBoneName.RightShoulder,
    rightUpperArm: VRMHumanBoneName.RightUpperArm,
    rightLowerArm: VRMHumanBoneName.RightLowerArm,
    rightHand: VRMHumanBoneName.RightHand,
    leftThumbMetacarpal: VRMHumanBoneName.LeftThumbMetacarpal,
    leftThumbProximal: VRMHumanBoneName.LeftThumbProximal,
    leftThumbDistal: VRMHumanBoneName.LeftThumbDistal,
    leftIndexProximal: VRMHumanBoneName.LeftIndexProximal,
    leftIndexIntermediate: VRMHumanBoneName.LeftIndexIntermediate,
    leftIndexDistal: VRMHumanBoneName.LeftIndexDistal,
    leftMiddleProximal: VRMHumanBoneName.LeftMiddleProximal,
    leftMiddleIntermediate: VRMHumanBoneName.LeftMiddleIntermediate,
    leftMiddleDistal: VRMHumanBoneName.LeftMiddleDistal,
    leftRingProximal: VRMHumanBoneName.LeftRingProximal,
    leftRingIntermediate: VRMHumanBoneName.LeftRingIntermediate,
    leftRingDistal: VRMHumanBoneName.LeftRingDistal,
    leftLittleProximal: VRMHumanBoneName.LeftLittleProximal,
    leftLittleIntermediate: VRMHumanBoneName.LeftLittleIntermediate,
    leftLittleDistal: VRMHumanBoneName.LeftLittleDistal,
    rightThumbMetacarpal: VRMHumanBoneName.RightThumbMetacarpal,
    rightThumbProximal: VRMHumanBoneName.RightThumbProximal,
    rightThumbDistal: VRMHumanBoneName.RightThumbDistal,
    rightIndexProximal: VRMHumanBoneName.RightIndexProximal,
    rightIndexIntermediate: VRMHumanBoneName.RightIndexIntermediate,
    rightIndexDistal: VRMHumanBoneName.RightIndexDistal,
    rightMiddleProximal: VRMHumanBoneName.RightMiddleProximal,
    rightMiddleIntermediate: VRMHumanBoneName.RightMiddleIntermediate,
    rightMiddleDistal: VRMHumanBoneName.RightMiddleDistal,
    rightRingProximal: VRMHumanBoneName.RightRingProximal,
    rightRingIntermediate: VRMHumanBoneName.RightRingIntermediate,
    rightRingDistal: VRMHumanBoneName.RightRingDistal,
    rightLittleProximal: VRMHumanBoneName.RightLittleProximal,
    rightLittleIntermediate: VRMHumanBoneName.RightLittleIntermediate,
    rightLittleDistal: VRMHumanBoneName.RightLittleDistal,
  };
  for (const [key, boneName] of Object.entries(boneMap)) {
    bones[key] = getHumanoidBone(vrm, boneName);
  }
  bones.head = bones.head || findBoneInScene(vrm, "Head");
  bones.leftUpperArm = bones.leftUpperArm || findBoneInScene(vrm, "LeftArm");
  bones.rightUpperArm = bones.rightUpperArm || findBoneInScene(vrm, "RightArm");
  bones.leftLowerArm = bones.leftLowerArm || findBoneInScene(vrm, "LeftForeArm");
  bones.rightLowerArm = bones.rightLowerArm || findBoneInScene(vrm, "RightForeArm");
  bones.leftHand = bones.leftHand || findBoneInScene(vrm, "J_Bip_L_Hand");
  bones.rightHand = bones.rightHand || findBoneInScene(vrm, "J_Bip_R_Hand");
  return bones;
}

export function removeAccessoryObjects(vrm: VRM) {
  const toRemove: THREE.Object3D[] = [];
  vrm.scene.traverse((obj: THREE.Object3D) => {
    if (
      (obj as unknown as { isBone: boolean }).isBone ||
      obj.type === "Scene" ||
      obj.type === "Group" ||
      obj.type === "Object3D"
    )
      return;
    const n = obj.name.toLowerCase();
    if (
      /^(email|mail|icon|button|badge|chat|social|notify|talk|bell|home|gear|tool|star|heart|like|share|msg|call|phone|mess|notif|alarm)/.test(
        n
      )
    ) {
      toRemove.push(obj);
    }
  });
  for (const obj of toRemove) {
    obj.parent?.remove(obj);
  }
}

export function parseGesturesFromDb(
  gestures: Array<{
    name: string;
    duration: number;
    lookAtX: number;
    lookAtY: number;
    tilt: number;
    targetJson: string;
  }>
): GestureData[] {
  return gestures.map((g) => {
    const rawTarget = JSON.parse(g.targetJson || "{}");
    const target: Record<string, { x: number; y: number; z: number; w: number }> = {};
    for (const [boneName, boneData] of Object.entries(rawTarget)) {
      const v = boneData as { rotation?: number[]; x?: number; y?: number; z?: number; w?: number };
      if (v && Array.isArray(v.rotation) && v.rotation.length === 4) {
        target[boneName] = {
          x: v.rotation[0],
          y: v.rotation[1],
          z: v.rotation[2],
          w: v.rotation[3],
        };
      } else if (v && typeof v.w === "number") {
        target[boneName] = { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0, w: v.w };
      }
    }
    return {
      name: g.name,
      duration: g.duration,
      lookAt: { x: g.lookAtX, y: g.lookAtY },
      tilt: g.tilt,
      target,
      greeting: g.name === "greeting" ? true : undefined,
    };
  });
}

export function applyExpression(
  vrm:
    | (VRM & {
        blendShapeProxy?: {
          getValue: (name: string) => number | null;
          setValue: (name: string, value: number) => void;
        };
      })
    | null,
  name: string,
  val: number,
  duration?: number,
  onReset?: () => void
) {
  try {
    if (!vrm) return;

    const hasVRM1 = !!vrm.expressionManager;
    const hasVRM0 = !!vrm.blendShapeProxy;

    const expressionMap: Record<string, string> = {
      happy: hasVRM1 ? "happy" : "Joy",
      fun: hasVRM1 ? "fun" : "Fun",
      angry: hasVRM1 ? "angry" : "Angry",
      sad: hasVRM1 ? "sad" : "Sorrow",
      surprised: hasVRM1 ? "surprised" : "Surprise",
      neutral: hasVRM1 ? "neutral" : "Joy",
      aa: hasVRM1 ? "aa" : "A",
      winkLeft: hasVRM1 ? "blinkLeft" : "Blink_L",
    };

    const mappedName = expressionMap[name] || name;

    if (hasVRM1 && vrm.expressionManager) {
      const expr = vrm.expressionManager.getExpression(mappedName);
      if (expr) {
        (expr as unknown as { value: number }).value = Math.min(1, Math.max(0, val));
      }
    } else if (hasVRM0 && vrm.blendShapeProxy) {
      const cur = vrm.blendShapeProxy.getValue(mappedName) ?? 0;
      vrm.blendShapeProxy.setValue(mappedName, lerp(cur, val, 0.3));
    }

    if (duration && onReset) {
      setTimeout(onReset, duration);
    }
  } catch (err) {
    console.warn("[Avatar] Expression failed:", err);
  }
}
