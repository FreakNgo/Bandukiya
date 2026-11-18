import * as THREE from 'three';
import type { ArenaOBB } from '../types/game';
import { createCombatantVisual, type CombatantVisual } from './avatars';
import { raycastOBB, resolvePlayerCollisions, SPAWN_POINTS } from './map';
import { WEAPON_SPECS, WeaponModelCache } from './weapons';

const BOT_CALLSIGNS = ['Viper', 'Kestrel', 'Nomad', 'Jackal', 'Cobra', 'Atlas'];
const BOT_COLORS = [0x944832, 0x3b5875, 0x5c6b3c, 0x6e4f73, 0x8a6d3b, 0x3d6b66];

const WAYPOINTS: ReadonlyArray<[number, number]> = [
  [0, 0],
  [-12, 0],
  [12, 0],
  [0, -14],
  [0, 14],
  [-26, -24],
  [26, -24],
  [-26, 24],
  [26, 24],
  [-10, -28],
  [10, 28],
  [-28, 4],
  [28, -4],
];

const _dir = new THREE.Vector3();
const _org = new THREE.Vector3();
const _norm = new THREE.Vector3();
const _muz = new THREE.Vector3();
const _end = new THREE.Vector3();

export interface BotActor {
  id: string;
  name: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  pitch: number;
  hp: number;
  kills: number;
  deaths: number;
  weaponIdx: number;
  respawnTimer: number;
  fireCooldown: number;
  strafeDir: number;
  strafeTimer: number;
  waypoint: [number, number];
  visual: CombatantVisual;
}

export class BotManager {
  bots: BotActor[] = [];

  constructor(
    private scene: THREE.Scene,
    private weaponCache: WeaponModelCache,
  ) {}

