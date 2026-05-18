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
            ribbonStrength: { value: 0.22, type: 'f32' },
            ribbonY: { value: 0.965, type: 'f32' },
            ribbonThickness: { value: 0.08, type: 'f32' },
            ribbonHue: { value: 0.08, type: 'f32' },
            ribbonSat: { value: 0.7, type: 'f32' },
            ribbonVal: { value: 1.0, type: 'f32' },
            glowlineStrength: { value: 0.6, type: 'f32' },
            glowlineY: { value: 0.97, type: 'f32' },
            glowlineThickness: { value: 0.02, type: 'f32' },
            glowlineHueStart: { value: 0.58, type: 'f32' },
            glowlineHueEnd: { value: 0.95, type: 'f32' },
            glowlineSat: { value: 0.6, type: 'f32' },
            glowlineVal: { value: 1.0, type: 'f32' },
            streamStrength: { value: 0.5, type: 'f32' },
            splashStrength: { value: 0.85, type: 'f32' },
            glowStrength: { value: 0.6, type: 'f32' },
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
        this.mesh.blendMode = 'add';
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
uniform float splashStrength;
uniform float glowStrength;

float splashField(vec2 uv, vec2 center, float age) {
    vec2 p = uv - center;
    float dist = length(p);
    float radius = age * 0.14;
    float ring = exp(-46.0 * abs(dist - radius));
    float core = exp(-16.0 * dist);
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
    float hfade = smoothstep(0.0, 0.08, uv.x) * (1.0 - smoothstep(0.92, 1.0, uv.x));
    return mixFog * vfade * hfade;
}

