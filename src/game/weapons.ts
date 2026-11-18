import * as THREE from 'three';
import type { WeaponSpec } from '../types/game';

/**
 * Calibrated weapon specs:
 * - Fixes backwards-facing GLB/buffer models (DesertEagle, G36C, MP5 face +Z in raw asset -> yawOffset = Math.PI so all barrels face -Z)
 * - Snappy, minimal arcade recoil with fast recovery for responsive aiming
 * - Calibrated ADS sight alignment, muzzle flash anchor, and two-hand grip targets
 */
export const WEAPON_SPECS: WeaponSpec[] = [
  {
    id: 'AK47',
    name: 'AK-47',
    category: 'Rifle',
    damage: 28,
    rpm: 600,
    mag: 30,
    reloadTime: 2.0,
    spread: 0.016,
    adsSpreadMul: 0.28,
    auto: true,
    recoilPitch: 0.009,
    recoilYaw: 0.0025,
    recoilRecovery: 19,
    vmKickZ: 0.026,
    vmKickRot: 0.032,
    soundType: 0,
    yawOffset: 0,
    vmScale: 1.0,
    hipPos: [0.21, -0.19, -0.52],
    adsPos: [0.0, -0.118, -0.39],
    muzzleLocal: [0.0, 0.088, -0.44],
    rightHandLocal: [0.0, -0.025, 0.06],
    leftHandLocal: [-0.01, 0.022, -0.19],
    isPistol: false,
  },
  {
    id: 'DesertEagle',
    name: 'Desert Eagle',
    category: 'Pistol',
    damage: 55,
    rpm: 280,
    mag: 7,
    reloadTime: 1.75,
    spread: 0.008,
    adsSpreadMul: 0.2,
    auto: false,
    recoilPitch: 0.015,
    recoilYaw: 0.0018,
    recoilRecovery: 18,
    vmKickZ: 0.034,
    vmKickRot: 0.055,
    soundType: 1,
    yawOffset: Math.PI, // Raw mesh barrel points +Z -> rotate 180 deg to face -Z
    vmScale: 0.95,
    hipPos: [0.2, -0.175, -0.46],
    adsPos: [0.0, -0.118, -0.36],
    muzzleLocal: [0.0, 0.085, -0.22],
    rightHandLocal: [0.0, -0.03, 0.11],
    leftHandLocal: [-0.012, -0.045, 0.105],
    isPistol: true,
  },
  {
    id: 'G36C',
    name: 'G36C',
    category: 'Rifle',
    damage: 24,
    rpm: 750,
    mag: 30,
    reloadTime: 1.85,
    spread: 0.013,
    adsSpreadMul: 0.25,
    auto: true,
    recoilPitch: 0.007,
    recoilYaw: 0.0018,
    recoilRecovery: 20,
    vmKickZ: 0.022,
    vmKickRot: 0.026,
    soundType: 0,
    yawOffset: Math.PI, // Raw mesh barrel points +Z -> rotate 180 deg to face -Z
    vmScale: 1.0,
    hipPos: [0.21, -0.2, -0.51],
    adsPos: [0.0, -0.138, -0.38],
    muzzleLocal: [0.0, 0.068, -0.42],
    rightHandLocal: [0.0, -0.035, 0.045],
    leftHandLocal: [-0.01, 0.022, -0.21],
    isPistol: false,
  },
  {
    id: 'M1911',
    name: 'M1911',
    category: 'Pistol',
    damage: 32,
    rpm: 440,
    mag: 8,
    reloadTime: 1.45,
    spread: 0.009,
    adsSpreadMul: 0.22,
    auto: false,
    recoilPitch: 0.01,
    recoilYaw: 0.0014,
    recoilRecovery: 21,
    vmKickZ: 0.028,
    vmKickRot: 0.042,
    soundType: 1,
    yawOffset: 0,
    vmScale: 0.95,
    hipPos: [0.2, -0.175, -0.45],
    adsPos: [0.0, -0.114, -0.35],
    muzzleLocal: [0.0, 0.082, -0.2],
    rightHandLocal: [0.0, -0.03, 0.1],
    leftHandLocal: [-0.012, -0.045, 0.095],
    isPistol: true,
  },
  {
    id: 'MP5',
    name: 'MP5',
    category: 'SMG',
    damage: 19,
    rpm: 820,
    mag: 30,
    reloadTime: 1.75,
    spread: 0.015,
    adsSpreadMul: 0.3,
    auto: true,
    recoilPitch: 0.0055,
    recoilYaw: 0.0015,
    recoilRecovery: 22,
    vmKickZ: 0.018,
    vmKickRot: 0.022,
    soundType: 2,
    yawOffset: Math.PI, // Raw mesh barrel points +Z -> rotate 180 deg to face -Z
    vmScale: 1.0,
    hipPos: [0.21, -0.21, -0.49],
    adsPos: [0.0, -0.155, -0.37],
    muzzleLocal: [0.0, 0.11, -0.37],
    rightHandLocal: [0.0, -0.02, 0.08],
    leftHandLocal: [-0.01, 0.04, -0.17],
    isPistol: false,
  },
  {
    id: 'P90',
    name: 'P90',
    category: 'SMG',
    damage: 17,
    rpm: 920,
    mag: 50,
    reloadTime: 2.1,
    spread: 0.017,
    adsSpreadMul: 0.32,
    auto: true,
    recoilPitch: 0.0048,
    recoilYaw: 0.0014,
    recoilRecovery: 23,
    vmKickZ: 0.016,
    vmKickRot: 0.02,
    soundType: 2,
    yawOffset: 0,
    vmScale: 1.02,
    hipPos: [0.2, -0.185, -0.48],
    adsPos: [0.0, -0.115, -0.36],
    muzzleLocal: [0.0, 0.035, -0.32],
    rightHandLocal: [0.0, -0.025, 0.04],
    leftHandLocal: [-0.01, -0.015, -0.16],
    isPistol: false,
  },
  {
    id: 'SCAR-H',
    name: 'SCAR-H',
    category: 'Rifle',
    damage: 34,
    rpm: 540,
    mag: 20,
    reloadTime: 2.05,
    spread: 0.011,
    adsSpreadMul: 0.22,
    auto: true,
    recoilPitch: 0.01,
    recoilYaw: 0.002,
    recoilRecovery: 19,
    vmKickZ: 0.025,
    vmKickRot: 0.03,
    soundType: 0,
    yawOffset: 0,
    vmScale: 1.0,
    hipPos: [0.21, -0.195, -0.52],
    adsPos: [0.0, -0.13, -0.39],
    muzzleLocal: [0.0, 0.04, -0.45],
    rightHandLocal: [0.0, -0.03, 0.05],
    leftHandLocal: [-0.01, 0.015, -0.19],
    isPistol: false,
  },
];

