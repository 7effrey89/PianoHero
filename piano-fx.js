// Unified FX shader (ribbon + splash + key glow) in one pass.
// Requires PixiJS to be loaded globally.

class UnifiedPianoFX {
    constructor(app) {
        this.app = app;
        this.maxSplashes = 32;
        this.keyCount = 88;
        this.duration = 2.2;

        this.splashes = new Float32Array(this.maxSplashes * 3);
        for (let i = 0; i < this.maxSplashes; i++) {
            this.splashes[i * 3 + 2] = -999;
        }
        this.activeKeys = new Float32Array(this.keyCount);
        this.keyCenters = new Float32Array(this.keyCount);
        for (let i = 0; i < this.keyCount; i++) {
            this.keyCenters[i] = (i + 0.5) / this.keyCount;
        }

        this.uniformGroup = new PIXI.UniformGroup({
            time: { value: 0, type: 'f32' },
            resolution: {
                value: [app.renderer.width, app.renderer.height],
                type: 'vec2<f32>',
            },
            splashes: {
                value: this.splashes,
                type: 'vec3<f32>',
                size: this.maxSplashes,
            },
            activeKeys: {
                value: this.activeKeys,
                type: 'f32',
                size: this.keyCount,
            },
            keyCenters: {
                value: this.keyCenters,
                type: 'f32',
                size: this.keyCount,
            },
            ribbonStrength: { value: 0.22, type: 'f32' },
            ribbonY: { value: 0.965, type: 'f32' },
            ribbonThickness: { value: 0.08, type: 'f32' },
            ribbonHue: { value: 0.08, type: 'f32' },
            ribbonSat: { value: 0.95, type: 'f32' },
            ribbonVal: { value: 1.0, type: 'f32' },
            glowlineStrength: { value: 0.6, type: 'f32' },
            glowlineY: { value: 0.97, type: 'f32' },
            glowlineThickness: { value: 0.02, type: 'f32' },
            glowlineHueStart: { value: 0.58, type: 'f32' },
            glowlineHueEnd: { value: 0.95, type: 'f32' },
            glowlineSat: { value: 0.95, type: 'f32' },
            glowlineVal: { value: 1.0, type: 'f32' },
            streamStrength: { value: 0.5, type: 'f32' },
            streamWidth: { value: 1.0, type: 'f32' },
            splashStrength: { value: 0.85, type: 'f32' },
            glowStrength: { value: 0.6, type: 'f32' },
            splashColor: { value: [1.0, 1.0, 1.0], type: 'vec3<f32>' },
            glowSpread: { value: 0.0, type: 'f32' },
            keyGlowStrength: { value: 1.0, type: 'f32' },
            keyGlowSat: { value: 0.7, type: 'f32' },
            keyGlowVal: { value: 1.0, type: 'f32' },
        });

        this.uniforms = this.uniformGroup.uniforms;

        const geometry = new PIXI.MeshGeometry(
            new Float32Array([
                -1, -1,
                1, -1,
                1, 1,
                -1, 1,
            ]),
            new Float32Array([
                0, 0,
                1, 0,
                1, 1,
                0, 1,
            ]),
            new Uint16Array([0, 1, 2, 0, 2, 3]),
        );

        const shader = PIXI.Shader.from({
            gl: {
                vertex: UnifiedPianoFX.vertex,
                fragment: UnifiedPianoFX.fragment,
            },
            resources: {
                uniforms: this.uniformGroup,
            },
        });

        this.mesh = new PIXI.Mesh(geometry, shader);
        this.mesh.blendMode = 'normal';
        this.mesh.alpha = 1.0;
        this.display = this.mesh;
    }

    triggerKey(keyIndex, x, y, velocity = 1) {
        const w = this.app.renderer.width || 1;
        const h = this.app.renderer.height || 1;
        const nx = x / w;
        const ny = y / h;
        const now = this.uniforms.time;

        let slot = -1;
        for (let i = 0; i < this.maxSplashes; i++) {
            const t = this.splashes[i * 3 + 2];
            if (now - t > this.duration) {
                slot = i;
                break;
            }
        }
        if (slot < 0) slot = 0;

        const base = slot * 3;
        this.splashes[base] = nx;
        this.splashes[base + 1] = ny;
        this.splashes[base + 2] = now;

        const idx = Math.max(0, Math.min(this.keyCount - 1, keyIndex));
        const v = Math.max(0, Math.min(1, velocity));
        if (v > this.activeKeys[idx]) this.activeKeys[idx] = v;
    }

    setKeyCenters(centers) {
        if (!centers || !centers.length) return;
        const n = Math.min(this.keyCount, centers.length);
        for (let i = 0; i < n; i++) {
            const value = Number.isFinite(centers[i]) ? centers[i] : (i + 0.5) / this.keyCount;
            this.keyCenters[i] = Math.max(0, Math.min(1, value));
        }
    }

    resize(width, height) {
        this.uniforms.resolution[0] = width;
        this.uniforms.resolution[1] = height;
    }

    update(delta) {
        this.uniforms.time += delta / 60;
        for (let i = 0; i < this.keyCount; i++) {
            this.activeKeys[i] *= 0.965;
        }
    }
}

