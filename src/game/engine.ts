import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  CombatantHudRow,
  HudSnapshot,
  KillFeedItem,
  SettingsState,
} from '../types/game';
import { soundEngine } from './audio';
import { createCombatantVisual, type CombatantVisual } from './avatars';
import { BotManager, type BotActor } from './bots';
import { TacticalArmsRig } from './hands';
import { ArenaMap, raycastOBB, resolvePlayerCollisions, SPAWN_POINTS } from './map';
import { P2PManager, type P2PMessage } from './p2p';
import { WEAPON_SPECS, WeaponModelCache } from './weapons';

// Module-scope reusable scratch objects (zero GC in render loop)
const _dir = new THREE.Vector3();
const _org = new THREE.Vector3();
const _muz = new THREE.Vector3();
const _end = new THREE.Vector3();
const _norm = new THREE.Vector3();
const _hitNorm = new THREE.Vector3();
const _slideBurst = new THREE.Vector3();
const _slideWish = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function shortestAngleDiff(a: number, b: number): number {
  return ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

interface RemotePeerState {
  id: number;
  name: string;
  pos: THREE.Vector3;
  targetPos: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  pitch: number;
  hp: number;
  kills: number;
  deaths: number;
  weaponIdx: number;
  sliding: boolean;
  visual: CombatantVisual;
}

interface ActiveTracer {
  mesh: THREE.Mesh;
  ttl: number;
}

export class BandukwaEngine {
  readonly isSoftwareGl: boolean;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly p2p = new P2PManager();

  private container: HTMLElement;
  private sunLight: THREE.DirectionalLight;
  private arenaMap: ArenaMap;
  private weaponCache = new WeaponModelCache();
  private botManager: BotManager;
  private armsRig = new TacticalArmsRig();

  // Viewmodel hierarchy
  private vmRoot = new THREE.Group();
  private vmGunHolder: THREE.Group | null = null;
  private muzzleNode = new THREE.Object3D();
  private muzzleFlash: THREE.Mesh;
  private muzzleLight: THREE.PointLight;
  private flashTimer = 0;

  // Particle & tracer pools
  private readonly MAX_PARTICLES = 450;
  private partPos: Float32Array;
  private partCol: Float32Array;
  private partVel: Float32Array;
  private partMaxCol: Float32Array;
  private partLife: Float32Array;
  private partMaxLife: Float32Array;
  private partCursor = 0;
  private partGeo: THREE.BufferGeometry;
  private tracers: ActiveTracer[] = [];
  private tracerGeo = new THREE.BoxGeometry(0.014, 0.014, 1);
  private tracerMat = new THREE.MeshBasicMaterial({
    color: 0xffeba8,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private decals: THREE.Mesh[] = [];
  private decalGeo = new THREE.CircleGeometry(0.065, 8);
  private decalMat = new THREE.MeshBasicMaterial({
    color: 0x161412,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  // Player state
  private me = { name: 'Operator', kills: 0, deaths: 0 };
  private pos = new THREE.Vector3(0, 0, 30);
  private vel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private hp = 100;
  private onGround = true;
  private eyeHeight = 1.62;
  private slideTimer = 0;
  private slideSpeed = 0;
  private slideDir = new THREE.Vector3();
  private slideCooldown = 0;
  private bobPhase = 0;
  private stepAccum = 0;

  // Combat & Recoil (snappy minimal arcade recoil + spring recovery)
  private weaponIdx = 0;
  private ammo = WEAPON_SPECS.map((w) => w.mag);
  private fireCooldown = 0;
  private reloadTimer = 0;
  private swapTimer = 0;
  private deadTimer = 0;
  private recoilCamPitch = 0;
  private recoilCamYaw = 0;
  private vmKick = 0;
  private adsMix = 0;
  private screenShake = 0;

  // Remote P2P players
  private remotes = new Map<number, RemotePeerState>();

  // Input state (PC + Touch unified)
  private keys: Record<string, boolean> = {};
  private mouseDown = false;
  private touchFiring = false;
  private adsActive = false;
  private touchMoveX = 0;
  private touchMoveY = 0;

  // Match & Lifecycle state
  private settings: SettingsState;
  private started = false;
  private playing = false;
  private softLocked = false;
  private pointerLocked = false;
  private mapReady = false;
  private weaponsReady = false;
  private disposed = false;
  private frameId = 0;
  private lastTime = performance.now();
  private netSyncAccum = 0;
  private hudSyncAccum = 0;

  // HUD transient feedback
  private hitMarker: 'none' | 'body' | 'head' = 'none';
  private hitMarkerTimer = 0;
  private damageFlash = 0;
  private killFeed: KillFeedItem[] = [];
  private killFeedSeq = 1;
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private onPauseRequested: () => void;

  // Bound event listeners
  private onResizeBound: () => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onBlurBound: () => void;
  private onMouseMoveBound: (e: MouseEvent) => void;
  private onMouseDownBound: (e: MouseEvent) => void;
  private onMouseUpBound: (e: MouseEvent) => void;
  private onWheelBound: (e: WheelEvent) => void;
  private onPointerLockChangeBound: () => void;
  private onContextMenuBound: (e: MouseEvent) => void;

  constructor(
    container: HTMLElement,
    initialSettings: SettingsState,
    onHudUpdate: (snapshot: HudSnapshot) => void,
    onPauseRequested: () => void,
  ) {
    this.container = container;
    this.settings = { ...initialSettings };
    this.onHudUpdate = onHudUpdate;
    this.onPauseRequested = onPauseRequested;

    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // Scene & atmospheric desert sky
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd7c5a5);
    this.scene.fog = new THREE.FogExp2(0xd7c5a5, 0.0085);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.04,
      320,
    );
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Three-point warm desert sun + cool sky hemisphere fill + rim light
    const hemi = new THREE.HemisphereLight(0xdcebff, 0x9b8259, 0.72);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight(0xfff1d4, 1.35);
    this.sunLight.position.set(32, 56, 22);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 150;
    this.sunLight.shadow.camera.left = -46;
    this.sunLight.shadow.camera.right = 46;
    this.sunLight.shadow.camera.top = 46;
    this.sunLight.shadow.camera.bottom = -46;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    const rim = new THREE.DirectionalLight(0xaed0ff, 0.32);
    rim.position.set(-28, 20, -30);
    this.scene.add(rim);

    // Muzzle flash sprite + dynamic flash light
    const flashCanvas = document.createElement('canvas');
    flashCanvas.width = flashCanvas.height = 64;
    const fctx = flashCanvas.getContext('2d');
    if (fctx) {
      const grad = fctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.32, '#ffd67a');
      grad.addColorStop(1, 'rgba(255,120,0,0)');
      fctx.fillStyle = grad;
      fctx.fillRect(0, 0, 64, 64);
    }
    const flashTex = new THREE.CanvasTexture(flashCanvas);
    flashTex.colorSpace = THREE.SRGBColorSpace;
    const flashMat = new THREE.MeshBasicMaterial({
      map: flashTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.muzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), flashMat);
    this.muzzleFlash.visible = false;
    this.muzzleLight = new THREE.PointLight(0xffb45c, 0, 8);
    this.muzzleNode.add(this.muzzleFlash, this.muzzleLight);

    this.vmRoot.add(this.armsRig.group, this.muzzleNode);
    this.camera.add(this.vmRoot);

    // Particle pool
    this.partPos = new Float32Array(this.MAX_PARTICLES * 3);
    this.partCol = new Float32Array(this.MAX_PARTICLES * 3);
    this.partVel = new Float32Array(this.MAX_PARTICLES * 3);
    this.partMaxCol = new Float32Array(this.MAX_PARTICLES * 3);
    this.partLife = new Float32Array(this.MAX_PARTICLES);
    this.partMaxLife = new Float32Array(this.MAX_PARTICLES).fill(1);
    this.partGeo = new THREE.BufferGeometry();
    this.partGeo.setAttribute('position', new THREE.BufferAttribute(this.partPos, 3));
    this.partGeo.setAttribute('color', new THREE.BufferAttribute(this.partCol, 3));
    const particles = new THREE.Points(
      this.partGeo,
      new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    particles.frustumCulled = false;
    this.scene.add(particles);

    // Arena Map & AI Bots
    this.arenaMap = new ArenaMap(this.scene, this.renderer);
    this.botManager = new BotManager(this.scene, this.weaponCache);
    this.botManager.syncCount(this.settings.botCount);

    // Wire P2P callbacks
    this.p2p.onPeerLeft = (id) => this.removeRemote(id);
    this.p2p.onMessage = (msg) => this.handleP2PMessage(msg);
    this.p2p.onPeerCountChange = (count) => {
      if (count > 0) {
        // Real P2P match: clear local solo bots
        this.botManager.syncCount(0);
      } else if (this.started) {
        this.botManager.syncCount(this.settings.botCount);
      }
      this.emitHud();
    };

    // Context loss safety
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());

    // Bind events
    this.onResizeBound = () => this.handleResize();
    this.onKeyDownBound = (e) => this.handleKeyDown(e);
    this.onKeyUpBound = (e) => this.handleKeyUp(e);
    this.onBlurBound = () => this.clearInputs();
    this.onMouseMoveBound = (e) => this.handleMouseMove(e);
    this.onMouseDownBound = (e) => this.handleMouseDown(e);
    this.onMouseUpBound = (e) => this.handleMouseUp(e);
    this.onWheelBound = (e) => this.handleWheel(e);
    this.onPointerLockChangeBound = () => this.handlePointerLockChange();
    this.onContextMenuBound = (e) => e.preventDefault();

    window.addEventListener('resize', this.onResizeBound);
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('blur', this.onBlurBound);
    window.addEventListener('mousemove', this.onMouseMoveBound);
    window.addEventListener('mousedown', this.onMouseDownBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    window.addEventListener('wheel', this.onWheelBound, { passive: true });
    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenuBound);

    this.equipViewmodel();
    this.spawnPlayer();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Load glTF map + normalized weapon geometry packs asynchronously
    this.arenaMap.loadModels().then(() => {
      this.mapReady = true;
      this.emitHud();
    });
    this.weaponCache.load().then(() => {
      this.weaponsReady = true;
      this.equipViewmodel();
      this.botManager.refreshWeaponModels();
      this.remotes.forEach((r) => r.visual.setWeapon(r.weaponIdx, this.weaponCache));
      this.emitHud();
    });

    this.emitHud();
    this.scheduleNextTick();
  }

  // ---- Public API for React UI & Touch HUD ----

  updateSettings(next: SettingsState): void {
    this.settings = { ...next };
    soundEngine.setVolume(next.volume);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && next.shadows;
    if (this.p2p.connectedCount === 0) {
      this.botManager.syncCount(next.botCount);
    }
    this.emitHud();
  }

  deploy(callsign: string, usePointerLock: boolean): void {
    this.me.name = (callsign.trim() || 'Operator').slice(0, 14);
    soundEngine.unlock();
    if (!this.started) {
      this.started = true;
      this.spawnPlayer();
    }
    if (this.p2p.connectedCount === 0) {
      this.botManager.syncCount(this.settings.botCount);
    }
    this.equipViewmodel();
    if (usePointerLock) {
      this.requestLock();
    } else {
      this.softLocked = true;
      this.setPlaying(true);
    }
  }

  pauseToMenu(): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.softLocked = false;
    this.setPlaying(false);
    this.onPauseRequested();
  }

  requestLock(): void {
    const cv = this.renderer.domElement;
    try {
      const maybePromise = cv.requestPointerLock() as unknown as Promise<void> | undefined;
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {
          this.softLocked = true;
          this.setPlaying(true);
        });
      }
    } catch {
      this.softLocked = true;
      this.setPlaying(true);
    }
  }

  selectWeapon(idx: number): void {
    if (idx < 0 || idx >= WEAPON_SPECS.length || idx === this.weaponIdx) return;
    this.weaponIdx = idx;
    this.reloadTimer = 0;
    this.swapTimer = 0.24;
    this.equipViewmodel();
    soundEngine.swap();
    this.emitHud();
  }

  cycleWeapon(): void {
    this.selectWeapon((this.weaponIdx + 1) % WEAPON_SPECS.length);
  }

  triggerReload(): void {
    const spec = WEAPON_SPECS[this.weaponIdx];
    if (this.reloadTimer > 0 || this.deadTimer > 0 || this.ammo[this.weaponIdx] >= spec.mag) return;
    this.reloadTimer = spec.reloadTime;
    soundEngine.reload(spec.reloadTime);
    this.emitHud();
  }

  triggerJump(): void {
    if (!this.playing || this.deadTimer > 0) return;
    if (this.onGround) {
      this.vel.y = 8.0;
      this.onGround = false;
      if (this.slideTimer > 0) {
        this.slideTimer = 0;
        this.vel.x *= 1.15;
        this.vel.z *= 1.15;
      }
    }
  }

  triggerSlide(): void {
    if (!this.playing || this.deadTimer > 0) return;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && this.slideTimer <= 0 && this.slideCooldown <= 0 && speed > 4.2) {
      this.slideTimer = 0.8;
      this.slideSpeed = Math.min(Math.max(speed * 1.4, 10.2), 12.2);
      this.slideDir.set(this.vel.x, 0, this.vel.z).normalize();
      soundEngine.slide();
      this.burstParticles(_slideBurst.set(this.pos.x, 0.1, this.pos.z), 20, [0.75, 0.65, 0.48], 3.2, 0.55);
    }
  }

  setTouchMove(x: number, y: number): void {
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveY = Math.max(-1, Math.min(1, y));
  }

  addLookDelta(dx: number, dy: number): void {
    if (!this.playing) return;
    const base = this.adsActive ? 0.0022 : 0.0036;
    const sens = base * this.settings.sensitivity * (this.adsActive ? this.settings.adsMultiplier : 1);
    this.yaw -= dx * sens;
    this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch - dy * sens));
  }

  setTouchFire(firing: boolean): void {
    this.touchFiring = firing;
    if (firing && this.playing && !WEAPON_SPECS[this.weaponIdx].auto) {
      this.tryShoot();
    }
  }

  toggleTouchAds(): void {
    this.adsActive = !this.adsActive;
  }

  setAds(active: boolean): void {
    this.adsActive = active;
  }

  // ---- Internal Simulation ----

  private setPlaying(v: boolean): void {
    this.playing = v;
    if (!v) this.clearInputs();
    this.emitHud();
  }

  private clearInputs(): void {
    for (const k in this.keys) this.keys[k] = false;
    this.mouseDown = false;
    this.touchFiring = false;
    this.adsActive = false;
    this.touchMoveX = 0;
    this.touchMoveY = 0;
  }

  private equipViewmodel(): void {
    if (this.vmGunHolder) {
      this.vmRoot.remove(this.vmGunHolder);
    }
    const spec = WEAPON_SPECS[this.weaponIdx];
    this.vmGunHolder = this.weaponCache.createMesh(this.weaponIdx, true);
    this.vmRoot.add(this.vmGunHolder);
    this.muzzleNode.position.set(
      spec.muzzleLocal[0] * spec.vmScale,
      spec.muzzleLocal[1] * spec.vmScale,
      spec.muzzleLocal[2] * spec.vmScale,
    );
  }

  private spawnPlayer(): void {
    let best = SPAWN_POINTS[0];
    let bestScore = -1;
    for (const sp of SPAWN_POINTS) {
      let minDist = 99;
      this.remotes.forEach((r) => {
        minDist = Math.min(minDist, Math.hypot(r.pos.x - sp[0], r.pos.z - sp[1]));
      });
      this.botManager.bots.forEach((b) => {
        minDist = Math.min(minDist, Math.hypot(b.pos.x - sp[0], b.pos.z - sp[1]));
      });
      const score = minDist + Math.random() * 8;
      if (score > bestScore) {
        bestScore = score;
        best = sp;
      }
    }
    this.pos.set(best[0], 0, best[1]);
    this.vel.set(0, 0, 0);
    // Face inward toward arena center (0, 0)
    this.yaw = Math.atan2(best[0], best[1]);
    this.pitch = 0;
    this.hp = 100;
    this.deadTimer = 0;
    this.slideTimer = 0;
    this.recoilCamPitch = 0;
    this.recoilCamYaw = 0;
    this.reloadTimer = 0;
    this.ammo = WEAPON_SPECS.map((w) => w.mag);
    this.emitHud();
  }

  private movePlayer(dt: number): void {
    const forwardInput =
      (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) -
      (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0) +
      this.touchMoveY;
    const strafeInput =
      (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) -
      (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0) +
      this.touchMoveX;

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    let wx = -sinY * forwardInput + cosY * strafeInput;
    let wz = -cosY * forwardInput - sinY * strafeInput;
    const len = Math.hypot(wx, wz);
    if (len > 1e-4) {
      const clampLen = Math.min(1, len);
      wx = (wx / len) * clampLen;
      wz = (wz / len) * clampLen;
    }

    this.slideCooldown = Math.max(0, this.slideCooldown - dt);

    if (this.slideTimer > 0) {
      this.slideTimer -= dt;
      this.slideSpeed = Math.max(this.slideSpeed - 10 * dt, 3.2);
      if (len > 0.05) {
        _slideWish.set(wx, 0, wz).normalize();
        this.slideDir.lerp(_slideWish, Math.min(1, 2.2 * dt)).normalize();
      }
      this.vel.x = this.slideDir.x * this.slideSpeed;
      this.vel.z = this.slideDir.z * this.slideSpeed;
      if (this.onGround && Math.random() < 0.45) {
        this.burstParticles(_slideBurst.set(this.pos.x, 0.05, this.pos.z), 1, [0.68, 0.56, 0.4], 1.4, 0.45);
      }
      if (this.slideTimer <= 0) {
        this.slideCooldown = 0.45;
      }
    } else {
      const sprinting = (this.keys.ShiftLeft || forwardInput > 0.85) && forwardInput > 0.1 && !this.adsActive;
      const maxSpeed = (sprinting ? 7.6 : 5.2) * (this.adsActive ? 0.64 : 1);
      const accel = Math.min(1, (this.onGround ? 15 : 3.5) * dt);
      this.vel.x += (wx * maxSpeed - this.vel.x) * accel;
      this.vel.z += (wz * maxSpeed - this.vel.z) * accel;
    }

    if (this.keys.Space && this.onGround) {
      this.triggerJump();
    }

    this.vel.y -= 24 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y = Math.max(0, this.pos.y + this.vel.y * dt);

    resolvePlayerCollisions(this.pos, this.vel, this.arenaMap.colliders, 0.4);
    const groundY = resolvePlayerCollisions(this.pos, this.vel, this.arenaMap.colliders, 0.4);

    if (this.pos.y <= groundY + 0.002 && this.vel.y <= 0) {
      if (!this.onGround && this.vel.y < -6.5) {
        soundEngine.footstep();
        this.burstParticles(_slideBurst.set(this.pos.x, groundY + 0.04, this.pos.z), 7, [0.7, 0.6, 0.45], 2.2, 0.4);
      }
      this.pos.y = groundY;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && horizSpeed > 1.1 && this.slideTimer <= 0) {
      this.bobPhase += dt * horizSpeed * 1.45;
      this.stepAccum += dt * horizSpeed;
      if (this.stepAccum > 2.55) {
        this.stepAccum = 0;
        soundEngine.footstep();
      }
    }
  }

  private tryShoot(): void {
    const spec = WEAPON_SPECS[this.weaponIdx];
    if (this.deadTimer > 0 || this.reloadTimer > 0 || this.fireCooldown > 0 || this.swapTimer > 0.08) {
      return;
    }
    if (this.ammo[this.weaponIdx] <= 0) {
      this.triggerReload();
      return;
    }

    this.ammo[this.weaponIdx]--;
    this.fireCooldown = 60 / spec.rpm;

    const moveSpeed = Math.hypot(this.vel.x, this.vel.z);
    const spread =
      spec.spread *
      (this.adsActive ? spec.adsSpreadMul : 1) *
      (1 + Math.min(moveSpeed / 7, 1) * 0.8) *
      (this.onGround ? 1 : 1.55);

    this.camera.updateMatrixWorld(true);
    this.camera.getWorldDirection(_dir);
    _dir.x += (Math.random() - 0.5) * spread * 2;
    _dir.y += (Math.random() - 0.5) * spread * 2;
    _dir.z += (Math.random() - 0.5) * spread * 2;
    _dir.normalize();

    _org.copy(this.camera.position);
    this.muzzleNode.getWorldPosition(_muz);

    let bestT = 200;
    let hitWall = false;
    for (const c of this.arenaMap.colliders) {
      const t = raycastOBB(_org, _dir, c, _norm);
      if (t !== null && t < bestT) {
        bestT = t;
        _hitNorm.copy(_norm);
        hitWall = true;
      }
    }
    if (_dir.y < -1e-5) {
      const tg = -_org.y / _dir.y;
      if (tg > 0 && tg < bestT) {
        bestT = tg;
        _hitNorm.set(0, 1, 0);
        hitWall = true;
      }
    }

    let hitRemote: RemotePeerState | null = null;
    let hitBot: BotActor | null = null;
    let headshot = false;

    const testCylinder = (targetPos: THREE.Vector3, height: number): { t: number; head: boolean } | null => {
      const dx = _org.x - targetPos.x;
      const dz = _org.z - targetPos.z;
      const a = _dir.x * _dir.x + _dir.z * _dir.z;
      if (a < 1e-8) return null;
      const b = 2 * (dx * _dir.x + dz * _dir.z);
      const c = dx * dx + dz * dz - 0.24;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0) return null;
      const y = _org.y + _dir.y * t - targetPos.y;
      if (y < 0 || y > height) return null;
      return { t, head: y > height - 0.36 };
    };

    this.remotes.forEach((r) => {
      if (r.hp <= 0) return;
      const res = testCylinder(r.pos, r.sliding ? 1.05 : 1.75);
      if (res && res.t < bestT) {
        bestT = res.t;
        hitRemote = r;
        hitBot = null;
        headshot = res.head;
        hitWall = false;
      }
    });

    for (const bot of this.botManager.bots) {
      if (bot.hp <= 0 || bot.respawnTimer > 0) continue;
      const res = testCylinder(bot.pos, 1.75);
      if (res && res.t < bestT) {
        bestT = res.t;
        hitBot = bot;
        hitRemote = null;
        headshot = res.head;
        hitWall = false;
      }
    }

    _end.copy(_org).addScaledVector(_dir, bestT);
    this.spawnTracer(_muz, _end);
    this.muzzleFlash.visible = true;
    this.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    this.flashTimer = 0.04;
    this.muzzleLight.intensity = 2.2;
    soundEngine.shot(spec.soundType, 1);

    // Snappy minimal arcade recoil (light kick + smooth spring return)
    const adsFactor = this.adsActive ? 0.65 : 1.0;
    this.recoilCamPitch = Math.min(0.11, this.recoilCamPitch + spec.recoilPitch * adsFactor);
    this.recoilCamYaw += (Math.random() - 0.5) * spec.recoilYaw * adsFactor;
    this.vmKick = Math.min(1.2, this.vmKick + 0.72);
    this.screenShake = Math.min(0.12, this.screenShake + spec.recoilPitch * 2.2);

    const dmg = Math.round(spec.damage * (headshot ? 1.85 : 1) * (bestT > 45 ? 0.78 : 1));

    if (hitBot) {
      this.burstParticles(_end, 14, [1, 0.16, 0.12], 3.2, 0.45);
      this.showHitMarker(headshot);
      hitBot.hp -= dmg;
      if (hitBot.hp <= 0) {
        hitBot.hp = 0;
        hitBot.deaths++;
        hitBot.respawnTimer = 3.0;
        hitBot.visual.root.visible = false;
        this.me.kills++;
        this.pushKillFeed(this.me.name, hitBot.name, spec.name, headshot);
      }
    } else if (hitRemote) {
      const target = hitRemote as RemotePeerState;
      this.burstParticles(_end, 14, [1, 0.16, 0.12], 3.2, 0.45);
      this.showHitMarker(headshot);
      this.p2p.send({ t: 'h', to: target.id, d: dmg, hd: headshot ? 1 : 0 });
    } else if (hitWall) {
      this.burstParticles(_end, 9, [1, 0.82, 0.42], 2.8, 0.32);
      this.spawnDecal(_end, _hitNorm);
    }

    this.p2p.send({
      t: 'f',
      m: [_muz.x, _muz.y, _muz.z],
      e: [_end.x, _end.y, _end.z],
      w: this.weaponIdx,
      h: hitRemote ? 1 : 0,
    });

    this.emitHud();
  }

  private showHitMarker(headshot: boolean): void {
    this.hitMarker = headshot ? 'head' : 'body';
    this.hitMarkerTimer = 0.16;
    soundEngine.hitmarker(headshot);
  }

  private pushKillFeed(killer: string, victim: string, weapon: string, headshot: boolean): void {
    this.killFeed.unshift({
      id: this.killFeedSeq++,
      killer,
      victim,
      weapon,
      headshot,
      timestamp: performance.now(),
    });
    if (this.killFeed.length > 5) this.killFeed.pop();
    this.emitHud();
  }

  private applyDamageToPlayer(dmg: number, attackerName: string, weaponName: string, headshot: boolean): void {
    if (this.deadTimer > 0) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.damageFlash = 1.0;
    this.screenShake = Math.min(0.28, this.screenShake + 0.16);
    soundEngine.tone(175, 85, 0.12, 0.25, 'sawtooth');
    if (this.hp <= 0) {
      this.deadTimer = 3.0;
      this.me.deaths++;
      this.slideTimer = 0;
      soundEngine.death();
      this.pushKillFeed(attackerName, this.me.name, weaponName, headshot);
    }
    this.emitHud();
  }

  // ---- Remote P2P Synchronization ----

  private getOrCreateRemote(id: number, name: string): RemotePeerState {
    const existing = this.remotes.get(id);
    if (existing) return existing;
    const visual = createCombatantVisual(name, 0x3b5875, 0, this.weaponCache);
    this.scene.add(visual.root);
    const state: RemotePeerState = {
      id,
      name,
      pos: new THREE.Vector3(),
      targetPos: new THREE.Vector3(),
      yaw: 0,
      targetYaw: 0,
      pitch: 0,
      hp: 100,
      kills: 0,
      deaths: 0,
      weaponIdx: 0,
      sliding: false,
      visual,
    };
    this.remotes.set(id, state);
    this.emitHud();
    return state;
  }

  private removeRemote(id: number): void {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.visual.root);
    r.visual.dispose();
    this.remotes.delete(id);
    this.emitHud();
  }

  private handleP2PMessage(m: P2PMessage): void {
    switch (m.t) {
      case 's': {
        if (m.from === undefined) return;
        const r = this.getOrCreateRemote(m.from, String(m.n || 'Player').slice(0, 14));
        r.name = String(m.n || 'Player').slice(0, 14);
        r.targetPos.set(m.p[0], m.p[1], m.p[2]);
        r.targetYaw = m.r;
        r.pitch = m.q;
        r.sliding = Boolean(m.sl);
        r.hp = m.hp;
        r.visual.root.visible = r.hp > 0;
        if (r.weaponIdx !== m.w && m.w >= 0 && m.w < WEAPON_SPECS.length) {
          r.weaponIdx = m.w;
          r.visual.setWeapon(m.w, this.weaponCache);
        }
        r.visual.updateLabel(r.name, r.hp);
        break;
      }
      case 'f': {
        _muz.set(m.m[0], m.m[1], m.m[2]);
        _end.set(m.e[0], m.e[1], m.e[2]);
        this.spawnTracer(_muz, _end);
        const dist = this.pos.distanceTo(_muz);
        const spec = WEAPON_SPECS[m.w] ?? WEAPON_SPECS[0];
        soundEngine.shot(spec.soundType, Math.max(0.08, 1 - dist / 55));
        break;
      }
      case 'h': {
        if (m.to !== this.p2p.myId || this.deadTimer > 0) return;
        const attacker = m.from !== undefined ? this.remotes.get(m.from) : undefined;
        const spec = attacker ? WEAPON_SPECS[attacker.weaponIdx] : WEAPON_SPECS[0];
        const prevHp = this.hp;
        this.applyDamageToPlayer(m.d, attacker?.name ?? 'Enemy', spec.name, Boolean(m.hd));
        if (prevHp > 0 && this.hp <= 0) {
          this.p2p.send({
            t: 'k',
            k: m.from ?? 0,
            v: this.p2p.myId,
            w: attacker?.weaponIdx ?? 0,
            hd: m.hd,
          });
        }
        break;
      }
      case 'k': {
        if (m.k === this.p2p.myId && m.v !== this.p2p.myId) {
          this.me.kills++;
        } else if (m.k !== m.v) {
          const killer = this.remotes.get(m.k);
          if (killer) killer.kills++;
        }
        if (m.v !== this.p2p.myId) {
          const victim = this.remotes.get(m.v);
          if (victim) {
            victim.deaths++;
            victim.hp = 0;
            victim.visual.root.visible = false;
          }
        }
        const killerName = m.k === this.p2p.myId ? this.me.name : this.remotes.get(m.k)?.name ?? 'Player';
        const victimName = m.v === this.p2p.myId ? this.me.name : this.remotes.get(m.v)?.name ?? 'Player';
        const wName = WEAPON_SPECS[m.w ?? 0]?.name ?? 'Weapon';
        this.pushKillFeed(killerName, victimName, wName, Boolean(m.hd));
        break;
      }
      case 'bye': {
        this.removeRemote(m.id);
        break;
      }
    }
  }

  // ---- VFX Helpers ----

  private burstParticles(
    origin: THREE.Vector3,
    count: number,
    col: [number, number, number],
    speed: number,
    life: number,
  ): void {
    for (let k = 0; k < count; k++) {
      const i = this.partCursor++ % this.MAX_PARTICLES;
      this.partPos[i * 3] = origin.x;
      this.partPos[i * 3 + 1] = origin.y;
      this.partPos[i * 3 + 2] = origin.z;
      this.partVel[i * 3] = (Math.random() - 0.5) * speed;
      this.partVel[i * 3 + 1] = (Math.random() - 0.15) * speed;
      this.partVel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      this.partMaxCol[i * 3] = col[0];
      this.partMaxCol[i * 3 + 1] = col[1];
      this.partMaxCol[i * 3 + 2] = col[2];
      this.partMaxLife[i] = this.partLife[i] = life * (0.6 + Math.random() * 0.4);
    }
  }

  private spawnTracer(a: THREE.Vector3, b: THREE.Vector3): void {
    const dist = a.distanceTo(b);
    if (dist < 0.4) return;
    const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.scale.z = dist;
    mesh.lookAt(b);
    this.scene.add(mesh);
    this.tracers.push({ mesh, ttl: 0.055 });
  }

  private spawnDecal(pos: THREE.Vector3, normal: THREE.Vector3): void {
    if (normal.y < -0.5) return;
    const mesh = new THREE.Mesh(this.decalGeo, this.decalMat);
    mesh.position.copy(pos).addScaledVector(normal, 0.014);
    mesh.lookAt(_end.copy(pos).add(normal));
    this.scene.add(mesh);
    this.decals.push(mesh);
    if (this.decals.length > 42) {
      const old = this.decals.shift();
      if (old) this.scene.remove(old);
    }
  }

  // ---- Input Handlers ----

  private handleResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private handlePointerLockChange(): void {
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.pointerLocked = locked;
    if (locked) {
      this.softLocked = false;
      this.setPlaying(true);
    } else if (!this.softLocked) {
      this.setPlaying(false);
      if (this.started) this.onPauseRequested();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Escape' && this.softLocked && this.playing) {
      this.pauseToMenu();
      return;
    }
    if (!this.playing) return;
    this.keys[e.code] = true;
    if (/^(Space|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Tab)$/.test(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'KeyR') this.triggerReload();
    if (/^Digit[1-7]$/.test(e.code)) this.selectWeapon(Number(e.code[5]) - 1);
    if ((e.code === 'KeyC' || e.code === 'ControlLeft') && !e.repeat) this.triggerSlide();
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys[e.code] = false;
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.playing) return;
    const base = this.adsActive ? 0.0014 : 0.0021;
    const sens = base * this.settings.sensitivity * (this.adsActive ? this.settings.adsMultiplier : 1);
    this.yaw -= e.movementX * sens;
    this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch - e.movementY * sens));
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.playing) return;
    if (e.button === 0) {
      this.mouseDown = true;
      if (!WEAPON_SPECS[this.weaponIdx].auto) this.tryShoot();
    } else if (e.button === 2) {
      this.adsActive = true;
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) this.mouseDown = false;
    if (e.button === 2) this.adsActive = false;
  }

  private handleWheel(e: WheelEvent): void {
    if (!this.playing) return;
    this.selectWeapon((this.weaponIdx + (e.deltaY > 0 ? 1 : WEAPON_SPECS.length - 1)) % WEAPON_SPECS.length);
  }

  // ---- Main Loop & Software-GL Pacing ----

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick(): void {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const spec = WEAPON_SPECS[this.weaponIdx];

    if (this.playing && this.deadTimer <= 0) {
      this.movePlayer(dt);
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      if ((this.mouseDown || this.touchFiring) && spec.auto) {
        this.tryShoot();
      }
      if (this.reloadTimer > 0) {
        this.reloadTimer -= dt;
        if (this.reloadTimer <= 0) {
          this.reloadTimer = 0;
          this.ammo[this.weaponIdx] = spec.mag;
          this.emitHud();
        }
      }
    } else if (this.deadTimer > 0) {
      this.deadTimer = Math.max(0, this.deadTimer - dt);
      if (this.deadTimer <= 0) {
        this.spawnPlayer();
      }
    }

    // Update local AI bots when in Solo mode
    if (this.playing && this.p2p.connectedCount === 0) {
      this.botManager.update(
        dt,
        this.pos,
        this.deadTimer > 0,
        this.arenaMap.colliders,
        (bot, muz, end, hitPlayer, dmg, head) => {
          this.spawnTracer(muz, end);
          const dist = this.pos.distanceTo(muz);
          soundEngine.shot(WEAPON_SPECS[bot.weaponIdx].soundType, Math.max(0.1, 1 - dist / 50));
          if (hitPlayer && dmg > 0) {
            this.applyDamageToPlayer(dmg, bot.name, WEAPON_SPECS[bot.weaponIdx].name, head);
            if (this.hp <= 0) bot.kills++;
          } else {
            this.burstParticles(end, 6, [1, 0.8, 0.4], 2.4, 0.25);
          }
        },
      );
    }

    // Smooth recoil spring recovery & viewmodel animations
    this.swapTimer = Math.max(0, this.swapTimer - dt);
    this.vmKick = THREE.MathUtils.damp(this.vmKick, 0, 20, dt);
    this.recoilCamPitch = THREE.MathUtils.damp(this.recoilCamPitch, 0, spec.recoilRecovery, dt);
    this.recoilCamYaw = THREE.MathUtils.damp(this.recoilCamYaw, 0, spec.recoilRecovery, dt);
    this.screenShake = Math.max(0, this.screenShake - dt * 1.8);
    this.adsMix = THREE.MathUtils.damp(this.adsMix, this.adsActive && this.reloadTimer <= 0 ? 1 : 0, 16, dt);

    const targetEye = this.slideTimer > 0 ? 0.88 : 1.62;
    this.eyeHeight = THREE.MathUtils.damp(this.eyeHeight, targetEye, 13, dt);

    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    const bobOffset = Math.sin(this.bobPhase * 2) * 0.018 * Math.min(horizSpeed / 5, 1.3) * (1 - this.adsMix * 0.7);

    // Camera position & rotation (orbit smoothly in background before deploying)
    if (!this.started) {
      const t = now * 0.00018;
      this.camera.position.set(Math.cos(t) * 26, 13, Math.sin(t) * 26);
      this.camera.lookAt(0, 1.5, 0);
      this.vmRoot.visible = false;
    } else {
      this.vmRoot.visible = this.deadTimer <= 0;
      this.camera.position.set(
        this.pos.x,
        this.pos.y + this.eyeHeight + bobOffset + (this.deadTimer > 0 ? -0.65 : 0),
        this.pos.z,
      );
      const strafeTilt = (this.keys.KeyD ? -0.01 : 0) + (this.keys.KeyA ? 0.01 : 0);
      const roll = this.slideTimer > 0 ? 0.065 : this.deadTimer > 0 ? 0.85 : strafeTilt;
      this.camera.rotation.set(
        this.pitch + this.recoilCamPitch + (Math.random() - 0.5) * this.screenShake * 0.025,
        this.yaw + this.recoilCamYaw + (Math.random() - 0.5) * this.screenShake * 0.025,
        roll,
      );
    }

    // Dynamic FOV (ADS zoom + sprint/slide sense of speed)
    const baseFov = this.settings.fov;
    const isSprinting = (this.keys.ShiftLeft || this.touchMoveY > 0.85) && horizSpeed > 5.3 && !this.adsActive;
    const targetFov = this.adsActive
      ? baseFov * 0.68
      : this.slideTimer > 0
        ? Math.min(106, baseFov + 11)
        : isSprinting
          ? Math.min(102, baseFov + 5)
          : baseFov;
    const nextFov = THREE.MathUtils.damp(this.camera.fov, targetFov, 12, dt);
    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    // Viewmodel positioning (hip -> ADS sight alignment + tactical gloved arms)
    const reloadSin =
      this.reloadTimer > 0 ? Math.sin(Math.min(1, 1 - this.reloadTimer / spec.reloadTime) * Math.PI) : 0;
    const hipX = spec.hipPos[0] + Math.sin(this.bobPhase) * 0.005 * (horizSpeed / 5);
    const hipY = spec.hipPos[1] + Math.abs(Math.cos(this.bobPhase)) * 0.006 * (horizSpeed / 5);
    const hipZ = spec.hipPos[2];

    const vmX = THREE.MathUtils.lerp(hipX, spec.adsPos[0], this.adsMix);
    const vmY =
      THREE.MathUtils.lerp(hipY, spec.adsPos[1], this.adsMix) -
      this.swapTimer * 0.45 -
      reloadSin * 0.14 -
      (this.slideTimer > 0 ? 0.04 : 0);
    const vmZ = THREE.MathUtils.lerp(hipZ, spec.adsPos[2], this.adsMix) + this.vmKick * spec.vmKickZ;

    this.vmRoot.position.set(vmX, vmY, vmZ);
    this.vmRoot.rotation.set(
      this.vmKick * spec.vmKickRot - reloadSin * 0.65 + (isSprinting ? -0.1 : 0),
      isSprinting ? 0.18 : 0,
      this.slideTimer > 0 ? -0.22 : 0,
    );

    this.armsRig.update(spec, reloadSin, this.vmKick, this.adsMix, dt);

    // Muzzle flash decay
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.muzzleFlash.visible = false;
        this.muzzleLight.intensity = 0;
      }
    }

    // Hitmarker & damage vignette decay
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= dt;
      if (this.hitMarkerTimer <= 0) this.hitMarker = 'none';
    }
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.4);

    // Update particles
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      if (this.partLife[i] > 0) {
        this.partLife[i] -= dt;
        this.partVel[i * 3 + 1] -= 9 * dt;
        this.partPos[i * 3] += this.partVel[i * 3] * dt;
        this.partPos[i * 3 + 1] = Math.max(0, this.partPos[i * 3 + 1] + this.partVel[i * 3 + 1] * dt);
        this.partPos[i * 3 + 2] += this.partVel[i * 3 + 2] * dt;
        const fade = Math.max(0, this.partLife[i] / this.partMaxLife[i]);
        this.partCol[i * 3] = this.partMaxCol[i * 3] * fade;
        this.partCol[i * 3 + 1] = this.partMaxCol[i * 3 + 1] * fade;
        this.partCol[i * 3 + 2] = this.partMaxCol[i * 3 + 2] * fade;
      } else {
        this.partCol[i * 3] = this.partCol[i * 3 + 1] = this.partCol[i * 3 + 2] = 0;
      }
    }
    this.partGeo.attributes.position.needsUpdate = true;
    this.partGeo.attributes.color.needsUpdate = true;

    // Update tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].ttl -= dt;
      if (this.tracers[i].ttl <= 0) {
        this.scene.remove(this.tracers[i].mesh);
        this.tracers.splice(i, 1);
      }
    }

    // Interpolate remote P2P players
    this.remotes.forEach((r) => {
      const k = Math.min(1, 14 * dt);
      r.pos.lerp(r.targetPos, k);
      r.yaw += shortestAngleDiff(r.yaw, r.targetYaw) * k;
      r.visual.root.position.copy(r.pos);
      r.visual.root.rotation.y = r.yaw;
      r.visual.root.scale.y = r.sliding ? 0.65 : 1;
    });

    // Periodic P2P state broadcast (20 Hz)
    this.netSyncAccum += dt;
    if (this.netSyncAccum >= 0.05) {
      this.netSyncAccum = 0;
      if (this.started && this.p2p.connectedCount > 0) {
        this.p2p.send({
          t: 's',
          n: this.me.name,
          p: [Number(this.pos.x.toFixed(2)), Number(this.pos.y.toFixed(2)), Number(this.pos.z.toFixed(2))],
          r: Number(this.yaw.toFixed(3)),
          q: Number(this.pitch.toFixed(3)),
          w: this.weaponIdx,
          sl: this.slideTimer > 0 ? 1 : 0,
          hp: this.hp,
        });
      }
    }

    // Periodic HUD refresh (~20 Hz) so React HUD stays crisp without choking frames
    this.hudSyncAccum += dt;
    if (this.hudSyncAccum >= 0.05) {
      this.hudSyncAccum = 0;
      this.emitHud();
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextTick();
  }

  private emitHud(): void {
    const spec = WEAPON_SPECS[this.weaponIdx];
    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    const rawGap =
      (6 + horizSpeed * 1.15 + (this.onGround ? 0 : 7) + this.vmKick * 4) * (this.adsActive ? 0.45 : 1);

    const rows: CombatantHudRow[] = [
      {
        id: 'me',
        name: this.me.name,
        kills: this.me.kills,
        deaths: this.me.deaths,
        isMe: true,
        isBot: false,
        hp: this.hp,
      },
    ];
    this.remotes.forEach((r) => {
      rows.push({
        id: `p-${r.id}`,
        name: r.name,
        kills: r.kills,
        deaths: r.deaths,
        isMe: false,
        isBot: false,
        hp: r.hp,
      });
    });
    for (const b of this.botManager.bots) {
      rows.push({
        id: b.id,
        name: b.name,
        kills: b.kills,
        deaths: b.deaths,
        isMe: false,
        isBot: true,
        hp: b.hp,
      });
    }
    rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

    // Expire old killfeed entries after 5 seconds
    const now = performance.now();
    this.killFeed = this.killFeed.filter((k) => now - k.timestamp < 5200);

    this.onHudUpdate({
      hp: Math.max(0, Math.round(this.hp)),
      maxHp: 100,
      ammo: this.ammo[this.weaponIdx],
      mag: spec.mag,
      weaponIdx: this.weaponIdx,
      weaponName: spec.name,
      reloading: this.reloadTimer > 0,
      reloadProgress: this.reloadTimer > 0 ? 1 - this.reloadTimer / spec.reloadTime : 0,
      ads: this.adsActive,
      sliding: this.slideTimer > 0,
      sprinting: (this.keys.ShiftLeft || this.touchMoveY > 0.85) && horizSpeed > 5.3 && !this.adsActive,
      deadSeconds: this.deadTimer > 0 ? Math.ceil(this.deadTimer) : 0,
      crosshairGap: Math.round(rawGap),
      hitMarker: this.hitMarker,
      damageFlash: this.damageFlash,
      scoreboard: rows,
      killFeed: [...this.killFeed],
      pointerLocked: this.pointerLocked,
      playing: this.playing,
      started: this.started,
      mapReady: this.mapReady,
      weaponsReady: this.weaponsReady,
      peerCount: this.p2p.connectedCount,
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('blur', this.onBlurBound);
    window.removeEventListener('mousemove', this.onMouseMoveBound);
    window.removeEventListener('mousedown', this.onMouseDownBound);
    window.removeEventListener('mouseup', this.onMouseUpBound);
    window.removeEventListener('wheel', this.onWheelBound);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenuBound);

    this.botManager.dispose();
    this.remotes.forEach((r) => r.visual.dispose());
    this.remotes.clear();
    this.arenaMap.dispose();
    this.weaponCache.dispose();
    this.p2p.dispose();
    this.partGeo.dispose();
    this.tracerGeo.dispose();
    this.tracerMat.dispose();
    this.decalGeo.dispose();
    this.decalMat.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
