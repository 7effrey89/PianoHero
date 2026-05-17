# Piano Hero — Optimization Notes

A running log of the performance, rendering, and correctness work applied to
the client. Each entry lists the **problem**, the **fix**, and the **files /
symbols** touched so future changes can find precedent quickly.

---

## 1. GPU-accelerated note rendering (Pixi v8)

**Problem.** Drawing every falling note per frame on a 2D canvas (hundreds of
rounded rects + gradients + wave overlays) was the dominant frame cost on
mid-tier machines.

**Fix.** Introduced [`pixi-renderer.js`](pixi-renderer.js) — a Pixi v8 renderer
that owns its own `#glCanvas` and draws notes, classic-bar fills, wave ribbons,
and the background overlay via batched `Graphics` calls. The 2D `#notesCanvas`
sits on top and is now used only for note-name labels, the force-field hit
bar, and sparkle particles. Both canvases have transparent backgrounds and the
browser composites them natively (no `drawImage` blit per frame).

Entry point: `PixiNoteRenderer.renderNotes(fallingNotes, keyPositions, config)`
in [pixi-renderer.js](pixi-renderer.js#L130). Selected at runtime via
`if (this.glRenderer && this.glRenderer.available)` in `_renderFrame`
([app.js](app.js#L4660)). A Canvas 2D fallback still exists for the no-GPU
case.

---

## 2. Visible-note windowing (`_firstActiveIdx` / `_lastVisibleIdx`)

**Problem.** A 1500-note song iterated 1500 falling notes per frame just to
discover that most were either above or below the viewport.

**Fix.** Time-sort `fallingNotes` once, then maintain two monotonically
advancing cursors:

- `_lastVisibleIdx` advances when an upcoming note's `time` enters the
  viewport-entry cutoff (`_advanceVisibleWindow`, [app.js](app.js#L2490)).
- `_firstActiveIdx` advances when a note's drawn region has fully scrolled
  past the bottom (`_retireScrolledNotes`, [app.js](app.js#L2505)).

Both the 2D fallback loop and the Pixi renderer consume the window via
`renderStartIdx` / `renderEndIdx` config, so per-frame work is O(visible)
instead of O(total). `_resetNoteWindow()` reseats both cursors whenever the
note list is rebuilt.

---

## 3. Lookahead audio scheduler (single 50 ms interval)

**Problem.** Auto-play used to fan out one `setTimeout` per note when the song
started. A 3-minute song = thousands of pending timers, leading to GC
pressure, drift, and a one-shot-only scheduling model that fought with pause /
seek / speed-change.

**Fix.** `_scheduleAutoPlayNotes()` ([app.js](app.js#L3656)) now runs a single
`setInterval` ticking every 50 ms. Each tick schedules any note whose
game-time falls inside the next 200 ms lookahead window. Notes carry an
`_autoScheduled` flag so they aren't double-fired. `_stopAutoPlayScheduler()`
cleans up the interval on pause/reset/song-change. Result: bounded timer
count regardless of song length, smooth response to speed and seek changes.

---

## 4. Cached lane background (`_laneCanvas`)

**Problem.** Lane stripes, the hit bar, and the lane-style overlay were
redrawn from scratch every frame even though they only change on resize or
style switch.

**Fix.** `_rebuildLaneCache()` ([app.js](app.js#L4748)) renders the static
layer once to an offscreen canvas. The main render loop just blits it with
`ctx.drawImage(this._laneCanvas, 0, 0)`. `_laneCacheDirty` is flipped whenever
the lane style, key positions, or canvas size changes.

---

## 5. Web Worker precompute + WASM hot path

**Problem.** Loading a large MIDI synchronously froze the UI thread while
notes were normalized, BPM was estimated, and the simple-mode merged copy was
built.

**Fix.**
- [`performance-worker.js`](performance-worker.js) does the heavy
  precomputation off-thread (`_precomputeSongData`,
  [app.js](app.js#L351)). The Perf line in the Game panel shows
  `Worker active | WASM ready | Precompute worker 8.4 ms` so regressions are
  visible immediately.
- A WASM module accelerates the hottest inner loops (note-merge / windowing
  math) when available; everything degrades gracefully if it isn't.

---

## 6. Fixed-step logic clock with frame-time catch-up

**Problem.** Tying note positions to wall-clock `delta` per frame produced
visible stutter on jittery frames and tied note speed to display refresh
rate.

**Fix.** `_renderFrame` ([app.js](app.js#L4571)) drives a fixed-step logic
clock: `_logicAccumulatorSec` accrues real-time delta, then `update()` runs in
`_fixedStepSec` increments up to `_maxCatchupSteps`. If a frame stalls past
the catch-up budget, the clock snaps forward and resyncs in a single
`update()` call. Net result: deterministic note motion across 60/120/144 Hz
displays and recoverable behaviour after long stalls (alt-tab, GC pause).

---

## 7. Graphics presets

**Problem.** Users on weak GPUs needed an escape hatch from the rich default
look.

**Fix.** A "Graphics" dropdown in the UI Effects panel
(`_applyGraphicsPreset`, [app.js](app.js#L2381)) toggles bundled config
groups:

| Preset | Pixi | Glow | Sparkles | Waves | 2D overlay | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| Ultra-Performance | yes | off | off | 0 | skipped | 1 |
| Performance | yes | off | low | 0 | minimal | 1 |
| Balanced (default) | yes | off | medium | 6 | full | auto |
| Quality | yes | on | high | 8 | full | auto |
| Custom | user-controlled | — | — | — | — | — |

"Ultra-Performance" specifically takes the early-return path in `_renderFrame`
([app.js](app.js#L4618)) that skips the entire Canvas 2D pipeline — no lane
cache blit, no labels, no force field, no particles — only Pixi runs.

---

## 8. Neon glow as a CSS `drop-shadow()` filter

**Problem.** The original neon-glow implementation drew notes twice (once to
a blurred offscreen canvas, once normally) inside the Canvas 2D branch.
Because Pixi is the default renderer, the toggle did nothing on most setups.

**Fix.** `_applyNeonGlowCSS()` ([app.js](app.js#L2325)) sets a CSS
`drop-shadow(0 0 6px ...) drop-shadow(0 0 14px ...)` filter on both
`#glCanvas` and `#notesCanvas`. The browser composites the glow against the
transparent canvas pixels, so it works regardless of which renderer is
active and is essentially free on the GPU. Wired into the toggle change
handler, `_applyGraphicsPreset`, and `_loadSettings`.

---

## 9. Particle styles (sparkle / splash / ivory)

**Problem.** A single hard-coded particle effect didn't fit every theme.

**Fix.** `this.particleStyle` switches between `sparkle`, `splash`, and the
new rising-ember **ivory** style (white-hot core fading to gold, gentle
upward drift). Gating in `_emitHitBurst` ([app.js](app.js#L5252)) and
`_emitHeldNoteParticles` ([app.js](app.js#L5342)) ensures no work is done
when intensity is 0 or the toggle is off.

---

## 10. Settings persistence

`_saveSettings()` / `_loadSettings()` ([app.js](app.js#L2225),
[app.js](app.js#L2541)) round-trip every user-facing toggle through
`localStorage['pianoHeroSettings']`. Order matters: `autoPlay` is restored
**before** any `dispatchEvent('change')` calls so listeners don't immediately
re-save a half-loaded state. Every toggle handler also calls its corresponding
`_apply*()` so persisted state is visible on reload (e.g. neon glow shows up
as a filter on the canvases the first frame after page load).

---

## 11. Cache-busted asset versions

Stale browsers were a recurring source of "still doesn't work" reports.
`index.html` references every JS file with a `?v=N` query string and we bump
it on every meaningful change:

- `app.js?v=46`
- `pixi-renderer.js?v=5`
- `performance-worker.js?v=1`

Next bump: **v=47** / **v=6**.

---

## 12. Bug fixes worth remembering

### 12.1 Song change killed the render loop

When the user changed song mid-play, the Pixi renderer threw
`TypeError: Cannot read properties of undefined (reading 'note')` inside its
hot loop, which propagated out of the `requestAnimationFrame` callback and
permanently killed the rAF chain. Pressing Play afterwards looked like
"the notes are stuck on the previous song" — `isPlaying` flipped to `true`
but nothing repainted.

Two-part fix:

1. **Reset the cursors in `reset()`** ([app.js](app.js#L3741)):

   ```js
   this.fallingNotes = [];
   this._firstActiveIdx = 0;
   this._lastVisibleIdx = 0;
   ```

   Previously `_lastVisibleIdx` could outlive `fallingNotes.length` (e.g.
   value `15` against an empty array).

2. **Defensive clamp in the renderer** ([pixi-renderer.js](pixi-renderer.js#L172)):

   ```js
   const endIdx = Math.min(endIdxRaw, fallingNotes.length);
   ```

   So a stale cursor from anywhere can never throw again.

Also: each of the four MIDI loaders (`loadMidiFile`, `_applyUploadedSong`,
the Online Sequencer loader, `loadBitMidi`) now calls `this.reset()` after
`applyGameMode()` so `startGame`'s `preSeeked` check
([app.js](app.js#L3172)) evaluates `false` for a freshly-loaded song.

### 12.2 Sparkle / glow toggles appeared broken

Sparkle gating in `_emitHitBurst` / `_emitHeldNoteParticles` was already
correct; the user was seeing a cached `app.js`. The lesson is to **always**
bump the cache version when shipping a fix, even when the source change looks
trivial.

---

## Open / Carry-over

- [ ] **Verify Performance preset uses `resolution: 1` end-to-end** — code
  path looks correct in `_applyGraphicsPreset`, but worth a Playwright trace
  on a HiDPI display.
- [ ] **Consider exposing `window.pianoApp`** behind a `?debug=1` URL flag.
  Useful during Playwright sessions; gated so production builds stay clean.
- [ ] **Sourcemap / minified bundle** — current files are unminified for
  hackability. If asset size ever matters, an esbuild pass over `app.js` is
  the obvious next step.

---

*Last updated when shipping the song-change-kills-rAF fix (app.js v=46,
pixi-renderer.js v=5).*
