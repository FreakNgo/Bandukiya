import * as THREE from 'three';
import type { WeaponSpec } from '../types/game';

const _shoulder = new THREE.Vector3();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _lookMat = new THREE.Matrix4();

function buildTacticalArm(side: 'left' | 'right'): {
  handGroup: THREE.Group;
  forearm: THREE.Group;
} {
  const s = side === 'right' ? 1 : -1;

  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0x2c332d, // Olive-charcoal combat sleeve
    roughness: 0.86,
    metalness: 0.05,
  });
  const cuffMat = new THREE.MeshStandardMaterial({
    color: 0x1b1f24,
    roughness: 0.7,
    metalness: 0.12,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x24282e, // Matte tactical glove
    roughness: 0.56,
    metalness: 0.1,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: 0x15181c, // Molded carbon knuckle guard
    roughness: 0.34,
    metalness: 0.28,
  });

  // Hand cluster anchored at the grip contact point (0,0,0)
  const handGroup = new THREE.Group();

  // Palm / metacarpal block
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.068, 0.072), gloveMat);
  palm.position.set(s * 0.012, -0.008, 0.008);
  handGroup.add(palm);

  // Molded knuckle guard plate on outer back of hand
  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.052, 0.058), armorMat);
  knuckle.position.set(s * 0.032, 0.002, -0.002);
  handGroup.add(knuckle);

  // Curled fingers wrapping around grip / foregrip
  const fingerCurl = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.058, 0.036), gloveMat);
  fingerCurl.position.set(-s * 0.014, -0.01, -0.014);
  fingerCurl.rotation.z = s * 0.18;
  handGroup.add(fingerCurl);

  // Trigger / index finger ridge
  const indexFinger = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.016, 0.044), gloveMat);
  indexFinger.position.set(s * 0.018, 0.02, -0.024);
  handGroup.add(indexFinger);

  // Opposing thumb
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.045), gloveMat);
  thumb.position.set(-s * 0.016, 0.024, 0.014);
  thumb.rotation.set(0.35, s * 0.25, 0);
  handGroup.add(thumb);

  // Wrist cuff attached to back of hand
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.042, 10), cuffMat);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(s * 0.006, -0.006, 0.056);
  handGroup.add(cuff);

  // Forearm segment that stretches cleanly from wrist toward camera shoulder anchor
  const forearm = new THREE.Group();
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.048, 0.44, 10), sleeveMat);
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = 0.22;
  forearm.add(sleeve);

  const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.039, 0.024, 10), armorMat);
  strap.rotation.x = Math.PI / 2;
  strap.position.z = 0.05;
  forearm.add(strap);

  handGroup.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.frustumCulled = false;
      o.castShadow = false;
      o.receiveShadow = true;
    }
  });
  forearm.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.frustumCulled = false;
      o.castShadow = false;
      o.receiveShadow = true;
    }
  });

  return { handGroup, forearm };
}

export class TacticalArmsRig {
  readonly group = new THREE.Group();
  private rightHand: THREE.Group;
  private rightForearm: THREE.Group;
  private leftHand: THREE.Group;
  private leftForearm: THREE.Group;

  private curRight = new THREE.Vector3(0.0, -0.03, 0.06);
  private curLeft = new THREE.Vector3(-0.01, 0.02, -0.19);

  constructor() {
    const r = buildTacticalArm('right');
    const l = buildTacticalArm('left');
    this.rightHand = r.handGroup;
    this.rightForearm = r.forearm;
    this.leftHand = l.handGroup;
    this.leftForearm = l.forearm;

    this.group.add(this.rightHand, this.rightForearm, this.leftHand, this.leftForearm);
  }

  update(spec: WeaponSpec, reloadSin: number, recoilKick: number, adsMix: number, dt: number): void {
    const scale = spec.vmScale;
    const rx = spec.rightHandLocal[0] * scale;
    const ry = spec.rightHandLocal[1] * scale;
    const rz = spec.rightHandLocal[2] * scale;

    // Left hand drops slightly down/inward during reload animation
    const lx = spec.leftHandLocal[0] * scale - reloadSin * 0.06;
    const ly = spec.leftHandLocal[1] * scale - reloadSin * 0.14;
    const lz = spec.leftHandLocal[2] * scale + reloadSin * 0.09;

    const k = 1 - Math.exp(-22 * dt);
    this.curRight.lerp(_target.set(rx, ry, rz), k);
    this.curLeft.lerp(_target.set(lx, ly, lz), k);

    // Position hands at weapon grips
    this.rightHand.position.copy(this.curRight);
    this.rightHand.rotation.set(
      -0.12 - recoilKick * 0.05,
      0.08,
      spec.isPistol ? -0.05 : -0.1,
    );

    this.leftHand.position.copy(this.curLeft);
    if (spec.isPistol) {
      // Cupping under right hand on pistols
      this.leftHand.rotation.set(0.18, -0.35, 0.45);
    } else {
      // Supporting handguard/foregrip on rifles & SMGs
      this.leftHand.rotation.set(0.08, -0.22, 0.68);
    }

    // Orient forearms from wrist back toward tactical shoulder offsets
    this.orientForearm(this.rightForearm, this.curRight, 0.2 - adsMix * 0.04, -0.24, 0.34);
    this.orientForearm(
      this.leftForearm,
      this.curLeft,
      -0.24 + adsMix * 0.05,
      -0.25 - reloadSin * 0.08,
      0.32,
    );
  }

  private orientForearm(
    forearm: THREE.Group,
    wristPos: THREE.Vector3,
    sx: number,
    sy: number,
    sz: number,
  ): void {
    // Place forearm origin right behind the wrist cuff
    forearm.position.copy(wristPos);
    forearm.position.z += 0.045;
    _shoulder.set(sx, sy, sz);
    _dir.subVectors(_shoulder, forearm.position).normalize();
    _lookMat.lookAt(forearm.position, _shoulder, _up);
    forearm.quaternion.setFromRotationMatrix(_lookMat);
    // lookAt aligns -Z toward target; forearm cylinder extends along +Z, so flip 180 deg around Y
    forearm.rotateY(Math.PI);
  }
}