class SplashEmitter {
    constructor(container, texture, spikeTexture) {
            this.container = container;
            this.texture = texture;
        this.spikeTexture = spikeTexture || texture;
            this.particles = [];
        }

        emit(x, y, velocity = 1) {
        const palette = [0xfff9e6, 0xfff2b8, 0xffe59a, 0xffd27a, 0xffffff];

        for (let i = 0; i < 2; i++) {
            const core = new PIXI.Sprite(this.texture);
            core.anchor.set(0.5);
            core.x = x;
            core.y = y;
            core.alpha = 0.9;
            core.scale.set(1.05 + Math.random() * 0.5);
            core.blendMode = 'add';
            core.tint = 0xfffff0;
            core.vx = 0;
            core.vy = 0;
            core.life = 0.7;
            core.spin = 0;
            core.shrinkX = 0.985;
            core.shrinkY = 0.985;
            this.container.addChild(core);
            this.particles.push(core);
        }

        const spikeCount = 18;
        const baseAngle = -Math.PI / 2;
        const spread = Math.PI * 1.05;
        for (let i = 0; i < spikeCount; i++) {
            const t = (i + 0.5) / spikeCount;
            const angle = baseAngle - spread / 2 + spread * t + (Math.random() - 0.5) * 0.08;
            const speed = (0.4 + Math.random() * 0.8) * velocity;
            const len = 0.7 + Math.random() * 1.1;

            const p = new PIXI.Sprite(this.spikeTexture);
            p.anchor.set(0.5, 0.92);
            p.x = x;
            p.y = y;
            p.alpha = 0.85;
            p.scale.set(0.16 + Math.random() * 0.12, 0.45 + len);
            p.blendMode = 'add';
            p.tint = palette[Math.floor(Math.random() * palette.length)];
            p.rotation = angle + Math.PI / 2;
            p.spin = (Math.random() - 0.5) * 0.03;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.life = 1.0;
            p.shrinkX = 0.99;
            p.shrinkY = 0.975;

            this.container.addChild(p);
            this.particles.push(p);
        }

        const sparkCount = 8;
        for (let i = 0; i < sparkCount; i++) {
            const angle = baseAngle - 0.6 + Math.random() * 1.2;
            const speed = (1.2 + Math.random() * 1.6) * velocity;
            const s = new PIXI.Sprite(this.texture);
            s.anchor.set(0.5);
            s.x = x;
            s.y = y;
            s.alpha = 0.8;
            s.scale.set(0.18 + Math.random() * 0.18);
            s.blendMode = 'add';
            s.tint = 0xfff7d0;
            s.rotation = Math.random() * Math.PI * 2;
            s.spin = (Math.random() - 0.5) * 0.06;
            s.vx = Math.cos(angle) * speed;
            s.vy = Math.sin(angle) * speed;
            s.life = 0.9;
            s.shrinkX = 0.985;
            s.shrinkY = 0.985;

            this.container.addChild(s);
            this.particles.push(s);
        }
        }

        update(delta = 1) {
            const fade = Math.pow(0.93, delta);
            const shrink = Math.pow(0.985, delta);
            const lifeStep = 0.03 * delta;

            this.particles = this.particles.filter(p => {
                p.x += p.vx * delta;
                p.y += p.vy * delta;
                p.vx *= 0.98;
                p.vy *= 0.98;
                p.rotation += p.spin * delta;
                p.alpha *= fade;
                p.life -= lifeStep;
                const sx = p.shrinkX || shrink;
                const sy = p.shrinkY || shrink;
                p.scale.x *= sx;
                p.scale.y *= sy;

                if (p.life <= 0) {
                    if (p.parent) p.parent.removeChild(p);
                    return false;
                }
                return true;
            });
        }

        clear() {
            this.particles.forEach(p => {
                if (p.parent) p.parent.removeChild(p);
            });
            this.particles = [];
        }

        destroy() {
            this.clear();
            this.container = null;
            this.texture = null;
        }
    }

UnifiedPianoFX.vertex = `
precision mediump float;

attribute vec2 aPosition;
attribute vec2 aUV;

varying vec2 vUV;

void main() {
    vUV = aUV;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

UnifiedPianoFX.fragment = `
precision mediump float;

varying vec2 vUV;

uniform float time;
uniform vec2 resolution;
uniform vec3 splashes[32];
uniform float activeKeys[88];
uniform float keyCenters[88];
uniform float ribbonStrength;
uniform float ribbonY;
uniform float ribbonThickness;
uniform float ribbonHue;
uniform float ribbonSat;
uniform float ribbonVal;
uniform float glowlineStrength;
uniform float glowlineY;
uniform float glowlineThickness;
uniform float glowlineHueStart;
uniform float glowlineHueEnd;
uniform float glowlineSat;
uniform float glowlineVal;
uniform float streamStrength;
uniform float streamWidth;
uniform float splashStrength;
uniform float glowStrength;
uniform vec3 splashColor;
uniform float glowSpread;
uniform float keyGlowStrength;
uniform float keyGlowSat;
uniform float keyGlowVal;

