import * as THREE from 'three';
import { WeaponModelCache } from './weapons';

export interface CombatantVisual {
  root: THREE.Group;
  weaponPivot: THREE.Group;
  weaponMesh: THREE.Group;
  weaponIdx: number;
  labelSprite: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  labelTex: THREE.CanvasTexture;
  updateLabel: (name: string, hp: number) => void;
  setWeapon: (idx: number, cache: WeaponModelCache) => void;
  dispose: () => void;
}

export function createCombatantVisual(
  name: string,
  accentHex: number,
  weaponIdx: number,
  weaponCache: WeaponModelCache,
): CombatantVisual {
  const root = new THREE.Group();

  const vestMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.65,
    metalness: 0.12,
  });
  const bduMat = new THREE.MeshStandardMaterial({
    color: 0x262c33,
    roughness: 0.82,
    metalness: 0.06,
  });
  const gearMat = new THREE.MeshStandardMaterial({
    color: 0x16191e,
    roughness: 0.45,
    metalness: 0.25,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.2,
    metalness: 0.6,
    emissive: 0x3a2000,
    emissiveIntensity: 0.4,
  });

  // Legs
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.2), bduMat);
  leftLeg.position.set(-0.12, 0.39, 0);
  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.2), bduMat);
  rightLeg.position.set(0.12, 0.39, 0);

  // Armored chest & torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.28), vestMat);
  torso.position.y = 1.08;
  const rigPlate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.31), gearMat);
  rigPlate.position.set(0, 1.12, -0.01);

  // Tactical helmet + visor facing -Z
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 12), gearMat);
  head.position.y = 1.56;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.08), visorMat);
  visor.position.set(0, 1.56, -0.14);

  // Arms holding weapon forward along -Z
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.42), bduMat);
  rightArm.position.set(0.27, 1.18, -0.18);
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.44), bduMat);
  leftArm.position.set(-0.18, 1.14, -0.24);
  leftArm.rotation.y = -0.35;

  root.add(leftLeg, rightLeg, torso, rigPlate, head, visor, rightArm, leftArm);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0.23, 1.22, -0.22);
  let weaponMesh = weaponCache.createMesh(weaponIdx, false);
  weaponMesh.position.set(0, -0.02, -0.18);
  weaponPivot.add(weaponMesh);
  root.add(weaponPivot);

  // Overhead nametag + compact HP bar
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 64;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const labelSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: labelTex, depthTest: false, transparent: true }),
  );
  labelSprite.scale.set(1.5, 0.375, 1);
  labelSprite.position.y = 2.02;
  root.add(labelSprite);

  let lastName = '';
  let lastHp = -1;

  const updateLabel = (nextName: string, hp: number) => {
    const cleanHp = Math.max(0, Math.round(hp));
    if (nextName === lastName && cleanHp === lastHp) return;
    lastName = nextName;
    lastHp = cleanHp;

    const ctx = labelCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(11, 15, 20, 0.78)';
    ctx.beginPath();
    ctx.roundRect(16, 8, 224, 46, 10);
    ctx.fill();

    ctx.fillStyle = '#eef2f6';
    ctx.font = 'bold 20px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nextName.slice(0, 14), 128, 25);

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(36, 42, 184, 5);
    const ratio = cleanHp / 100;
    ctx.fillStyle = ratio > 0.45 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(36, 42, 184 * ratio, 5);
    labelTex.needsUpdate = true;
  };

  updateLabel(name, 100);

  let currentWeaponIdx = weaponIdx;
  const setWeapon = (idx: number, cache: WeaponModelCache) => {
    if (idx === currentWeaponIdx && weaponMesh) return;
    currentWeaponIdx = idx;
    weaponPivot.remove(weaponMesh);
    weaponMesh = cache.createMesh(idx, false);
    weaponMesh.position.set(0, -0.02, -0.18);
    weaponPivot.add(weaponMesh);
  };

  const dispose = () => {
    labelTex.dispose();
    labelSprite.material.dispose();
  };

  return {
    root,
    weaponPivot,
    weaponMesh,
    weaponIdx: currentWeaponIdx,
    labelSprite,
    labelCanvas,
    labelTex,
    updateLabel,
    setWeapon,
    dispose,
  };
}
