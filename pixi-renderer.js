// PixiJS-based note renderer for Piano Hero
// Replaces gl-renderer.js with PixiJS v8 for smoother GPU-accelerated rendering
class PixiNoteRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.available = false;
        this.app = null;
        this.noteBgGraphics = null;   // note body fills (bottom layer)
        this.noteGlow = null;         // neon glow layer (blurred + additive)
        this.noteOverlay = null;      // glossy strips + borders (top layer)
        this.notesGraphics = null;    // beam-style notes (when not classic)
        this._pendingResize = null;
        this._init(canvas);
    }

    async _init(canvas) {
        try {
            this.app = new PIXI.Application();
            const initialResolution = PixiNoteRenderer._resolveInitialResolution();
            this._currentResolution = initialResolution;
            await this.app.init({
                canvas,
                width: canvas.clientWidth || canvas.width || 800,
                height: canvas.clientHeight || canvas.height || 600,
                backgroundAlpha: 0,
                antialias: true,
                resolution: initialResolution,
                autoDensity: false,
                preference: 'webgl',
            });

            // Layer 1: Note body fills (classic mode)
            this.noteGlow = new PIXI.Graphics();
            this.noteGlow.blendMode = 'add';
            if (PIXI.BlurFilter) {
                const blur = new PIXI.BlurFilter(6);
                blur.quality = 2;
                this.noteGlow.filters = [blur];
            }
            this.app.stage.addChild(this.noteGlow);

            this.noteBgGraphics = new PIXI.Graphics();
            this.app.stage.addChild(this.noteBgGraphics);

            // Layer 2: Note overlay (glossy strip + border for classic; or full beam notes)
            this.noteOverlay = new PIXI.Graphics();
            this.app.stage.addChild(this.noteOverlay);

            // Beam notes layer (used when not in classic mode)
            this.notesGraphics = new PIXI.Graphics();
            this.app.stage.addChild(this.notesGraphics);

            // Manual rendering — we drive renders from our own RAF loop
            this.app.ticker.stop();

            // Apply any resize that was requested before init completed
            if (this._pendingResize) {
                this.app.renderer.resize(this._pendingResize.w, this._pendingResize.h);
                this._pendingResize = null;
            }
            // Apply any quality change requested before init completed
            if (this._pendingQuality) {
                const q = this._pendingQuality;
                this._pendingQuality = null;
                this.setQuality(q);
            }

            this.available = true;
            console.log('[PixiNoteRenderer] Ready (PixiJS ' + PIXI.VERSION + ')');
        } catch (e) {
            console.warn('[PixiNoteRenderer] Init failed:', e);
            this.available = false;
        }
    }

    resize(w, h) {
        if (this.app && this.app.renderer) {
            this.app.renderer.resize(w, h);
        } else {
            this._pendingResize = { w, h };
        }
    }

    /**
     * Runtime quality knob. `resolution` is clamped 0.75..2. Changing it
     * here resizes the backing GPU buffer without recreating the context.
     */
    setQuality({ resolution } = {}) {
        if (!this.app || !this.app.renderer) {
            this._pendingQuality = { resolution };
            return;
        }
        if (typeof resolution === 'number' && isFinite(resolution)) {
            const target = Math.max(0.75, Math.min(resolution, 2));
            if (!this._currentResolution || Math.abs(this._currentResolution - target) > 0.01) {
                this._currentResolution = target;
                try {
                    this.app.renderer.resolution = target;
                    const w = this.canvas.clientWidth || this.canvas.width;
                    const h = this.canvas.clientHeight || this.canvas.height;
                    if (w && h) this.app.renderer.resize(w, h);
                } catch (e) {
                    console.warn('[PixiNoteRenderer] setQuality failed:', e);
                }
            }
        }
    }

    static _resolveInitialResolution() {
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        try {
            const raw = localStorage.getItem('pianoHeroSettings');
            if (!raw) return Math.min(dpr, 1.5);
            const s = JSON.parse(raw);
            switch (s && s.graphicsPreset) {
                case 'low': return 1;
                case 'high': return Math.min(dpr, 2);
                case 'medium':
                case 'custom':
                default: return Math.min(dpr, 1.5);
            }
        } catch (_) {
            return Math.min(dpr, 1.5);
        }
    }

    /**
    * Main render call — draws notes, then flushes to GPU.
    * Matches the GLNoteRenderer.renderNotes() signature.
     */
    renderNotes(fallingNotes, keyPositions, config) {
        if (!this.available) return;

        const glow = this.noteGlow;
        const bg = this.noteBgGraphics;
        const ov = this.noteOverlay;
        const ng = this.notesGraphics;
        glow.clear();
        bg.clear();
        ov.clear();
        ng.clear();

        const w = this.app.renderer.width;
        const h = this.app.renderer.height;

        // Draw background overlay on GPU canvas (so it doesn't sit on top of notes)
        if (config.bgOverlayOpacity > 0) {
            bg.rect(0, 0, w, h);
            bg.fill({ color: 0x0e0b22, alpha: config.bgOverlayOpacity });
        }

        const { noteSpeed, speedMultiplier, noteStyle, canvasH,
            gameMode, practiceWaiting, practiceExpectedNotes,
            coPlayManualNotes, heldFallingNotes, neonGlow } = config;

        const isClassic = noteStyle === 'classic';

        // Layer culling — skip traversal of layers that won't draw this frame.
        ng.renderable = !isClassic;
        glow.renderable = !!neonGlow;
        bg.renderable = isClassic || config.bgOverlayOpacity > 0;
        ov.renderable = isClassic;

        // Visible-note windowing: only iterate notes near the viewport when provided
        const startIdx = (typeof config.renderStartIdx === 'number') ? config.renderStartIdx : 0;
        const endIdxRaw = (typeof config.renderEndIdx === 'number') ? config.renderEndIdx : fallingNotes.length;
        // Clamp endIdx so a stale cursor (e.g. left over from a previous song)
        // can't index past the end of fallingNotes and throw.
        const endIdx = Math.min(endIdxRaw, fallingNotes.length);

        for (let i = startIdx; i < endIdx; i++) {
            const note = fallingNotes[i];
            const pos = keyPositions[note.note];
            if (!pos) continue;

            const dur = note.duration || 0.15;
            const noteH = Math.max(12, dur * noteSpeed);
            const topEdge = note.y - noteH;
            if (topEdge >= canvasH || note.y <= -50) continue;

            if (isClassic) {
                this._drawNoteClassicBody(glow, bg, ov, note, pos, noteSpeed, speedMultiplier, gameMode, heldFallingNotes, neonGlow);
            } else {
                this._drawNoteBeam(glow, ng, note, pos, noteSpeed, speedMultiplier, gameMode,
                    practiceWaiting, practiceExpectedNotes, coPlayManualNotes, heldFallingNotes, neonGlow);
            }
        }

        // Single GPU flush
        this.app.render();
    }

    // ─── Beam-style notes (laser beams) ──────────────────────────────
    _drawNoteBeam(glow, g, note, pos, noteSpeed, speedMult, gameMode,
                  practiceWaiting, practiceExpectedNotes, coPlayManualNotes, heldFallingNotes, neonGlow) {
        const noteWidth = pos.width * 0.9;
        const dur = note.duration || 0.15;
        const noteGap = 4;
        const noteHeight = Math.max(12, dur * noteSpeed - noteGap);
        const x = pos.left + (pos.width - noteWidth) / 2;
        const y = note.y - noteHeight;

        const isHeld = note.hit && heldFallingNotes.get(note.note) === note;
        const isCoPlayManual = gameMode === 'coplay' && coPlayManualNotes.has(note.note);
        const hand = note.hand || 0;
        const isBlackKey = pos.isBlack;

        let hue, sat, lum, alpha;
        if (note.missed) {
            hue = 0; sat = 85; lum = 55; alpha = 0.9;
        } else if (note.hit && isHeld) {
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 95; lum = 70; alpha = 1.0;
        } else if (note.hit) {
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 60; lum = 40; alpha = 0.35;
        } else if (gameMode === 'practice' && practiceWaiting &&
                   practiceExpectedNotes.has(note.note) && !note.hit) {
            hue = 50; sat = 100; lum = 55; alpha = 1.0;
        } else if (isCoPlayManual) {
            hue = 30; sat = 100; lum = 55; alpha = 1.0;
        } else if (gameMode === 'coplay') {
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 70; lum = 40; alpha = 0.45;
        } else {
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 80; lum = 45; alpha = 0.9;
        }

        const centerX = x + noteWidth / 2;
        const beamWidth = noteWidth * 0.35;
        const headHeight = Math.min(14, noteHeight);
        const tailHeight = noteHeight - headHeight;
        const headY = note.y - headHeight;

        if (neonGlow && glow) {
            const glowPadX = 10;
            const glowPadY = 14;
            const glowW = noteWidth + glowPadX * 2;
            const glowH = noteHeight + glowPadY * 2;
            const gx = x - glowPadX;
            const gy = y - glowPadY;
            glow.roundRect(gx, gy, glowW, glowH, 10);
            glow.fill({ color: this._hslToHex(hue, Math.max(30, sat - 12), Math.min(lum + 24, 85)), alpha: alpha * 0.6 });
        }

        // Beam tail — outer glow + bright core
        if (tailHeight > 2) {
            const glowW = beamWidth * 1.6;
            g.rect(centerX - glowW / 2, y, glowW, tailHeight);
            g.fill({ color: this._hslToHex(hue, sat, lum), alpha: alpha * 0.2 });

            const coreW = beamWidth * 0.4;
            g.rect(centerX - coreW / 2, y, coreW, tailHeight);
            g.fill({ color: this._hslToHex(hue, Math.max(30, sat - 20), Math.min(lum + 20, 75)), alpha: alpha * 0.8 });
        }

        // Head
        g.rect(x + 2, headY + 1, noteWidth - 4, headHeight - 2);
        g.fill({ color: this._hslToHex(hue, sat, lum), alpha: alpha });

        // Head highlight strip
        g.rect(x + 3, headY + 1, noteWidth - 6, Math.max(3, headHeight * 0.35));
        g.fill({ color: this._hslToHex(hue, 30, Math.min(lum + 25, 75)), alpha: alpha * 0.5 });
    }

    // ─── Classic-style notes (matching original Canvas 2D visuals) ──
    // Draws body fill on bg layer, glossy strip + border on overlay layer.
    _drawNoteClassicBody(glow, bg, ov, note, pos, noteSpeed, speedMult, gameMode, heldFallingNotes, neonGlow) {
        const noteWidth = pos.width * 0.85;
        const dur = note.duration || 0.15;
        const noteGap = 4;
        const noteHeight = Math.max(12, dur * noteSpeed - noteGap);
        const x = pos.left + (pos.width - noteWidth) / 2;
        const y = note.y - noteHeight;

        const isHeld = note.hit && heldFallingNotes.get(note.note) === note;
        const hand = note.hand || 0;
        const isBlackKey = pos.isBlack;

        let hue, sat, lum, alpha;
        if (note.missed) {
            hue = 0; sat = 70; lum = 45; alpha = 0.85;
        } else if (note.hit && isHeld) {
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 90; lum = 70; alpha = 1.0;
        } else if (note.hit) {
            // Hit but no longer held — fade out gently instead of going dark
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 40; lum = 55; alpha = 0.5;
        } else {
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 70; lum = 50; alpha = 0.9;
        }

        const color = this._hslToHex(hue, sat, lum);
        const r = 4; // corner radius

        if (neonGlow && glow) {
            const glowPadX = 10;
            const glowPadY = 14;
            const glowW = noteWidth + glowPadX * 2;
            const glowH = noteHeight + glowPadY * 2;
            const gx = x - glowPadX;
            const gy = y - glowPadY;
            glow.roundRect(gx, gy, glowW, glowH, r + 6);
            glow.fill({ color: this._hslToHex(hue, Math.max(25, sat - 12), Math.min(lum + 22, 84)), alpha: alpha * 0.55 });
        }

        // Body fill (bg layer) — full alpha, matching original GL renderer
        bg.roundRect(x, y, noteWidth, noteHeight, r);
        bg.fill({ color, alpha: alpha });

        // Active glow when held — bright overlay to make note "light up"
        if (note.hit && isHeld) {
            ov.roundRect(x, y, noteWidth, noteHeight, r);
            ov.fill({ color: this._hslToHex(hue, 60, 85), alpha: 0.35 });
        }

        // Glossy top strip (overlay layer)
        const glossH = Math.min(noteHeight * 0.25, 12);
        ov.roundRect(x, y, noteWidth, glossH, r);
        ov.fill({ color: this._hslToHex(hue, 20, 90), alpha: alpha * 0.25 });

        // Border (overlay layer)
        ov.roundRect(x + 0.5, y + 0.5, noteWidth - 1, noteHeight - 1, r);
        ov.stroke({ color: this._hslToHex(hue, sat, Math.min(lum + 25, 80)), alpha: alpha * 0.5, width: 1 });

    }

    // ─── Utility ─────────────────────────────────────────────────────
    // HSL→hex with a memo cache. Notes resolve to a small palette per frame,
    // so caching collapses the work to roughly one compute per unique color.
    _hslToHex(h, s, l) {
        const hi = ((((h | 0) % 360) + 360) % 360) | 0;
        const si = Math.max(0, Math.min(100, s | 0));
        const li = Math.max(0, Math.min(100, l | 0));
        const key = (hi << 16) | (si << 8) | li;
        const cache = PixiNoteRenderer._HSL_CACHE;
        const cached = cache.get(key);
        if (cached !== undefined) return cached;
        const sf = si / 100;
        const lf = li / 100;
        const a = sf * Math.min(lf, 1 - lf);
        const f = (n) => {
            const k = (n + hi / 30) % 12;
            return lf - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        };
        const r = Math.round(f(0) * 255);
        const gv = Math.round(f(8) * 255);
        const b = Math.round(f(4) * 255);
        const hex = (r << 16) | (gv << 8) | b;
        // Hard cap to keep memory bounded; the palette is well under this.
        if (cache.size >= 4096) cache.clear();
        cache.set(key, hex);
        return hex;
    }

    destroy() {
        if (this.app) {
            this.app.destroy(true);
            this.app = null;
        }
        this.available = false;
    }
}

// Shared HSL→hex memo cache (small palette, ~tens of entries per session)
PixiNoteRenderer._HSL_CACHE = new Map();