float keyGlow(vec2 uv) {
    float glow = 0.0;
    for (int i = 0; i < 88; i++) {
        float v = activeKeys[i];
        if (v <= 0.001) continue;
        float keyX = (float(i) + 0.5) / 88.0;
        float d = abs(uv.x - keyX);
        glow += exp(-(d * d) / 0.0018) * v;
    }
    return glow * smoothstep(1.0, 0.7, uv.y);
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

        float keyX = (float(i) + 0.5) / 88.0;
        float dx = abs(uv.x - keyX);

        float streamHeight = mix(0.25, 0.95, vel);
        float verticalMask = smoothstep(streamHeight, 0.02, uv.y);

        float width = mix(0.008, 0.035, 1.0 - uv.y);
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

vec3 glowLine(vec2 uv, float t) {
    float y = glowlineY + sin(uv.x * 4.0 + t * 0.3) * glowlineThickness * 0.12;
    float d = abs(uv.y - y);
    float core = exp(-pow(d / (glowlineThickness * 0.35), 2.0) * 6.0);
    float halo = exp(-pow(d / (glowlineThickness * 1.8), 2.0) * 1.5);
    float hue = mix(glowlineHueStart, glowlineHueEnd, uv.x);
    vec3 col = hsv2rgb(vec3(hue, glowlineSat, glowlineVal));
    return col * (core * 1.2 + halo * 0.65);
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

    vec3 ribbonCol = hsv2rgb(vec3(ribbonHue, ribbonSat, ribbonVal)) * ribbonTerm;
    vec3 lineCol = glowLine(uv, time) * glowlineStrength;
    vec3 ambient = vec3(0.2, 0.7, 1.0) * (splashTerm * splashStrength + glowTerm * glowStrength);
    vec3 streamCol = noteStreamColor(uv) * streamStrength;
    vec3 outColor = ribbonCol + lineCol + ambient + streamCol;
    float energy = length(outColor);
    outColor *= 1.0 / (1.0 + energy * 0.9);
    float alpha = clamp(length(outColor) * 0.16, 0.0, 1.0);
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
        this.fxMode = 'cinematic';
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

        this.setFxMode(this.fxMode);
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
        this._trailContainer.addChild(this.unified.display);

        this._trailOutput = new PIXI.Sprite(this._trailRT[0]);
        this._trailOutput.blendMode = 'add';
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
        this._initTrailPass();
        this.setFxMode(this.fxMode);
        this._applyAnchors();
    }

    _applyAnchors() {
        if (!this.unified || !this.unified.uniforms || !this.app || !this.app.renderer) return;
        const h = this.app.renderer.height || 1;
        const offsetPx = (this._ribbonOffsetPx != null) ? this._ribbonOffsetPx : 8;
        const thicknessPx = (this._ribbonThicknessPx != null) ? this._ribbonThicknessPx : 26;
        const lineOffsetPx = (this._glowlineOffsetPx != null) ? this._glowlineOffsetPx : 4;
        const lineThicknessPx = (this._glowlineThicknessPx != null) ? this._glowlineThicknessPx : 8;
        const ribbonY = Math.max(0.0, Math.min(1.0, 1.0 - (offsetPx / h)));
        const ribbonThickness = Math.max(0.01, Math.min(0.2, thicknessPx / h));
        const glowlineY = Math.max(0.0, Math.min(1.0, 1.0 - (lineOffsetPx / h)));
        const glowlineThickness = Math.max(0.003, Math.min(0.08, lineThicknessPx / h));
        this.unified.uniforms.ribbonY = ribbonY;
        this.unified.uniforms.ribbonThickness = ribbonThickness;
        this.unified.uniforms.glowlineY = glowlineY;
        this.unified.uniforms.glowlineThickness = glowlineThickness;
    }

    setFxMode(mode) {
        this.fxMode = mode || 'cinematic';
        const profiles = {
            cinematic: {
                ribbonActive: 0.16,
                ribbonIdle: 0.06,
                ribbonOffsetPx: 4,
                ribbonThicknessPx: 22,
                glowlineStrength: 0.75,
                glowlineOffsetPx: 3,
                glowlineThicknessPx: 7,
                streamStrength: 0.6,
                splashStrength: 0.7,
                glowStrength: 0.55,
                trailAlpha: 0.6,
                feedbackAlpha: 0.7,
                bloomStrength: 0.45,
                bloomBlur: 3,
            },
            subtle: {
                ribbonActive: 0.1,
                ribbonIdle: 0.035,
                ribbonOffsetPx: 5,
                ribbonThicknessPx: 18,
                glowlineStrength: 0.55,
                glowlineOffsetPx: 4,
                glowlineThicknessPx: 6,
                streamStrength: 0.35,
                splashStrength: 0.45,
                glowStrength: 0.35,
                trailAlpha: 0.45,
                feedbackAlpha: 0.62,
                bloomStrength: 0.25,
                bloomBlur: 2.5,
            },
            ribbon: {
                ribbonActive: 0.22,
                ribbonIdle: 0.09,
                ribbonOffsetPx: 3,
                ribbonThicknessPx: 26,
                glowlineStrength: 0.9,
                glowlineOffsetPx: 2,
                glowlineThicknessPx: 8,
                streamStrength: 0.25,
                splashStrength: 0.35,
                glowStrength: 0.3,
                trailAlpha: 0.55,
                feedbackAlpha: 0.7,
                bloomStrength: 0.35,
                bloomBlur: 3.5,
            },
        };
        const profile = profiles[this.fxMode] || profiles.cinematic;

        if (this.unified && this.unified.uniforms) {
            this.unified.uniforms.streamStrength = profile.streamStrength;
            this.unified.uniforms.splashStrength = profile.splashStrength;
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
    }

    onKeyPress(x, y, keyIndex = 0, velocity = 1) {
        if (!this.isReady) return;
        this._lastImpact = this._fxTime;
        this.unified.triggerKey(keyIndex, x, y, velocity);
    }

    update(delta) {
        if (!this.isReady) return;
        this._fxTime += delta / 60;
        let maxActive = 0.0;
        for (let i = 0; i < this.unified.keyCount; i++) {
            if (this.unified.activeKeys[i] > maxActive) maxActive = this.unified.activeKeys[i];
        }
        const active = (this._fxTime - this._lastImpact) < 0.8 || maxActive > 0.02;
        const fxOnly = typeof window !== 'undefined' && window.pianoHero && window.pianoHero.fxOnlyMode;
        const idleAlpha = fxOnly ? 0.25 : 0.0;
        this.unified.display.alpha = active ? 1.0 : idleAlpha;
        const ribbonActive = this._ribbonActive != null ? this._ribbonActive : 0.12;
        const ribbonIdle = this._ribbonIdle != null ? this._ribbonIdle : 0.03;
        const idleRibbon = fxOnly ? Math.max(ribbonIdle, 0.05) : ribbonIdle;
        this.unified.uniforms.ribbonStrength = active ? ribbonActive : idleRibbon;
        this.unified.update(delta);

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