  syncCount(count: number): void {
    const clamped = Math.max(0, Math.min(6, count));
    while (this.bots.length > clamped) {
      const removed = this.bots.pop();
      if (removed) {
        this.scene.remove(removed.visual.root);
        removed.visual.dispose();
      }
    }
    while (this.bots.length < clamped) {
      const idx = this.bots.length;
      const name = BOT_CALLSIGNS[idx % BOT_CALLSIGNS.length];
      const wIdx = [0, 2, 4, 6, 5, 1][idx % 6];
      const visual = createCombatantVisual(
        name,
        BOT_COLORS[idx % BOT_COLORS.length],
        wIdx,
        this.weaponCache,
      );
      this.scene.add(visual.root);

      const bot: BotActor = {
        id: `bot-${idx}`,
        name,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        yaw: 0,
        pitch: 0,
        hp: 100,
        kills: 0,
        deaths: 0,
        weaponIdx: wIdx,
        respawnTimer: 0,
        fireCooldown: 0.8 + Math.random() * 1.2,
        strafeDir: Math.random() < 0.5 ? -1 : 1,
        strafeTimer: 1.5,
        waypoint: WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)],
        visual,
      };
      this.spawnBot(bot);
      this.bots.push(bot);
    }
  }

  refreshWeaponModels(): void {
    for (const bot of this.bots) {
      bot.visual.setWeapon(bot.weaponIdx, this.weaponCache);
    }
  }

  spawnBot(bot: BotActor, avoidPos?: THREE.Vector3): void {
    let best = SPAWN_POINTS[0];
    let bestScore = -1;
    for (const sp of SPAWN_POINTS) {
      const dist = avoidPos ? Math.hypot(sp[0] - avoidPos.x, sp[1] - avoidPos.z) : 20;
      const score = dist + Math.random() * 12;
      if (score > bestScore) {
        bestScore = score;
        best = sp;
      }
    }
    bot.pos.set(best[0], 0, best[1]);
    bot.vel.set(0, 0, 0);
    bot.hp = 100;
    bot.respawnTimer = 0;
    bot.fireCooldown = 0.6 + Math.random() * 0.8;
    bot.waypoint = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
    bot.visual.root.visible = true;
    bot.visual.root.position.copy(bot.pos);
    bot.visual.updateLabel(bot.name, bot.hp);
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerDead: boolean,
    colliders: ArenaOBB[],
    onBotShoot: (
      bot: BotActor,
      muz: THREE.Vector3,
      end: THREE.Vector3,
      hitPlayer: boolean,
      dmg: number,
      headshot: boolean,
    ) => void,
  ): void {
    for (const bot of this.bots) {
      if (bot.respawnTimer > 0) {
        bot.respawnTimer -= dt;
        if (bot.respawnTimer <= 0) {
          this.spawnBot(bot, playerPos);
        }
        continue;
      }

      bot.fireCooldown -= dt;
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = 1.1 + Math.random() * 1.4;
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }

      // Check line of sight to player
      let hasLos = false;
      const dxP = playerPos.x - bot.pos.x;
      const dzP = playerPos.z - bot.pos.z;
      const distP = Math.hypot(dxP, dzP);

      if (!playerDead && distP < 48 && distP > 0.5) {
        _org.set(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
        _dir.set(dxP, playerPos.y + 1.4 - (bot.pos.y + 1.45), dzP).normalize();
        let blocked = false;
        for (const c of colliders) {
          const t = raycastOBB(_org, _dir, c, _norm);
          if (t !== null && t < distP) {
            blocked = true;
            break;
          }
        }
        hasLos = !blocked;
      }

      let targetYaw = bot.yaw;
      let moveSpeed = 3.8;

      if (hasLos) {
        // Face player (Three.js -Z forward means yaw = atan2(-dx, -dz))
        targetYaw = Math.atan2(-dxP, -dzP);
        // Strafe and maintain tactical engagement distance
        const approach = distP > 15 ? 0.65 : distP < 7 ? -0.55 : 0;
        const fx = -Math.sin(targetYaw);
        const fz = -Math.cos(targetYaw);
        const rx = Math.cos(targetYaw);
        const rz = -Math.sin(targetYaw);
        const wx = fx * approach + rx * bot.strafeDir * 0.85;
        const wz = fz * approach + rz * bot.strafeDir * 0.85;
        const wl = Math.hypot(wx, wz) || 1;
        bot.vel.x += ((wx / wl) * 4.2 - bot.vel.x) * Math.min(1, 8 * dt);
        bot.vel.z += ((wz / wl) * 4.2 - bot.vel.z) * Math.min(1, 8 * dt);

        // Burst fire at player
        if (bot.fireCooldown <= 0) {
          const spec = WEAPON_SPECS[bot.weaponIdx];
          bot.fireCooldown = Math.max(0.22, (60 / spec.rpm) * (1.8 + Math.random() * 1.4));

          _org.set(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
          const aimSpread = 0.055 + Math.min(0.05, distP * 0.0012);
          _dir.set(
            dxP + (Math.random() - 0.5) * distP * aimSpread,
            playerPos.y + 1.32 - (bot.pos.y + 1.45) + (Math.random() - 0.5) * distP * aimSpread,
            dzP + (Math.random() - 0.5) * distP * aimSpread,
          ).normalize();

          // Check player hit (cylinder approx)
          let minT = 180;
          for (const c of colliders) {
            const t = raycastOBB(_org, _dir, c, _norm);
            if (t !== null && t < minT) minT = t;
          }

          // Ray vs player cylinder at playerPos
          const px = _org.x - playerPos.x;
          const pz = _org.z - playerPos.z;
          const a = _dir.x * _dir.x + _dir.z * _dir.z;
          let hitPlayer = false;
          let headshot = false;
          if (a > 1e-6) {
            const b = 2 * (px * _dir.x + pz * _dir.z);
            const c = px * px + pz * pz - 0.22;
            const disc = b * b - 4 * a * c;
            if (disc >= 0) {
              const tHit = (-b - Math.sqrt(disc)) / (2 * a);
              if (tHit > 0 && tHit < minT) {
                const hitY = _org.y + _dir.y * tHit - playerPos.y;
                if (hitY >= 0 && hitY <= 1.75) {
                  minT = tHit;
                  hitPlayer = true;
                  headshot = hitY > 1.38;
                }
              }
            }
          }

          _muz.set(bot.pos.x, bot.pos.y + 1.25, bot.pos.z);
          _end.copy(_org).addScaledVector(_dir, minT);
          const dmg = hitPlayer ? Math.round(spec.damage * (headshot ? 1.4 : 0.6)) : 0;
          onBotShoot(bot, _muz, _end, hitPlayer, dmg, headshot);
        }
      } else {
        // Patrol toward waypoint
        const wx = bot.waypoint[0] - bot.pos.x;
        const wz = bot.waypoint[1] - bot.pos.z;
        const distW = Math.hypot(wx, wz);
        if (distW < 2.2) {
          bot.waypoint = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
        } else {
          targetYaw = Math.atan2(-wx, -wz);
          bot.vel.x += ((wx / distW) * moveSpeed - bot.vel.x) * Math.min(1, 6 * dt);
          bot.vel.z += ((wz / distW) * moveSpeed - bot.vel.z) * Math.min(1, 6 * dt);
        }
      }

      // Smooth yaw interpolation
      let dyaw = ((targetYaw - bot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      bot.yaw += dyaw * Math.min(1, 9 * dt);

      bot.vel.y -= 24 * dt;
      const prevX = bot.pos.x;
      const prevZ = bot.pos.z;
      bot.pos.x += bot.vel.x * dt;
      bot.pos.z += bot.vel.z * dt;
      bot.pos.y = Math.max(0, bot.pos.y + bot.vel.y * dt);

      const gy = resolvePlayerCollisions(bot.pos, bot.vel, colliders, 0.42);
      if (bot.pos.y <= gy + 0.01 && bot.vel.y <= 0) {
        bot.pos.y = gy;
        bot.vel.y = 0;
      }

      // If stuck against a wall during patrol, pick a new waypoint
      if (!hasLos && Math.hypot(bot.pos.x - prevX, bot.pos.z - prevZ) < 0.008) {
        bot.waypoint = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
      }

      bot.visual.root.position.copy(bot.pos);
      bot.visual.root.rotation.y = bot.yaw;
      bot.visual.updateLabel(bot.name, bot.hp);
    }
  }

  dispose(): void {
    for (const bot of this.bots) {
      this.scene.remove(bot.visual.root);
      bot.visual.dispose();
    }
    this.bots = [];
  }
}
