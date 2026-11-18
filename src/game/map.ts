import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ArenaOBB } from '../types/game';

export const ARENA_HALF_EXTENT = 39.5;

export const SPAWN_POINTS: ReadonlyArray<readonly [number, number]> = [
  [-33, -33],
  [33, -33],
  [-33, 33],
  [33, 33],
  [0, -35],
  [0, 35],
  [-35, 0],
  [35, 0],
];

const MODEL_NAMES = [
  'Building_01',
  'Wall_01',
  'Wall_02',
  'Wall_03',
  'WallPart_01',
  'Box_01',
  'Jug_01',
  'Jug_02',
  'Brick_01',
  'WoodPlank_01',
  'WoodPlank_02',
  'WoodPlank_03',
] as const;

type ModelName = (typeof MODEL_NAMES)[number];

const RAW_DIMENSIONS: Record<ModelName, [number, number, number]> = {
  Building_01: [5.16, 3.5, 5.32],
  Wall_01: [4.0, 2.4, 0.3],
  Wall_02: [1.56, 2.2, 0.34],
  Wall_03: [10.0, 5.0, 0.36],
  WallPart_01: [0.6, 5.25, 0.6],
  Box_01: [0.744, 0.74, 0.744],
  Jug_01: [0.3, 0.495, 0.3],
  Jug_02: [0.296, 0.448, 0.296],
  Brick_01: [0.382, 0.22, 0.22],
  WoodPlank_01: [1.024, 0.034, 0.144],
  WoodPlank_02: [1.034, 0.034, 0.148],
  WoodPlank_03: [1.033, 0.034, 0.153],
};

function createSandTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 512;
  const ctx = cv.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#c8b898';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 6500; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const tone = 165 + Math.floor(Math.random() * 55);
      ctx.fillStyle = `rgba(${tone},${tone - 16},${tone - 42},0.35)`;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.strokeStyle = 'rgba(130, 112, 82, 0.14)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 512; g += 64) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, g);
      ctx.lineTo(512, g);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

interface PlacedProp {
  name: ModelName;
  group: THREE.Group;
  fallback: THREE.Mesh;
}

export class ArenaMap {
  readonly colliders: ArenaOBB[] = [];
  private placements: PlacedProp[] = [];
  private templates = new Map<ModelName, THREE.Group>();
  private fallbackMat = new THREE.MeshStandardMaterial({ color: 0x9b8e7b, roughness: 0.88 });
  private groundTex: THREE.CanvasTexture;

  constructor(private scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.groundTex = createSandTexture(renderer);
    this.buildTerrain();
    this.buildExactCompoundLayout();
  }

