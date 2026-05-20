/**
 * PianoKeySparkFX
 * ---------------
 * Sprite-based per-keypress splash FX with multiple visual variants. Pick a
 * variant via `setVariant(name)`; the same particle pool + update loop is
 * reused, each particle just carries its own per-frame `tick` strategy.
 *
 * Variants:
 *   - 'spark'    : warm anime-style flame burst (original)
 *   - 'fog'      : soft bright fog puffs, key-sized
 *   - 'cartoon'  : triangular cartoon fire, key-wide x ~12px tall base
 *   - 'ash'      : tiny wood-ash flakes drifting up with sideways sway
 *   - 'sparkles' : tiny twinkling stars popping outward
 */
class PianoKeySparkFX {
  constructor(app, options = {}) {
    this.app = app;
    this.keyCount = options.keyCount || 88;
    this.maxSparks = Math.min(options.maxSparks || 256, 256);

    this.flames = [];
    this._textures = {};
    this._ensureTextures();

    this.container = new PIXI.Container();
    this.sprite = this.container;
    this.sprite.blendMode = (PIXI.BLEND_MODES && PIXI.BLEND_MODES.ADD) || 'add';
    this.sprite.alpha = options.alpha ?? 1.0;
    app.stage.addChild(this.sprite);

    this.variant = options.variant || 'spark';
    this._applyVariantFilters();
  }

  setVariant(name) {
    const valid = ['spark', 'fog', 'cartoon', 'ash', 'sparkles'];
    this.variant = valid.includes(name) ? name : 'spark';
    const additive = (PIXI.BLEND_MODES && PIXI.BLEND_MODES.ADD) || 'add';
    const normal = (PIXI.BLEND_MODES && PIXI.BLEND_MODES.NORMAL) || 'normal';
    // Ash needs normal blending so dark greys read; fog & warm variants
    // pop best with additive.
    this.sprite.blendMode = (this.variant === 'ash') ? normal : additive;
    this._applyVariantFilters();
  }

  _applyVariantFilters() {
    if (this.variant === 'fog' && PIXI.BlurFilter) {
      try {
        this.container.filters = [new PIXI.BlurFilter({ strength: 6, quality: 4 })];
      } catch (e) {
        this.container.filters = [];
      }
    } else {
      this.container.filters = [];
    }
  }

  resize(width, height) {
    // No-op; container draws absolute coords. Kept for API compat.
    this._width = width;
    this._height = height;
  }

  triggerKey(index, x, y, velocity = 1.0) {
    const power = 0.7 + Math.max(0, Math.min(1, velocity)) * 0.7;
    switch (this.variant) {
      case 'fog':      this._spawnFog(x, y, power); break;
      case 'cartoon':  this._spawnCartoon(x, y, power); break;
      case 'ash':      this._spawnAsh(x, y, power); break;
      case 'sparkles': this._spawnSparkles(x, y, power); break;
      case 'spark':
      default:         this._spawnSpark(x, y, power); break;
    }
  }

  update(delta) {
    const dt = delta / 60;
    const next = [];
    for (let i = 0; i < this.flames.length; i++) {
      const s = this.flames[i];
      s.life -= dt;
      if (s.life <= 0) {
        if (s.parent) s.parent.removeChild(s);
        if (s.destroy) s.destroy();
        continue;
      }
      if (typeof s.tick === 'function') {
        s.tick(dt, s);
      }
      next.push(s);
    }
    this.flames = next;
  }

  // ---------- Variant: spark (original warm anime burst) ----------

