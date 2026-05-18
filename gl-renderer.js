/**
 * WebGL2 instanced note renderer for Piano Hero.
 * Renders all falling notes in 1 draw call using instanced quads.
 * Canvas lives in the DOM — browser composites it behind the 2D overlay.
 */
class GLNoteRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: false,
            powerPreference: 'high-performance',
        });
        if (!this.gl) {
            console.warn('[GLNoteRenderer] WebGL2 not available');
            this.available = false;
            return;
        }
        this.available = true;
        this.maxInstances = 2048;
        this.FLOATS_PER_INSTANCE = 12;
        this._instanceData = new Float32Array(this.maxInstances * this.FLOATS_PER_INSTANCE);
        this._instanceCount = 0;

        const gl = this.gl;
        gl.clearColor(0, 0, 0, 0);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied alpha

        this._initShaders();
        if (!this.available) return;
        this._initBuffers();
        console.log('[GLNoteRenderer] Initialized successfully');
    }

    _initShaders() {
        const gl = this.gl;

        const vsSource = `#version 300 es
        layout(location = 0) in vec2 a_quadPos;
        layout(location = 1) in vec4 a_rect;
        layout(location = 2) in vec4 a_color;
        layout(location = 3) in vec4 a_params;

        uniform vec2 u_resolution;

        out vec2 v_uv;
        out vec4 v_color;
        out vec2 v_rectSize;
        out vec4 v_params;

        void main() {
            float x = a_rect.x;
            float y = a_rect.y;
            float w = a_rect.z;
            float h = a_rect.w;

            float pad = a_params.y * 10.0;
            vec2 pos = vec2(
                x - pad + a_quadPos.x * (w + pad * 2.0),
                y - pad + a_quadPos.y * (h + pad * 2.0)
            );

            vec2 clip = (pos / u_resolution) * 2.0 - 1.0;
            clip.y = -clip.y;
            gl_Position = vec4(clip, 0.0, 1.0);

            v_uv = vec2((pos.x - x) / w, (pos.y - y) / h);
            v_color = a_color;
            v_rectSize = vec2(w, h);
            v_params = a_params;
        }
        `;

        const fsSource = `#version 300 es
        precision mediump float;

        in vec2 v_uv;
        in vec4 v_color;
        in vec2 v_rectSize;
        in vec4 v_params;

        uniform float u_time;
        out vec4 fragColor;

        float roundedBoxSDF(vec2 p, vec2 halfSize, float radius) {
            vec2 q = abs(p) - halfSize + radius;
            return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
        }

        void main() {
            float borderRadius = v_params.x;
            float glowStrength = v_params.y;
            float style = v_params.z;

            vec2 halfSize = v_rectSize * 0.5;
            vec2 pixPos = (v_uv - 0.5) * v_rectSize;
            float dist = roundedBoxSDF(pixPos, halfSize, borderRadius);

            float aa = 1.0 - smoothstep(-1.0, 1.0, dist);

            if (aa < 0.001) {
                if (glowStrength > 0.01) {
                    float gd = dist / (glowStrength * 10.0);
                    float glow = exp(-gd * gd * 2.0) * glowStrength;
                    vec3 gc = v_color.rgb * glow * 0.5;
                    float ga = glow * 0.3;
                    fragColor = vec4(gc * ga, ga);
                } else {
                    discard;
                }
                return;
            }

            vec3 baseColor = v_color.rgb;
            float baseAlpha = v_color.a;
            vec3 col;
            float finalAlpha;

            if (style < 0.5) {
                // === CLASSIC ===
                float gradT = v_uv.y;
                col = baseColor;
                col = mix(col * 1.2, col * 0.85, smoothstep(0.0, 0.5, gradT));
                col = mix(col * 0.85, col * 1.05, smoothstep(0.5, 1.0, gradT));

                float glossT = 1.0 - smoothstep(0.0, 0.3, gradT);
                col += vec3(glossT * 0.2);

                float borderAA = 1.0 - smoothstep(-2.0, -0.5, dist);
                col = mix(col, baseColor * 1.4, borderAA * 0.35);

                finalAlpha = aa * baseAlpha;
            } else {
                // === BEAM ===
                float cx = abs(v_uv.x - 0.5) * 2.0;
                float core = exp(-cx * cx * 8.0);
                float outer = exp(-cx * cx * 2.0);

                vec3 coreColor = mix(baseColor, vec3(1.0), 0.5);
                col = mix(baseColor * outer * 0.6, coreColor, core);

                float headT = smoothstep(0.85, 1.0, v_uv.y);
                vec3 headColor = mix(baseColor, vec3(1.0), 0.3);
                col = mix(col, headColor, headT);

                vec2 hc = vec2(0.5, 0.95);
                float hd = length((v_uv - hc) * vec2(1.0, 3.0));
                col += baseColor * exp(-hd * hd * 6.0) * 0.3;

                float beamAlpha = max(core * 0.9, outer * 0.4) * baseAlpha;
                finalAlpha = aa * mix(beamAlpha, baseAlpha, headT);
            }

            // Premultiplied alpha output
            fragColor = vec4(col * finalAlpha, finalAlpha);
        }
        `;

        const vs = this._compile(gl.VERTEX_SHADER, vsSource);
        const fs = this._compile(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) { this.available = false; return; }

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('[GLNoteRenderer] Link error:', gl.getProgramInfoLog(this.program));
            this.available = false;
            return;
        }

        this.u_resolution = gl.getUniformLocation(this.program, 'u_resolution');
        this.u_time = gl.getUniformLocation(this.program, 'u_time');
    }

    _compile(type, source) {
        const gl = this.gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('[GLNoteRenderer] Shader error:', gl.getShaderInfoLog(s));
            gl.deleteShader(s);
            return null;
        }
        return s;
    }

    _initBuffers() {
        const gl = this.gl;

        const quadVerts = new Float32Array([0,0, 1,0, 0,1, 0,1, 1,0, 1,1]);
        this.quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

        this.instanceVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
        gl.bufferData(gl.ARRAY_BUFFER, this.maxInstances * this.FLOATS_PER_INSTANCE * 4, gl.DYNAMIC_DRAW);

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
        const stride = this.FLOATS_PER_INSTANCE * 4;
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
        gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
        gl.vertexAttribDivisor(2, 1);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 32);
        gl.vertexAttribDivisor(3, 1);

        gl.bindVertexArray(null);
    }

    resize(w, h) {
        if (!this.available) return;
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
    }

    renderNotes(fallingNotes, keyPositions, config) {
        if (!this.available) return;
        const gl = this.gl;
        const data = this._instanceData;
        let count = 0;
        const FPI = this.FLOATS_PER_INSTANCE;
        const speed = config.speedMultiplier;
        const canvasH = config.canvasH;
        const isClassic = config.noteStyle === 'classic';
        const t = config.time;

        for (let i = 0, len = fallingNotes.length; i < len; i++) {
            if (count >= this.maxInstances) break;
            const note = fallingNotes[i];
            const pos = keyPositions[note.note];
            if (!pos) continue;

            const dur = note.duration || 0.15;
            const noteH = Math.max(12, dur * config.noteSpeed);
            const topEdge = note.y - noteH;
            if (topEdge >= canvasH || note.y <= -50) continue;

            const noteWidth = pos.width * (isClassic ? 0.85 : 0.9);
            const noteGap = 4;
            const noteHeight = Math.max(12, dur * config.noteSpeed - noteGap);
            const x = pos.left + (pos.width - noteWidth) / 2;
            const y = note.y - noteHeight;

            const isBlackKey = pos.isBlack;
            const hand = note.hand || 0;
            const isHeld = note.hit && config.heldFallingNotes.get(note.note) === note;
            const isCoPlayManual = config.gameMode === 'coplay' && config.coPlayManualNotes.has(note.note);

            let hue, sat, lum, alpha;
            if (note.missed) {
                hue = 0; sat = isClassic ? 70 : 85; lum = isClassic ? 45 : 55; alpha = isClassic ? 0.85 : 0.9;
            } else if (note.hit && isHeld) {
                hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
                sat = isClassic ? 80 : 90; lum = isClassic ? 50 : 55; alpha = 1.0;
            } else if (note.hit) {
                hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
                sat = isClassic ? 50 : 60; lum = isClassic ? 35 : 40; alpha = isClassic ? 0.3 : 0.35;
            } else if (config.gameMode === 'practice' && config.practiceWaiting &&
                       config.practiceExpectedNotes.has(note.note) && !note.hit) {
                hue = 50; sat = 100; lum = 55; alpha = 1.0;
            } else if (isCoPlayManual) {
                hue = 30; sat = 100; lum = 55; alpha = 1.0;
            } else if (config.gameMode === 'coplay') {
                hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
                sat = 70; lum = 40; alpha = 0.45;
            } else {
                hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
                sat = isClassic ? 70 : 80; lum = isClassic ? 50 : 45; alpha = 0.9;
            }

            let adjHue = hue;
            if (isClassic) {
                if (note._glassSeed == null) {
                    const raw = ((note.note?.charCodeAt(0) || 0) * 7 + (note.startTime || 0) * 13 + (note.note?.length || 0) * 31) >>> 0;
                    note._glassSeed = (raw % 1000) / 1000;
                }
                adjHue = hue + ((note._glassSeed - 0.5) * 16) | 0;
            }

            const rgb = this._hslToRgb(adjHue, sat, lum);
            const r = isClassic ? Math.min(5, noteWidth / 2, noteHeight / 2) : 3;
            const glowStr = !isClassic ? (isHeld ? 0.8 : 0.3) : (isHeld ? 0.4 : 0.1);
            const style = isClassic ? 0.0 : 1.0;
            const topBoost = isClassic ? (note._glassSeed || 0.5) : 0.0;

            const off = count * FPI;
            data[off     ] = x;
            data[off +  1] = y;
            data[off +  2] = noteWidth;
            data[off +  3] = noteHeight;
            data[off +  4] = rgb[0];
            data[off +  5] = rgb[1];
            data[off +  6] = rgb[2];
            data[off +  7] = alpha;
            data[off +  8] = r;
            data[off +  9] = glowStr;
            data[off + 10] = style;
            data[off + 11] = topBoost;
            count++;
        }

        this._instanceCount = count;

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (count === 0) return;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, count * FPI));

        gl.useProgram(this.program);
        gl.uniform2f(this.u_resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.u_time, t);

        gl.bindVertexArray(this.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
        gl.bindVertexArray(null);
    }

    _hslToRgb(h, s, l) {
        h = ((h % 360) + 360) % 360;
        s /= 100; l /= 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r, g, b;
        if (h < 60)       { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else               { r = c; g = 0; b = x; }
        return [r + m, g + m, b + m];
    }

    destroy() {
        if (!this.available) return;
        const gl = this.gl;
        gl.deleteBuffer(this.quadVBO);
        gl.deleteBuffer(this.instanceVBO);
        gl.deleteVertexArray(this.vao);
        gl.deleteProgram(this.program);
    }
}