  private buildTerrain(): void {
    const arenaGround = new THREE.Mesh(
      new THREE.PlaneGeometry(82, 82),
      new THREE.MeshStandardMaterial({
        map: this.groundTex,
        roughness: 0.96,
        metalness: 0.0,
      }),
    );
    arenaGround.rotation.x = -Math.PI / 2;
    arenaGround.receiveShadow = true;
    this.scene.add(arenaGround);

    // Extended desert floor beyond perimeter walls (offset -0.03m to avoid Z-fighting)
    const farDesert = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshStandardMaterial({
        color: 0x9f8d6c,
        roughness: 0.98,
        metalness: 0.0,
      }),
    );
    farDesert.rotation.x = -Math.PI / 2;
    farDesert.position.y = -0.03;
    farDesert.receiveShadow = true;
    this.scene.add(farDesert);
  }

  private addOBB(
    cx: number,
    cz: number,
    widthX: number,
    depthZ: number,
    ry: number,
    bottom: number,
    top: number,
    tag?: string,
  ): void {
    this.colliders.push({
      cx,
      cz,
      hx: widthX * 0.5,
      hz: depthZ * 0.5,
      cos: Math.cos(ry),
      sin: Math.sin(ry),
      bottom,
      top,
      tag,
    });
  }

  private place(
    name: ModelName,
    x: number,
    z: number,
    ry = 0,
    scale = 1,
    y = 0,
    solid = true,
  ): void {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = ry;
    group.scale.setScalar(scale);
    this.scene.add(group);

    const d = RAW_DIMENSIONS[name];
    const fallback = new THREE.Mesh(new THREE.BoxGeometry(d[0], d[1], d[2]), this.fallbackMat);
    fallback.position.y = d[1] * 0.5;
    fallback.castShadow = true;
    fallback.receiveShadow = true;
    group.add(fallback);

    this.placements.push({ name, group, fallback });

    if (solid) {
      this.addOBB(x, z, d[0] * scale, d[2] * scale, ry, y, y + d[1] * scale, name);
    }
  }

  private placeHouse(x: number, z: number): void {
    // Building_01 is a solid enclosed desert structure (5.16m x 3.5m x 5.32m).
    // Using a tight solid OBB prevents clipping inside the building geometry.
    this.place('Building_01', x, z, 0, 1, 0, true);
  }

  private buildExactCompoundLayout(): void {
    // 1. Perimeter compound walls (Wall_03, 10m segments at +/-40m)
    const perimCoords = [-35, -25, -15, -5, 5, 15, 25, 35];
    for (const v of perimCoords) {
      this.place('Wall_03', v, -40, 0, 1, 0, true);
      this.place('Wall_03', v, 40, 0, 1, 0, true);
      this.place('Wall_03', -40, v, Math.PI / 2, 1, 0, true);
      this.place('Wall_03', 40, v, Math.PI / 2, 1, 0, true);
    }

    // 2. Four corner houses (Building_01)
    this.placeHouse(-18, -14);
    this.placeHouse(18, -14);
    this.placeHouse(-18, 16);
    this.placeHouse(18, 16);

    // 3. Center arena cover walls (Wall_01)
    this.place('Wall_01', 0, -7, 0, 1, 0, true);
    this.place('Wall_01', 0, 7, 0, 1, 0, true);
    this.place('Wall_01', -8, 0, Math.PI / 2, 1, 0, true);
    this.place('Wall_01', 8, 0, Math.PI / 2, 1, 0, true);

    // 4. Center crates + stacked upper crate (flush on 0.74 * 1.6 = 1.184m)
    const centerBoxes: Array<[number, number, number]> = [
      [2, 2, 0.3],
      [-2, -2, 0.5],
      [-2.6, 2.2, 0],
      [2.4, -2.3, 0.8],
    ];
    for (const [bx, bz, bry] of centerBoxes) {
      this.place('Box_01', bx, bz, bry, 1.6, 0, true);
    }
    this.place('Box_01', -2, -2, 1.2, 1.6, 0.74 * 1.6, true);

    // 5. Outer lane cover walls (Wall_02)
    const wall02List: Array<[number, number, number]> = [
      [-30, -5, 0],
      [30, 5, 0],
      [-8, -28, Math.PI / 2],
      [8, 28, Math.PI / 2],
      [-30, 30, 0],
      [30, -30, 0],
      [0, -20, 0],
      [0, 20, 0],
    ];
    for (const [wx, wz, wry] of wall02List) {
      this.place('Wall_02', wx, wz, wry, 1, 0, true);
    }

    // 6. Compound pillars (WallPart_01)
    const pillarList: Array<[number, number]> = [
      [-30, 0],
      [30, 0],
      [0, -30],
      [0, 30],
      [-30, -20],
      [30, 20],
      [-10, -12],
      [10, 12],
    ];
    for (const [px, pz] of pillarList) {
      this.place('WallPart_01', px, pz, 0, 1, 0, true);
    }

    // 7. Flank crate pairs (Box_01)
    const flankBoxes: Array<[number, number, number]> = [
      [-24, -24, 0],
      [24, 24, 0.4],
      [-26, 12, 0.9],
      [26, -12, 0.2],
      [12, -26, 1.3],
      [-12, 26, 0.6],
    ];
    for (const [fx, fz, fry] of flankBoxes) {
      this.place('Box_01', fx, fz, fry, 1.3, 0, true);
      this.place('Box_01', fx + 1.2, fz + 0.4, fry + 0.4, 1.0, 0, true);
    }

    // 8. Decorative clay jugs (Jug_01 / Jug_02)
    const jugs: Array<[ModelName, number, number, number]> = [
      ['Jug_01', -14, -10, 0.8],
      ['Jug_02', 14, -10, 2.1],
      ['Jug_01', -14, 12, 3.7],
      ['Jug_02', 14, 12, 5.1],
      ['Jug_01', 4, -4, 1.4],
      ['Jug_02', -4, 4, 4.2],
    ];
    for (const [jn, jx, jz, jry] of jugs) {
      this.place(jn, jx, jz, jry, 1.2, 0, false);
    }

    // 9. Ground planks (WoodPlank_01..03) flush on ground
    const planks: Array<[ModelName, number, number, number]> = [
      ['WoodPlank_01', -12, -22, 0],
      ['WoodPlank_02', 12, 22, 1],
      ['WoodPlank_03', -22, 6, 2],
      ['WoodPlank_01', 22, -6, 3],
    ];
    for (const [pn, px, pz, pry] of planks) {
      this.place(pn, px, pz, pry, 2.0, 0.005, false);
    }

    // 10. Brick pairs (Brick_01) flush on ground
    const bricks: Array<[number, number, number]> = [
      [-5, -14, 0.4],
      [6, 16, 1.7],
      [-6, 16, 2.5],
      [5, -15, 0.9],
    ];
    for (const [bx, bz, bry] of bricks) {
      this.place('Brick_01', bx, bz, bry, 1.5, 0, false);
      this.place('Brick_01', bx + 0.5, bz + 0.2, bry + 0.8, 1.5, 0, false);
    }
  }

  async loadModels(): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(
      MODEL_NAMES.map(async (name) => {
        try {
          const gltf = await loader.loadAsync(`/assets/map/${name}.gltf`);
          const root = gltf.scene;

          // Normalize pivot so bottom sits strictly at local y = 0 (fixes center-pivoted Box_01, Brick_01, WoodPlank_*)
          root.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(root);
          const minY = Number.isFinite(box.min.y) ? box.min.y : 0;

          const container = new THREE.Group();
          root.position.y -= minY;
          root.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              const mat = mesh.material as THREE.MeshStandardMaterial;
              if (mat) {
                if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                mat.roughness = Math.max(mat.roughness ?? 0.85, 0.65);
              }
            }
          });
          container.add(root);
          this.templates.set(name, container);

          // Swap out placeholder boxes for real glTF meshes
          for (const item of this.placements) {
            if (item.name === name) {
              item.group.remove(item.fallback);
              item.group.add(container.clone());
            }
          }
        } catch (err) {
          console.warn(`Could not load map asset ${name}:`, err);
        }
      }),
    );
  }

  dispose(): void {
    this.groundTex.dispose();
    this.fallbackMat.dispose();
  }
}