  _spawnSpark(x, y, power) {
    // Base flat glow at the strike point
    const glow = new PIXI.Sprite(this._textures.baseGlow);
    glow.anchor.set(0.5);
    glow.x = x;
    glow.y = y;
    glow.alpha = 0.9;
    glow.scale.set(1.1 * power, 0.7 * power);
    glow.life = 0.35;
    glow.maxLife = glow.life;
    glow.tick = (dt, sp) => {
      const t = Math.max(0, sp.life / sp.maxLife);
      sp.alpha = t;
      sp.scale.x *= 0.96;
      sp.scale.y *= 0.96;
    };
    this.container.addChild(glow);
    this.flames.push(glow);

    // 6-10 flame petals shooting upward and sideways
    const count = 6 + ((Math.random() * 5) | 0);
    for (let i = 0; i < count; i++) {
      const s = new PIXI.Sprite(this._textures.flame);
      s.anchor.set(0.5, 0.8);
      s.x = x + (Math.random() - 0.5) * 8;
      s.y = y;
      const baseScale = 0.4 + Math.random() * 0.5;
      s.scale.set(baseScale * power, baseScale * power);
      s.alpha = 1.0;
      const angle = (Math.random() - 0.5) * 1.4 - Math.PI / 2;
      const speed = 80 + Math.random() * 120;
      const vx = Math.cos(angle) * speed * 0.6;
      const vy = Math.sin(angle) * speed;
      s.life = 0.35 + Math.random() * 0.25;
      s.maxLife = s.life;
      const tints = [0xfff0c4, 0xffd07a, 0xff9a3c, 0xff6f2a];
      s.tint = tints[(Math.random() * tints.length) | 0];
      s.rotation = (Math.random() - 0.5) * 0.5;
      const rotV = (Math.random() - 0.5) * 4;
      s.tick = (dt, sp) => {
        const t = Math.max(0, sp.life / sp.maxLife);
        sp.alpha = t;
        sp.x += vx * dt;
        sp.y += vy * dt;
        sp.rotation += rotV * dt;
        sp.scale.x *= 0.965;
        sp.scale.y *= 0.965;
      };
      this.container.addChild(s);
      this.flames.push(s);
    }
  }

  // ---------- Variant: fog (bright, visible, key-sized) ----------

  _spawnFog(x, y, power) {
    // White, opaque-looking puffs sized to roughly one key wide x one
    // note tall (~26 x 32 px). Higher peak alpha + pure white tint so it
    // actually reads on the dark background.
    const puffs = 4;
    const targetW = 56; // spans ~2x key width: own key + half-neighbour each side
    const targetH = 34;
    for (let i = 0; i < puffs; i++) {
      const s = new PIXI.Sprite(this._textures.fog);
      s.anchor.set(0.5);
      const tNorm = (i - (puffs - 1) / 2) / Math.max(1, puffs - 1);
      const offX = tNorm * targetW * 0.55 + (Math.random() - 0.5) * 6;
      // Sit on top of the keyboard: bias the cloud downward, with a
      // slight horizontal-band layout (puffs in the same Y range) so it
      // floats along the keyboard edge instead of plume-ing upward.
      const offY = 8 + (Math.random() - 0.5) * 4 + Math.abs(tNorm) * 2;
      s.x = x + offX;
      s.y = y + offY;
      const sx = (targetW / 192) * (0.95 + Math.random() * 0.2) * power;
      const sy = (targetH / 192) * (0.95 + Math.random() * 0.2) * power;
      s.scale.set(sx, sy);
      s.alpha = 0.0;
      s.tint = 0xffffff;
      s.life = 0.9 + Math.random() * 0.6;
      s.maxLife = s.life;
      // Gentle hover instead of fast rise so the cloud stays seated on
      // the keyboard top.
      const driftY = -2 - Math.random() * 3;
      const driftX = (Math.random() - 0.5) * 8;
      const grow = 0.5 + Math.random() * 0.5;
      const seed = Math.random() * Math.PI * 2;
      const peakAlpha = 0.475;
      s.tick = (dt, sp) => {
        const t = Math.max(0, sp.life / sp.maxLife);
        sp.alpha = Math.sin((1 - t) * Math.PI) * peakAlpha;
        const age = sp.maxLife - sp.life;
        sp.x += (driftX + Math.sin(age * 1.1 + seed) * 3) * dt;
        sp.y += driftY * dt;
        sp.scale.x += grow * dt * 0.025;
        sp.scale.y += grow * dt * 0.02;
        sp.rotation += dt * 0.2;
      };
      this.container.addChild(s);
      this.flames.push(s);
    }
  }