interface RawGunPart {
  p: string;
  i: string;
  m: number;
}

interface RawGunEntry {
  len: number;
  parts: RawGunPart[];
}

type RawGunMap = Record<string, RawGunEntry>;

function decodeBase64Typed<T extends Float32Array | Uint32Array>(
  b64: string,
  Ctor: new (buffer: ArrayBuffer) => T,
): T {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Ctor(bytes.buffer);
}

const gunMaterials = [
  new THREE.MeshStandardMaterial({
    color: 0x3f454f,
    metalness: 0.68,
    roughness: 0.34,
    side: THREE.DoubleSide,
  }),
  new THREE.MeshStandardMaterial({
    color: 0x1f2228,
    metalness: 0.28,
    roughness: 0.62,
    side: THREE.DoubleSide,
  }),
];

export class WeaponModelCache {
  private geometries = new Map<string, Array<{ geo: THREE.BufferGeometry; matIdx: number }>>();
  ready = false;

  async load(): Promise<void> {
    if (this.ready) return;
    const res = await fetch('/assets/weapons/guns.json');
    if (!res.ok) throw new Error('Failed to load weapon geometry pack');
    const raw: RawGunMap = (await res.json()) as RawGunMap;

    for (const spec of WEAPON_SPECS) {
      const entry = raw[spec.id];
      if (!entry) continue;
      const built: Array<{ geo: THREE.BufferGeometry; matIdx: number }> = [];
      for (const part of entry.parts) {
        let geo = new THREE.BufferGeometry();
        geo.setAttribute(
          'position',
          new THREE.BufferAttribute(decodeBase64Typed(part.p, Float32Array), 3),
        );
        geo.setIndex(new THREE.BufferAttribute(decodeBase64Typed(part.i, Uint32Array), 1));
        geo = geo.toNonIndexed();
        geo.computeVertexNormals();
        built.push({ geo, matIdx: part.m === 1 ? 1 : 0 });
      }
      this.geometries.set(spec.id, built);
    }
    this.ready = true;
  }

  createMesh(weaponIdx: number, isViewmodel: boolean): THREE.Group {
    const spec = WEAPON_SPECS[weaponIdx] ?? WEAPON_SPECS[0];
    const root = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.y = spec.yawOffset;

    const parts = this.geometries.get(spec.id);
    if (parts) {
      for (const p of parts) {
        const mesh = new THREE.Mesh(p.geo, gunMaterials[p.matIdx]);
        mesh.castShadow = !isViewmodel;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        inner.add(mesh);
      }
    } else {
      // Clean fallback silhouette while async pack finishes
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.09, spec.isPistol ? 0.24 : 0.6),
        gunMaterials[0],
      );
      fallback.frustumCulled = false;
      inner.add(fallback);
    }

    root.add(inner);
    if (isViewmodel) {
      root.scale.setScalar(spec.vmScale);
    }
    return root;
  }

  dispose(): void {
    this.geometries.forEach((parts) => {
      parts.forEach((p) => p.geo.dispose());
    });
    this.geometries.clear();
  }
}