/**
 * Resolves cylinder-vs-OBB collision for player movement, supporting stepping onto crates
 * and sliding smoothly along angled cover without diagonal AABB bloat.
 */
export function resolvePlayerCollisions(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  colliders: ArenaOBB[],
  radius = 0.4,
): number {
  let groundY = 0;

  for (const c of colliders) {
    const dx = pos.x - c.cx;
    const dz = pos.z - c.cz;
    // Transform into OBB local frame
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;

    const clampedX = Math.max(-c.hx, Math.min(c.hx, lx));
    const clampedZ = Math.max(-c.hz, Math.min(c.hz, lz));
    const ex = lx - clampedX;
    const ez = lz - clampedZ;
    const dist = Math.hypot(ex, ez);

    if (dist < radius) {
      if (pos.y >= c.top - 0.02 || (c.top - pos.y <= 0.42 && vel.y <= 0)) {
        if (pos.y >= c.bottom - 0.1) {
          groundY = Math.max(groundY, c.top);
        }
      } else if (pos.y + 1.65 > c.bottom && pos.y < c.top) {
        let pushLX = 0;
        let pushLZ = 0;
        if (dist > 1e-5) {
          const push = (radius - dist) / dist;
          pushLX = ex * push;
          pushLZ = ez * push;
        } else {
          // Center inside OBB: push out nearest face
          const toLeft = c.hx + lx;
          const toRight = c.hx - lx;
          const toBack = c.hz + lz;
          const toFront = c.hz - lz;
          const m = Math.min(toLeft, toRight, toBack, toFront);
          if (m === toLeft) pushLX = -(toLeft + radius);
          else if (m === toRight) pushLX = toRight + radius;
          else if (m === toBack) pushLZ = -(toBack + radius);
          else pushLZ = toFront + radius;
        }
        // Transform push vector back to world space
        pos.x += pushLX * c.cos + pushLZ * c.sin;
        pos.z += -pushLX * c.sin + pushLZ * c.cos;
      }
    }
  }

  pos.x = Math.max(-ARENA_HALF_EXTENT, Math.min(ARENA_HALF_EXTENT, pos.x));
  pos.z = Math.max(-ARENA_HALF_EXTENT, Math.min(ARENA_HALF_EXTENT, pos.z));
  return groundY;
}

/**
 * Exact ray-vs-OBB slab intersection in world space.
 */
export function raycastOBB(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  c: ArenaOBB,
  outNormal: THREE.Vector3,
): number | null {
  const dx = origin.x - c.cx;
  const dz = origin.z - c.cz;

  const ox = dx * c.cos - dz * c.sin;
  const oz = dx * c.sin + dz * c.cos;
  const rx = dir.x * c.cos - dir.z * c.sin;
  const rz = dir.x * c.sin + dir.z * c.cos;

  const lo = [-c.hx, c.bottom, -c.hz];
  const hi = [c.hx, c.top, c.hz];
  const oo = [ox, origin.y, oz];
  const dd = [rx, dir.y, rz];

  let tMin = 0;
  let tMax = 1e9;
  let hitAxis = -1;
  let hitSign = 0;

  for (let a = 0; a < 3; a++) {
    if (Math.abs(dd[a]) < 1e-8) {
      if (oo[a] < lo[a] || oo[a] > hi[a]) return null;
      continue;
    }
    let t1 = (lo[a] - oo[a]) / dd[a];
    let t2 = (hi[a] - oo[a]) / dd[a];
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      hitAxis = a;
      hitSign = s;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  if (hitAxis === -1) return null;

  if (hitAxis === 1) {
    outNormal.set(0, hitSign, 0);
  } else if (hitAxis === 0) {
    outNormal.set(hitSign * c.cos, 0, -hitSign * c.sin);
  } else {
    outNormal.set(hitSign * c.sin, 0, hitSign * c.cos);
  }

  return tMin;
}