  // ---------- Variant: cartoon (12px tall base, key-wide) ----------

  _spawnCartoon(x, y, power) {
    // Spec: base of the fire is one key wide (~24px) and 12px tall.
    // Texture is 48 x 96; centre spike anchored at its base.
    const KEY_W = 24;
    const FIRE_H = 12;
    const sxKey = KEY_W / 48;   // ~0.5 -> texture is 48px wide
    const syKey = FIRE_H / 96;  // ~0.125 -> texture is 96px tall

    // Centre spike: full key width, 12px tall.
    const centre = new PIXI.Sprite(this._textures.spike);
    centre.anchor.set(0.5, 1.0); // anchor at base so it grows upward
    centre.x = x;
    centre.y = y;
    centre.scale.set(sxKey * power, syKey * power);
    centre.alpha = 1.0;
    centre.life = 0.22 + Math.random() * 0.06;
    centre.maxLife = centre.life;
    centre.tick = (dt, sp) => {
      const t = Math.max(0, sp.life / sp.maxLife);
      sp.alpha = t;
      const age = sp.maxLife - sp.life;
      // quick puff up, then settle
      const grow = age < 0.06 ? (1 + dt * 3.5) : (1 - dt * 1.6);
      sp.scale.x *= grow;
      sp.scale.y *= grow;
    };
    this.container.addChild(centre);
    this.flames.push(centre);

    // Flame silhouette picks one of two forms at random:
    //   - triangle : tightly packed spikes forming one cohesive flame
    //   - crown    : spikes splayed outward like a crown / sun rays
    const form = Math.random() < 0.5 ? 'crown' : 'triangle';
    const triangleFlanks = [
      { off: -0.42, rot: -0.42, k: 0.50, w: 0.34 },
      { off: -0.26, rot: -0.22, k: 0.70, w: 0.40 },
      { off:  0.26, rot:  0.22, k: 0.72, w: 0.40 },
      { off:  0.42, rot:  0.42, k: 0.52, w: 0.34 },
      { off: -0.12, rot: -0.08, k: 0.85, w: 0.40 },
      { off:  0.12, rot:  0.08, k: 0.85, w: 0.40 }
    ];
    const crownFlanks = [
      { off: -0.48, rot: -1.20, k: 0.55, w: 0.30 },
      { off: -0.32, rot: -0.75, k: 0.75, w: 0.32 },
      { off: -0.16, rot: -0.35, k: 0.92, w: 0.34 },
      { off:  0.16, rot:  0.35, k: 0.92, w: 0.34 },
      { off:  0.32, rot:  0.75, k: 0.75, w: 0.32 },
      { off:  0.48, rot:  1.20, k: 0.55, w: 0.30 }
    ];
    const flanks = form === 'crown' ? crownFlanks : triangleFlanks;
    for (const f of flanks) {
      const s = new PIXI.Sprite(this._textures.spike);
      s.anchor.set(0.5, 1.0);
      s.x = x + f.off * KEY_W;
      s.y = y;
      s.rotation = f.rot;
      const k = f.k * (0.92 + Math.random() * 0.16);
      s.scale.set(sxKey * f.w * power, syKey * k * power);
      s.alpha = 0.9;
      s.life = 0.18 + Math.random() * 0.08;
      s.maxLife = s.life;
      s.tick = (dt, sp) => {
        const t = Math.max(0, sp.life / sp.maxLife);
        sp.alpha = t;
        const age = sp.maxLife - sp.life;
        const grow = age < 0.05 ? (1 + dt * 3.5) : (1 - dt * 2.0);
        sp.scale.x *= grow;
        sp.scale.y *= grow;
      };
      this.container.addChild(s);
      this.flames.push(s);
    }
  }