float splashField(vec2 uv, vec2 center, float age) {
    vec2 p = uv - center;
    float dist = length(p);
    // glowSpread = 0 → narrow (tight per-key), 1 → wide (legacy bloom).
    float radius = age * mix(0.025, 0.14, glowSpread);
    float ring   = exp(-mix(220.0, 46.0, glowSpread) * abs(dist - radius));
    float core   = exp(-mix(180.0, 16.0, glowSpread) * dist);
    float ripple = sin(dist * 52.0 - age * 14.0) * 0.5 + 0.5;
    return (core + ring * ripple) * exp(-age * 2.0);
}

float ribbon(vec2 uv, float t) {
    float x = uv.x;
    float thick = ribbonThickness;
    float baseY = ribbonY +
        sin(x * 6.5 + t * 0.9) * (thick * 0.18) +
        sin(x * 2.6 + t * 0.45) * (thick * 0.28);

    float noise = sin(x * 18.0 + t * 2.2) * (thick * 0.035)
        + sin(x * 37.0 - t * 3.1) * (thick * 0.02);
    baseY += noise;
    float y1 = baseY + sin(x * 10.0 - t * 1.2) * thick * 0.25;
    float y2 = baseY + thick * 0.5 + sin(x * 8.0 + t * 0.7) * thick * 0.4;

    float w1 = thick * 0.55 + sin(x * 3.0 + t * 0.4) * thick * 0.12;
    float w2 = thick * 0.8 + sin(x * 2.0 - t * 0.3) * thick * 0.18;

    float d1 = abs(uv.y - y1);
    float d2 = abs(uv.y - y2);

    float core1 = exp(-pow(d1 / w1, 2.0) * 4.0);
    float fog1 = exp(-pow(d1 / (w1 * 3.0), 2.0));
    float core2 = exp(-pow(d2 / (w2 * 0.8), 2.0) * 3.0);
    float fog2 = exp(-pow(d2 / (w2 * 2.5), 2.0));

    float mixFog = core1 * 0.7 + fog1 * 0.9 + core2 * 0.45 + fog2 * 0.6;

    float vfade = smoothstep(ribbonY - thick * 3.0, ribbonY + thick * 0.6, uv.y)
        * (1.0 - smoothstep(ribbonY + thick * 3.0, ribbonY + thick * 6.0, uv.y));
    float hfade = 1.0;
    return mixFog * vfade * hfade;
}