  // ---------- Variant: ash (small wood-ash flakes) ----------

  _spawnAsh(x, y, power) {
    // Wood-ash style: very small irregular flakes (chip / sliver / speck),
    // rising on a wind sway. Smaller than embers.
    const count = 18 + ((Math.random() * 10) | 0);
    for (let i = 0; i < count; i++) {
      const warm = Math.random() < 0.18;
      const r = Math.random();
      const shape = r < 0.45 ? 'chip' : (r < 0.85 ? 'sliver' : 'speck');
      const tex = shape === 'sliver' ? this._textures.ashSliver
               : shape === 'speck'  ? this._textures.ashSpeck
                                    : this._textures.ashChip;
      const s = new PIXI.Sprite(tex);
      s.anchor.set(0.5);
      s.x = x + (Math.random() - 0.5) * 10;
      s.y = y + (Math.random() - 0.5) * 3;
      // Smaller wood-ash scales.
      const baseScale = shape === 'speck'
        ? (0.18 + Math.random() * 0.16)
        : shape === 'sliver'
          ? (0.22 + Math.random() * 0.18)
          : (0.18 + Math.random() * 0.18);
      s.scale.set(baseScale, baseScale);
      s.alpha = 0.0;
      s.rotation = Math.random() * Math.PI * 2;
      s.tint = warm
        ? (Math.random() < 0.5 ? 0xff7a2a : 0xffb060)
        : (Math.random() < 0.5 ? 0x3a3a40 : 0xb8b8c0);
      s.life = 2.2 + Math.random() * 2.2;
      s.maxLife = s.life;
      const vy = -48 - Math.random() * 60 * power;
      const seed = Math.random() * Math.PI * 2;
      const swayAmp = 22 + Math.random() * 30;
      const swayFreq = 0.8 + Math.random() * 0.9;
      const spinFreq = 2.0 + Math.random() * 2.5;
      const spinSeed = Math.random() * Math.PI * 2;
      const rotSpeed = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.4);
      const startX = s.x;
      const startY = s.y;
      s.tick = (dt, sp) => {
        const t = Math.max(0, sp.life / sp.maxLife);
        sp.alpha = Math.min(1.0, (1.0 - t) * 3.5) * t * 0.95;
        const age = sp.maxLife - sp.life;
        sp.y = startY + vy * age + age * age * 4.0;
        sp.x = startX
          + Math.sin(age * swayFreq + seed) * swayAmp
          + Math.sin(age * swayFreq * 2.3 + seed) * (swayAmp * 0.3);
        sp.rotation += dt * rotSpeed;
        const spin = Math.cos(age * spinFreq + spinSeed);
        sp.scale.x = Math.max(0.18, Math.abs(spin)) * baseScale;
        if (warm && t < 0.5) {
          const k = Math.max(0, t / 0.5);
          const c = Math.floor(0x40 + k * 0x90);
          sp.tint = (c << 16) | (c << 8) | c;
        }
      };
      this.container.addChild(s);
      this.flames.push(s);
    }
  }

  // ---------- Variant: sparkles (simple twinkle - reverted) ----------

  _spawnSparkles(x, y, power) {
    const count = 5 + ((Math.random() * 3) | 0);
    for (let i = 0; i < count; i++) {
      const s = new PIXI.Sprite(this._textures.star);
      s.anchor.set(0.5);
      s.x = x;
      s.y = y;
      s.alpha = 1.0;
      const baseScale = 0.18 + Math.random() * 0.18;
      s.scale.set(baseScale * power, baseScale * power);
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 60;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed * 0.6 - 20;
      s.life = 0.35 + Math.random() * 0.25;
      s.maxLife = s.life;
      s.tick = (dt, sp) => {
        const t = Math.max(0, sp.life / sp.maxLife);
        sp.alpha = t;
        sp.x += vx * dt;
        sp.y += vy * dt;
        sp.rotation += dt * 5.0;
        sp.scale.x *= 0.97;
        sp.scale.y *= 0.97;
      };
      this.container.addChild(s);
      this.flames.push(s);
    }
    // bright centre flash
    const flash = new PIXI.Sprite(this._textures.baseGlow);
    flash.anchor.set(0.5);
    flash.x = x;
    flash.y = y;
    flash.alpha = 1.0;
    flash.scale.set(0.9 * power, 0.5 * power);
    flash.life = 0.12;
    flash.maxLife = flash.life;
    flash.tick = (dt, sp) => {
      const t = Math.max(0, sp.life / sp.maxLife);
      sp.alpha = t;
      sp.scale.x *= 0.92;
      sp.scale.y *= 0.92;
    };
    this.container.addChild(flash);
    this.flames.push(flash);
  }

  // ---------- Procedural textures ----------

  _ensureTextures() {
    this._textures.flame = this._createFlameTexture();
    this._textures.baseGlow = this._createBaseGlowTexture();
    this._textures.fog = this._createFogTexture();
    this._textures.spike = this._createSpikeTexture();
    this._textures.ashChip = this._createAshChipTexture();
    this._textures.ashSliver = this._createAshSliverTexture();
    this._textures.ashSpeck = this._createAshSpeckTexture();
    this._textures.star = this._createStarTexture();
  }

  _createFlameTexture() {
    const w = 96;
    const h = 72;
    const g = new PIXI.Graphics();
    g.ellipse(w / 2, h * 0.7, w * 0.45, h * 0.42).fill({ color: 0xff7a2a, alpha: 1.0 });
    g.ellipse(w / 2, h * 0.55, w * 0.32, h * 0.32).fill({ color: 0xffc060, alpha: 1.0 });
    g.ellipse(w / 2, h * 0.45, w * 0.16, h * 0.18).fill({ color: 0xffffff, alpha: 1.0 });
    return this.app.renderer.generateTexture(g);
  }

  _createBaseGlowTexture() {
    const w = 80;
    const h = 28;
    const g = new PIXI.Graphics();
    g.ellipse(w / 2, h / 2, w * 0.48, h * 0.42).fill({ color: 0xff9050, alpha: 0.85 });
    g.ellipse(w / 2, h / 2, w * 0.28, h * 0.30).fill({ color: 0xffffff, alpha: 1.0 });
    return this.app.renderer.generateTexture(g);
  }

  _createFogTexture() {
    // Soft cloud silhouette: halo + several lobes + bright core. White.
    const size = 192;
    const g = new PIXI.Graphics();
    const c = size / 2;
    g.ellipse(c, c, size * 0.48, size * 0.40).fill({ color: 0xffffff, alpha: 0.35 });
    const lobes = [
      [-26, -8, 56, 50], [28, -10, 60, 54], [0, -20, 64, 50],
      [-16, 14, 50, 46], [18, 16, 52, 46], [0, 6, 70, 58]
    ];
    for (const [dx, dy, rx, ry] of lobes) {
      g.ellipse(c + dx, c + dy, rx, ry).fill({ color: 0xffffff, alpha: 0.75 });
    }
    g.ellipse(c, c, size * 0.22, size * 0.18).fill({ color: 0xffffff, alpha: 1.0 });
    return this.app.renderer.generateTexture(g);
  }

  _createSpikeTexture() {
    // Stacked triangles: red base, orange middle, yellow tip.
    const w = 48;
    const h = 96;
    const g = new PIXI.Graphics();
    g.moveTo(w / 2, 0);
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.closePath();
    g.fill({ color: 0xff4a1a, alpha: 1.0 });
    g.moveTo(w / 2, h * 0.18);
    g.lineTo(w * 0.86, h);
    g.lineTo(w * 0.14, h);
    g.closePath();
    g.fill({ color: 0xff9530, alpha: 1.0 });
    g.moveTo(w / 2, h * 0.45);
    g.lineTo(w * 0.72, h);
    g.lineTo(w * 0.28, h);
    g.closePath();
    g.fill({ color: 0xffe080, alpha: 1.0 });
    return this.app.renderer.generateTexture(g);
  }

  _createAshChipTexture() {
    // Irregular flake chip — asymmetric polygon with shadow + highlight.
    const size = 32;
    const g = new PIXI.Graphics();
    const c = size / 2;
    g.moveTo(c - 7, c + 8);
    g.lineTo(c + 9, c + 5);
    g.lineTo(c + 6, c - 6);
    g.lineTo(c - 4, c - 8);
    g.lineTo(c - 9, c - 1);
    g.closePath();
    g.fill({ color: 0x000000, alpha: 0.55 });
    g.moveTo(c - 8, c + 6);
    g.lineTo(c + 8, c + 3);
    g.lineTo(c + 5, c - 7);
    g.lineTo(c - 5, c - 9);
    g.lineTo(c - 10, c - 2);
    g.closePath();
    g.fill({ color: 0xffffff, alpha: 1.0 });
    g.moveTo(c - 5, c + 2);
    g.lineTo(c + 5, c + 1);
    g.lineTo(c + 3, c - 5);
    g.lineTo(c - 3, c - 6);
    g.closePath();
    g.fill({ color: 0xffffff, alpha: 0.55 });
    g.ellipse(c - 4, c - 4, 3, 2).fill({ color: 0xffffff, alpha: 1.0 });
    return this.app.renderer.generateTexture(g);
  }

  _createAshSliverTexture() {
    // Long thin charred splinter.
    const w = 40;
    const h = 10;
    const g = new PIXI.Graphics();
    g.ellipse(w / 2 + 1, h / 2 + 1, w * 0.46, h * 0.32).fill({ color: 0x000000, alpha: 0.5 });
    g.ellipse(w / 2, h / 2, w * 0.46, h * 0.32).fill({ color: 0xffffff, alpha: 1.0 });
    g.rect(w * 0.18, h * 0.45, w * 0.6, h * 0.1).fill({ color: 0x000000, alpha: 0.35 });
    g.ellipse(w * 0.28, h * 0.4, w * 0.08, h * 0.18).fill({ color: 0xffffff, alpha: 0.9 });
    return this.app.renderer.generateTexture(g);
  }

  _createAshSpeckTexture() {
    const size = 8;
    const g = new PIXI.Graphics();
    g.ellipse(size / 2 + 0.5, size / 2 + 0.5, size * 0.3, size * 0.3).fill({ color: 0x000000, alpha: 0.5 });
    g.ellipse(size / 2, size / 2, size * 0.3, size * 0.3).fill({ color: 0xffffff, alpha: 1.0 });
    return this.app.renderer.generateTexture(g);
  }

  _createStarTexture() {
    const size = 64;
    const g = new PIXI.Graphics();
    const c = size / 2;
    const arm = size * 0.46;
    const thin = size * 0.05;
    g.rect(c - arm, c - thin, arm * 2, thin * 2).fill({ color: 0xffffff, alpha: 0.9 });
    g.rect(c - thin, c - arm, thin * 2, arm * 2).fill({ color: 0xffffff, alpha: 0.9 });
    g.ellipse(c, c, size * 0.18, size * 0.18).fill({ color: 0xffffff, alpha: 1.0 });
    g.ellipse(c, c, size * 0.1, size * 0.1).fill({ color: 0xffffaa, alpha: 1.0 });
    return this.app.renderer.generateTexture(g);
  }
}

// Browser global registration (no module system in index.html)
if (typeof window !== 'undefined') {
  window.PianoKeySparkFX = PianoKeySparkFX;
}