float keyGlow(vec2 uv) {
    float glow = 0.0;
    float overKeys = smoothstep(0.78, 0.92, uv.y);
    float spreadFactor = mix(glowSpread, 0.0, overKeys);
    for (int i = 0; i < 88; i++) {
        float v = activeKeys[i];
        if (v <= 0.001) continue;
        float keyX = keyCenters[i];
        float d = abs(uv.x - keyX);

        float tightWidth = mix(0.000035, 0.0012, spreadFactor);
        float core = exp(-(d * d) / tightWidth);
        float halo = exp(-(d * d) / mix(0.00018, 0.0045, spreadFactor));
        float keyTop = exp(-pow((uv.y - 0.93) / 0.028, 2.0));
        float plume = exp(-pow((uv.y - 0.86) / 0.12, 2.0)) * smoothstep(0.98, 0.70, uv.y);
        glow += (core * 2.8 * keyTop + halo * 1.25 * keyTop + core * 1.1 * plume) * v;
    }
    float keyboardFade = smoothstep(0.66, 0.92, uv.y);
    return glow * keyGlowStrength * keyboardFade * 2.2;
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 noteStreamColor(vec2 uv) {
    vec3 accum = vec3(0.0);
    for (int i = 0; i < 88; i++) {
        float vel = activeKeys[i];
        if (vel <= 0.001) continue;

        float keyX = keyCenters[i];
        float dx = abs(uv.x - keyX);

        float streamHeight = mix(0.25, 0.95, vel);
        float verticalMask = smoothstep(streamHeight, 0.02, uv.y);

        float width = mix(0.008, 0.035, 1.0 - uv.y) * streamWidth;
        float beam = exp(-(dx * dx) / (width * width));

        float pulse = sin(uv.y * 26.0 - time * 3.8 + float(i) * 0.9) * 0.5 + 0.5;
        pulse = mix(0.65, 1.0, pulse);

        float wobble = sin(time * 1.4 + uv.y * 18.0 + float(i) * 0.5) * 0.01;
        beam *= exp(-abs(dx + wobble) * 11.0);

        float core = smoothstep(0.0, 0.7, 1.0 - dx * 18.0);
        float intensity = beam * verticalMask * pulse * vel * (0.7 + 0.6 * core);
        float hue = pow(float(i) / 88.0, 0.85);
        vec3 color = hsv2rgb(vec3(hue, 0.55, 1.0));
        accum += color * intensity;
    }
    return accum;
}

vec4 glowLine(vec2 uv, float t) {
    float y = glowlineY + sin(uv.x * 4.0 + t * 0.3) * glowlineThickness * 0.12;
    float d = abs(uv.y - y);
    float core = 1.0 - smoothstep(glowlineThickness * 0.18, glowlineThickness * 0.42, d);
    float halo = exp(-pow(d / (glowlineThickness * 0.95), 2.0) * 2.1);
    float hue = mix(glowlineHueStart, glowlineHueEnd, uv.x);
    vec3 col = hsv2rgb(vec3(hue, glowlineSat, glowlineVal));
    vec3 coreCol = col * core;
    vec3 haloCol = col * halo * 0.22;
    float alpha = clamp(core + halo * 0.10, 0.0, 1.0);
    return vec4(coreCol + haloCol, alpha);
}

void main() {
    vec2 uv = vUV;

    float ribbonTerm = ribbon(uv, time) * ribbonStrength;

    float splashTerm = 0.0;
    for (int i = 0; i < 32; i++) {
        vec3 s = splashes[i];
        if (s.z < 0.0) continue;
        float age = time - s.z;
        if (age < 0.0 || age > 2.2) continue;
        splashTerm += splashField(uv, s.xy, age);
    }

    float glowTerm = keyGlow(uv);

    float ambilightHue = mix(glowlineHueStart, glowlineHueEnd, uv.x);
    vec3 ribbonCol = hsv2rgb(vec3(ambilightHue, ribbonSat, ribbonVal)) * ribbonTerm;
    vec4 glowline = glowLine(uv, time);
    vec3 lineCol = glowline.rgb * min(glowlineStrength, 1.0);
    vec3 keyGlowCol = hsv2rgb(vec3(ambilightHue, keyGlowSat, keyGlowVal));
    vec3 ambient = splashColor * (splashTerm * splashStrength) + keyGlowCol * (glowTerm * glowStrength);
    vec3 streamCol = noteStreamColor(uv) * streamStrength;
    vec3 outColor = ribbonCol + lineCol + ambient + streamCol;
    float energy = length(outColor);
    outColor *= 1.0 / (1.0 + energy * 0.36);
    float ambilightAlpha = ribbonTerm * 0.72 + glowline.a;
    float alpha = clamp(max(length(outColor) * 0.30, ambilightAlpha) + glowTerm * glowStrength * 0.18, 0.0, 1.0);
    gl_FragColor = vec4(outColor, alpha);
}
`;

class PianoFX {
    constructor(canvas) {
        this.canvas = canvas;
        this.app = new PIXI.Application();
        this.isReady = false;
        this._fxTime = 0;
        this._lastImpact = -999;
        this._trailRT = null;
        this._trailIndex = 0;
        this._trailContainer = null;
        this._trailFeedback = null;
        this._trailOutput = null;
        this._bloomFilter = null;
        this._splashContainer = null;
        this._splashEmitter = null;
        this._splashTexture = null;
        this._splashSpikeTexture = null;
        this._sparkFx = null;
        this._recentSpriteImpacts = [];
        this._splashStrengthProfile = null;
        this._keyGlowColor = null;
        this._keyCenters = null;
        this.streamMode = 'off';
        this.streamWidth = 'normal';
        this.ribbonMode = 'strong';
        this.splashMode = 'classic';
        this.ready = this._init();
    }

    async _init() {
        if (PIXI.extensions && PIXI.MeshPipe) {
            try {
                PIXI.extensions.add(PIXI.MeshPipe);
            } catch (_) {
                // Ignore duplicate registration errors.
            }
        }

        const gl = this.canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: true,
            powerPreference: 'high-performance',
        });
        await this.app.init({
            canvas: this.canvas,
            context: gl,
            width: this.canvas.clientWidth || 800,
            height: this.canvas.clientHeight || 300,
            backgroundAlpha: 0,
            antialias: true,
            resolution: Math.min(window.devicePixelRatio || 1, 1.5),
            autoDensity: false,
            preference: 'webgl',
        });

        this.unified = new UnifiedPianoFX(this.app);
        this.unified.display.alpha = 0.0;

        this._initTrailPass();

        if (this._keyCenters) this.unified.setKeyCenters(this._keyCenters);
        this.setStreamMode(this.streamMode);
        this.setStreamWidth(this.streamWidth);
        this.setRibbonMode(this.ribbonMode);
        this.setSplashMode(this.splashMode);
        this._applyAnchors();

        this.app.ticker.stop();
        this.isReady = true;
    }

    _initTrailPass() {
        const w = this.app.renderer.width || 1;
        const h = this.app.renderer.height || 1;
        const res = this.app.renderer.resolution || 1;

        this._trailRT = [
            PIXI.RenderTexture.create({ width: w, height: h, resolution: res }),
            PIXI.RenderTexture.create({ width: w, height: h, resolution: res }),
        ];
        this._trailIndex = 0;

        this._trailFeedback = new PIXI.Sprite(this._trailRT[1]);
        this._trailFeedback.alpha = 0.68;
        this._trailFeedback.blendMode = 'add';
        this._trailFeedback.anchor.set(0.5);
        this._trailFeedback.position.set(w / 2, h / 2);
        this._trailFeedback.scale.set(1.002, 1.004);

        this._trailContainer = new PIXI.Container();
        this._trailContainer.addChild(this._trailFeedback);
        this._splashContainer = new PIXI.Container();
        this._trailContainer.addChild(this._splashContainer);
        this._trailContainer.addChild(this.unified.display);

        this._trailOutput = new PIXI.Sprite(this._trailRT[0]);
        this._trailOutput.blendMode = 'normal';
        this._trailOutput.alpha = 0.55;
        this.app.stage.addChild(this._trailOutput);

        const Bloom = (PIXI.filters && PIXI.filters.BloomFilter) || PIXI.BloomFilter;
        if (Bloom) {
            this._bloomFilter = new Bloom({ strength: 0.45, blur: 3, quality: 3 });
            this._trailOutput.filters = [this._bloomFilter];
        }
    }

    resize(width, height) {
        if (!this.isReady) return;
        this.app.renderer.resize(width, height);
        this.unified.resize(width, height);
        if (this._trailRT) {
            this._trailRT.forEach(rt => rt.destroy(true));
            this._trailRT = null;
        }
        if (this._trailOutput) {
            this._trailOutput.destroy({ children: true, texture: false, baseTexture: false });
            this._trailOutput = null;
        }
        if (this._trailFeedback) {
            this._trailFeedback.destroy({ children: true, texture: false, baseTexture: false });
            this._trailFeedback = null;
        }
        if (this._trailContainer) {
            this._trailContainer.destroy({ children: false });
            this._trailContainer = null;
        }
        if (this._splashContainer) {
            this._splashContainer.destroy({ children: true });
            this._splashContainer = null;
        }
        if (this._splashEmitter) {
            this._splashEmitter.destroy();
            this._splashEmitter = null;
        }
        this._splashSpikeTexture = null;
        this._sparkFx = null;
        this._initTrailPass();
        if (this._keyCenters) this.unified.setKeyCenters(this._keyCenters);
        this.setStreamMode(this.streamMode);
        this.setStreamWidth(this.streamWidth);
        this.setRibbonMode(this.ribbonMode);
        this.setSplashMode(this.splashMode);
        this._applyAnchors();
    }

    setKeyCenters(centers) {
        if (!centers || !centers.length) return;
        this._keyCenters = Array.from(centers);
        if (this.unified && typeof this.unified.setKeyCenters === 'function') {
            this.unified.setKeyCenters(this._keyCenters);
        }
    }

    _applyAnchors() {
        if (!this.unified || !this.unified.uniforms || !this.app || !this.app.renderer) return;
        const h = this.app.renderer.height || 1;
        // Bottom-relative anchor offset: how far above the canvas bottom the
        // keyboard top sits. When the fxCanvas is extended over the piano
        // keys, this is the keyboard height so the glow line / ribbon hug
        // the top of the keyboard instead of the bottom of the window.
        const keyboardOffsetPx = this._keyboardOffsetPx || 0;
        const offsetPx = (this._ribbonOffsetPx != null) ? this._ribbonOffsetPx : 8;
        const thicknessPx = (this._ribbonThicknessPx != null) ? this._ribbonThicknessPx : 26;
        const lineOffsetPx = (this._glowlineOffsetPx != null) ? this._glowlineOffsetPx : 4;
        const lineThicknessPx = (this._glowlineThicknessPx != null) ? this._glowlineThicknessPx : 8;
        const ribbonY = Math.max(0.0, Math.min(1.0, 1.0 - ((offsetPx + keyboardOffsetPx) / h)));
        const ribbonThickness = Math.max(0.01, Math.min(0.2, thicknessPx / h));
        const glowlineY = Math.max(0.0, Math.min(1.0, 1.0 - ((lineOffsetPx + keyboardOffsetPx) / h)));
        const glowlineThickness = Math.max(0.003, Math.min(0.08, lineThicknessPx / h));
        this.unified.uniforms.ribbonY = ribbonY;
        this.unified.uniforms.ribbonThickness = ribbonThickness;
        this.unified.uniforms.glowlineY = glowlineY;
        this.unified.uniforms.glowlineThickness = glowlineThickness;
    }

    setKeyboardOffset(px) {
        this._keyboardOffsetPx = Math.max(0, px | 0);
        this._applyAnchors();
    }

    _createSplashTexture() {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const cx = size / 2;
        const cy = size / 2;

        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.shadowColor = 'rgba(255, 210, 140, 0.8)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        const w = 22;
        const h = 22;
        const r = 6;
        ctx.beginPath();
        ctx.moveTo(-w / 2 + r, -h / 2);
        ctx.lineTo(w / 2 - r, -h / 2);
        ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
        ctx.lineTo(w / 2, h / 2 - r);
        ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
        ctx.lineTo(-w / 2 + r, h / 2);
        ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
        ctx.lineTo(-w / 2, -h / 2 + r);
        ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26);
        grad.addColorStop(0, 'rgba(255, 245, 220, 0.95)');
        grad.addColorStop(0.45, 'rgba(255, 210, 140, 0.35)');
        grad.addColorStop(1, 'rgba(255, 210, 140, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 26, 0, Math.PI * 2);
        ctx.fill();

        return PIXI.Texture.from(canvas);
    }

    _createSplashSpikeTexture() {
        const w = 24;
        const h = 80;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);

        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        grad.addColorStop(0.2, 'rgba(255, 245, 220, 0.35)');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
        grad.addColorStop(0.8, 'rgba(255, 220, 160, 0.35)');
        grad.addColorStop(1, 'rgba(255, 200, 140, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(w * 0.4, h * 0.05, w * 0.2, h * 0.9, w * 0.1);
        ctx.fill();

        return PIXI.Texture.from(canvas);
    }

    _ensureSplashEmitter() {
        if (!this._splashContainer) return;
        if (!this._splashTexture) this._splashTexture = this._createSplashTexture();
        if (!this._splashSpikeTexture) this._splashSpikeTexture = this._createSplashSpikeTexture();
        if (!this._splashEmitter) {
            this._splashEmitter = new SplashEmitter(this._splashContainer, this._splashTexture, this._splashSpikeTexture);
        }
    }

    _ensureSparkFx() {
        if (this._sparkFx || typeof window === 'undefined') return;
        if (!window.PianoKeySparkFX) return;
        if (!this.app || !this.app.renderer) return;
        this._sparkFx = new window.PianoKeySparkFX(this.app, {
            alpha: 0.72,
            bloomStrength: 2.4,
            bloomBlur: 10,
            bloomQuality: 4,
        });
        // Keep on app.stage (NOT the additive trail feedback container,
        // which would smear sprites into ghost trails).
        const spriteVariants = ['spark', 'fog', 'cartoon', 'cartoonhalf', 'ash', 'sparkles'];
        if (this._sparkFx.sprite && this._sparkFx.sprite.parent !== this.app.stage) {
            if (this._sparkFx.sprite.parent) this._sparkFx.sprite.parent.removeChild(this._sparkFx.sprite);
            this.app.stage.addChild(this._sparkFx.sprite);
        }
        if (this._sparkFx.sprite) this._sparkFx.sprite.visible = spriteVariants.includes(this.splashMode);
        if (typeof this._sparkFx.setVariant === 'function') {
            this._sparkFx.setVariant(this.splashMode);
        }
    }

    setStreamMode(mode) {
        this.streamMode = (mode === 'cinematic' || mode === 'subtle') ? mode : 'off';
        const strengths = { off: 0.0, subtle: 0.35, cinematic: 0.6 };
        if (this.unified && this.unified.uniforms) {
            this.unified.uniforms.streamStrength = strengths[this.streamMode];
        }
    }

    setStreamWidth(mode) {
        this.streamWidth = (mode === 'narrow' || mode === 'wide') ? mode : 'normal';
        const widths = { narrow: 0.65, normal: 1.0, wide: 1.45 };
        if (this.unified && this.unified.uniforms) {
            this.unified.uniforms.streamWidth = widths[this.streamWidth];
        }
    }

    setRibbonMode(mode) {
        this.ribbonMode = (mode === 'off' || mode === 'hitbar' || mode === 'subtle' || mode === 'cinematic') ? mode : 'strong';
        const profiles = {
            off: {
                ribbonActive: 0.0,
                ribbonIdle: 0.0,
                ribbonOffsetPx: 4,
                ribbonThicknessPx: 22,
                glowlineStrength: 0.0,
                glowlineOffsetPx: 3,
                glowlineThicknessPx: 7,
                splashStrength: 0.35,
                glowStrength: 0.85,
                trailAlpha: 0.35,
                feedbackAlpha: 0.55,
                bloomStrength: 0.2,
                bloomBlur: 2,
            },
            hitbar: {
                ribbonActive: 0.0,
                ribbonIdle: 0.0,
                ribbonOffsetPx: 4,
                ribbonThicknessPx: 22,
                glowlineStrength: 0.0,
                glowlineOffsetPx: 3,
                glowlineThicknessPx: 7,
                splashStrength: 0.35,
                glowStrength: 0.85,
                trailAlpha: 0.35,
                feedbackAlpha: 0.55,
                bloomStrength: 0.2,
                bloomBlur: 2,
            },
            subtle: {
                ribbonActive: 0.13,
                ribbonIdle: 0.045,
                ribbonOffsetPx: 5,
                ribbonThicknessPx: 18,
                glowlineStrength: 0.72,
                glowlineOffsetPx: 4,
                glowlineThicknessPx: 6,
                splashStrength: 0.45,
                glowStrength: 0.9,
                trailAlpha: 0.75,
                feedbackAlpha: 0.68,
                bloomStrength: 0.34,
                bloomBlur: 2.5,
            },
            cinematic: {
                ribbonActive: 0.21,
                ribbonIdle: 0.075,
                ribbonOffsetPx: 4,
                ribbonThicknessPx: 22,
                glowlineStrength: 1.0,
                glowlineOffsetPx: 3,
                glowlineThicknessPx: 7,
                splashStrength: 0.7,
                glowStrength: 1.05,
                trailAlpha: 0.9,
                feedbackAlpha: 0.76,
                bloomStrength: 0.58,
                bloomBlur: 3,
            },
            strong: {
                ribbonActive: 0.30,
                ribbonIdle: 0.12,
                ribbonOffsetPx: 3,
                ribbonThicknessPx: 26,
                glowlineStrength: 1.2,
                glowlineOffsetPx: 2,
                glowlineThicknessPx: 8,
                splashStrength: 0.35,
                glowStrength: 0.9,
                trailAlpha: 1.0,
                feedbackAlpha: 0.78,
                bloomStrength: 0.52,
                bloomBlur: 3.5,
            },
        };
        const profile = profiles[this.ribbonMode] || profiles.strong;

        if (this.unified && this.unified.uniforms) {
            this._splashStrengthProfile = profile.splashStrength;
            this.unified.uniforms.splashStrength = (this.splashMode === 'burst') ? 0.0 : profile.splashStrength;
            this.unified.uniforms.glowStrength = profile.glowStrength;
            this.unified.uniforms.glowlineStrength = profile.glowlineStrength;
        }
        this._ribbonActive = profile.ribbonActive;
        this._ribbonIdle = profile.ribbonIdle;
        this._ribbonOffsetPx = profile.ribbonOffsetPx;
        this._ribbonThicknessPx = profile.ribbonThicknessPx;
        this._glowlineOffsetPx = profile.glowlineOffsetPx;
        this._glowlineThicknessPx = profile.glowlineThicknessPx;

        if (this._trailOutput) this._trailOutput.alpha = profile.trailAlpha;
        if (this._trailFeedback) this._trailFeedback.alpha = profile.feedbackAlpha;
        if (this._bloomFilter) {
            this._bloomFilter.strength = profile.bloomStrength;
            this._bloomFilter.blur = profile.bloomBlur;
        }

        this._applyAnchors();
    }

    setFxMode(mode) {
        const legacy = mode || 'ribbon';
        this.setStreamMode(legacy === 'ribbon' ? 'off' : legacy);
        this.setRibbonMode(legacy === 'ribbon' ? 'strong' : legacy);
    }

    setSplashMode(mode) {
        this.splashMode = mode || 'classic';
        // Sprite-based variants all use the PianoKeySparkFX system.
        const spriteVariants = ['spark', 'fog', 'cartoon', 'cartoonhalf', 'ash', 'sparkles'];
        const useShaderSplash = this.splashMode === 'classic';
        const useBurst = this.splashMode === 'burst';
        const useSprites = spriteVariants.includes(this.splashMode);
        if (useBurst) this._ensureSplashEmitter();
        if (useSprites) {
            this._ensureSparkFx();
            if (this._sparkFx && typeof this._sparkFx.setVariant === 'function') {
                this._sparkFx.setVariant(this.splashMode);
            }
        }
        if (this._splashContainer) this._splashContainer.visible = useBurst;
        if (this._sparkFx && this._sparkFx.sprite) this._sparkFx.sprite.visible = useSprites;
        if (this.unified && this.unified.uniforms) {
            const base = (this._splashStrengthProfile != null) ? this._splashStrengthProfile : this.unified.uniforms.splashStrength;
            this.unified.uniforms.splashStrength = useShaderSplash ? base : 0.0;
            // Tint the per-key ambient glow. User palette overrides effect preset tint.
            const colorMap = {
                classic:     [0.20, 0.70, 1.00], // legacy cyan
                burst:       [1.00, 0.95, 0.85], // warm white
                spark:       [1.00, 0.85, 0.55], // anime orange
                fog:         [0.75, 0.85, 1.00], // cool mist
                cartoon:     [1.00, 1.00, 1.00], // sun-burst white
                cartoonhalf: [1.00, 1.00, 1.00],
                ash:         [1.00, 0.70, 0.35], // ember
                sparkles:    [1.00, 0.95, 1.00], // twinkle white
            };
            const c = this._keyGlowColor || colorMap[this.splashMode] || [1.0, 1.0, 1.0];
            this.unified.uniforms.splashColor[0] = c[0];
            this.unified.uniforms.splashColor[1] = c[1];
            this.unified.uniforms.splashColor[2] = c[2];
        }
        if (!useBurst && this._splashEmitter) this._splashEmitter.clear();
    }

    setGlowSpread(mode) {
        // 'none', 'narrow' (default), or 'wide'.
        this.glowSpread = (mode === 'none' || mode === 'wide') ? mode : 'narrow';
        if (this.unified && this.unified.uniforms) {
            this.unified.uniforms.glowSpread = (this.glowSpread === 'wide') ? 1.0 : 0.0;
            this.unified.uniforms.keyGlowStrength = (this.glowSpread === 'none') ? 0.0 : 1.0;
        }
        // Re-apply splash mode so the per-key tint refreshes.
        if (this.splashMode) this.setSplashMode(this.splashMode);
    }

    _hsvToRgb(h, s, v) {
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: return [v, t, p];
            case 1: return [q, v, p];
            case 2: return [p, v, t];
            case 3: return [p, q, v];
            case 4: return [t, p, v];
            default: return [v, p, q];
        }
    }

    setFxPalette(palette = {}) {
        if (!this.unified || !this.unified.uniforms) return;
        const u = this.unified.uniforms;
        if (palette.ribbonHue != null) u.ribbonHue = palette.ribbonHue;
        if (palette.ribbonSat != null) u.ribbonSat = palette.ribbonSat;
        if (palette.ribbonVal != null) u.ribbonVal = palette.ribbonVal;
        if (palette.glowlineHueStart != null) u.glowlineHueStart = palette.glowlineHueStart;
        if (palette.glowlineHueEnd != null) u.glowlineHueEnd = palette.glowlineHueEnd;
        if (palette.glowlineSat != null) u.glowlineSat = palette.glowlineSat;
        if (palette.glowlineVal != null) u.glowlineVal = palette.glowlineVal;
        if (palette.keyGlowHue != null || palette.keyGlowSat != null || palette.keyGlowVal != null) {
            const h = palette.keyGlowHue != null ? palette.keyGlowHue : 200 / 360;
            const s = palette.keyGlowSat != null ? palette.keyGlowSat : 0.7;
            const v = palette.keyGlowVal != null ? palette.keyGlowVal : 1.0;
            u.keyGlowSat = s;
            u.keyGlowVal = v;
            this._keyGlowColor = this._hsvToRgb(h, s, v);
            u.splashColor[0] = this._keyGlowColor[0];
            u.splashColor[1] = this._keyGlowColor[1];
            u.splashColor[2] = this._keyGlowColor[2];
        }
    }

    _spriteImpactScale(x) {
        const now = this._fxTime;
        const windowSec = 0.12;
        const clusterPx = 120;
        this._recentSpriteImpacts = this._recentSpriteImpacts.filter(hit => now - hit.t <= windowSec);
        let nearby = 0;
        for (let i = 0; i < this._recentSpriteImpacts.length; i++) {
            if (Math.abs(this._recentSpriteImpacts[i].x - x) <= clusterPx) nearby++;
        }
        const globalDensity = this._recentSpriteImpacts.length;
        this._recentSpriteImpacts.push({ t: now, x });

        const brightModes = ['burst', 'fog', 'cartoon', 'cartoonhalf'];
        const maxGlobal = brightModes.includes(this.splashMode) ? 6 : 12;
        const maxNearby = brightModes.includes(this.splashMode) ? 3 : 7;
        if (globalDensity >= maxGlobal || nearby >= maxNearby) return 0.0;

        const density = Math.max(nearby, globalDensity * 0.55);
        if (density <= 2) return 1.0;
        return Math.max(0.22, 1 / Math.sqrt(1 + (density - 2) * 0.8));
    }

    onKeyPress(x, y, keyIndex = 0, velocity = 1) {
        if (!this.isReady) return;
        this._lastImpact = this._fxTime;
        this.unified.triggerKey(keyIndex, x, y, velocity);
        if (this.splashMode === 'burst') {
            this._ensureSplashEmitter();
            const scaledVelocity = velocity * this._spriteImpactScale(x);
            if (this._splashEmitter && scaledVelocity > 0.2) this._splashEmitter.emit(x, y, scaledVelocity);
        } else if (this.splashMode !== 'classic' && this.splashMode !== 'off') {
            this._ensureSparkFx();
            const scaledVelocity = velocity * this._spriteImpactScale(x);
            if (this._sparkFx && scaledVelocity > 0.18) this._sparkFx.triggerKey(keyIndex, x, y, scaledVelocity);
        }
    }

    update(delta) {
        if (!this.isReady) return;
        this._fxTime += delta / 60;
        let maxActive = 0.0;
        for (let i = 0; i < this.unified.keyCount; i++) {
            if (this.unified.activeKeys[i] > maxActive) maxActive = this.unified.activeKeys[i];
        }
        const active = (this._fxTime - this._lastImpact) < 0.8 || maxActive > 0.02;
        const steadyTopVisual = this.ribbonMode !== 'off' && this.ribbonMode !== 'hitbar';
        const fxOnly = typeof window !== 'undefined' && window.pianoHero && window.pianoHero.fxOnlyMode;
        const idleAlpha = fxOnly ? 0.25 : 0.0;
        this.unified.display.alpha = steadyTopVisual ? 1.0 : (active ? 1.0 : idleAlpha);
        const ribbonActive = this._ribbonActive != null ? this._ribbonActive : 0.12;
        const ribbonIdle = this._ribbonIdle != null ? this._ribbonIdle : 0.03;
        const idleRibbon = fxOnly ? Math.max(ribbonIdle, 0.05) : ribbonIdle;
        this.unified.uniforms.ribbonStrength = steadyTopVisual ? ribbonActive : (active ? ribbonActive : idleRibbon);
        this.unified.update(delta);

        if (this._splashEmitter) {
            this._splashEmitter.update(delta);
        }
        if (this._sparkFx) {
            this._sparkFx.update(delta);
        }

        if (this._trailRT && this._trailOutput && this._trailFeedback && this._trailContainer) {
            const readIndex = this._trailIndex % 2;
            const writeIndex = (this._trailIndex + 1) % 2;
            const readRT = this._trailRT[readIndex];
            const writeRT = this._trailRT[writeIndex];

            this._trailFeedback.texture = readRT;
            this._trailOutput.texture = writeRT;

            this.app.renderer.render(this._trailContainer, { renderTexture: writeRT, clear: true });
            this._trailIndex++;
            this.app.render();
        } else {
            this.app.render();
        }
    }
}

window.PianoFX = PianoFX;
