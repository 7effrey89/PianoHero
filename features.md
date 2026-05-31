# Piano Hero - Features

## Song Sources

### Local MIDI Files
Load `.mid` and `.midi` files from the `midi/` folder. Songs are listed in the browser dropdown for quick selection.

### BitMidi Search
Search and browse MIDI files from BitMidi's online library. Preview songs before saving/loading them.

### Online Sequencer
Search Online Sequencer, browse the site, or use the bookmarklet flow to send a sequence's MIDI directly into Piano Hero.

---

## Game Modes

### Normal
Classic falling-notes gameplay. All notes fall and the player must hit them at the right time using keyboard bindings.

### Simple (Merged Notes)
Notes are simplified/merged for easier gameplay, reducing the number of simultaneous keys needed.

### Co-Play (Pick Your Lanes)
Choose which keys/lanes you want to play manually; the rest are auto-played by the computer. Ideal for practicing specific parts of a song.

- **Lane selectors** appear above each key to toggle manual control.
- **Key remapping** lets you click a selected lane again to assign a custom keyboard key.
- **Others Volume** lowers the volume of auto-played notes so your part is easier to hear.
- **Orange visual theme** highlights manual lanes with pulsing glow.

### Practice (Wait For Input)
The game pauses and waits for the player to press the correct note(s) before advancing.

### Mic Practice
The game waits for detected pitch input from the microphone.

---

## Playback Controls

### Manual / Auto Toggle
Switch between manual play and auto play at any time, even mid-song.

### Play / Pause / Stop
Standard transport controls. Pause freezes the game state; resume continues from the same position.

### Speed Control
Adjust playback speed from 25% to 150%. BPM display updates accordingly.

### Song Timeline
Clickable timeline bar showing current progress. Click anywhere to seek to that position in the song.

---

## Visual Feedback

### Correct Hit
Keys scale and glow when hit at the right time.

### Wrong Key
Keys flash red with a shake animation when pressing a key that does not match any falling note. Combo is reset.

### Co-Play Hit
Manual co-play lanes use distinct yellow/orange feedback.

### Active Key Press
Pressed keys light up in the current mode's color theme.

---

## Sound

### Soundfont Instruments
Choose from piano, electric piano, harpsichord, organ, guitar, marimba, and more. Soundfonts are loaded from a CDN.

### Volume Control
Master volume slider for overall output level.

### Reverb
Adjustable reverb effect with a multi-tap delay network for room ambience.

### Audio Graph
Full Web Audio API pipeline with dynamics compression, low-shelf EQ, high-shelf EQ, and per-note gain control.

---

## Scoring

- **Points** are based on timing accuracy.
- **Combo** increases the score multiplier and resets on misses or wrong keys.
- **Best Streak** tracks the longest combo achieved.
- **Accuracy** shows correctly hit notes vs total processed notes.

---

## Keyboard & Input

### Keyboard Bindings
Piano keys are mapped to keyboard keys and shown on each key.

### Key Remapping
In Co-Play mode, click a selected lane to open the remap modal and assign any key, including Space.

### Mouse / Touch
Click or tap piano keys directly to play notes.

---

## Settings

### Key Scale
Zoom the piano keyboard from 0.5x to 3x for different screen sizes.

### Graphics Presets
Choose ultra-performance, performance, balanced, quality, or custom visual settings.

### Collapsible Settings Panel
Sound and game settings live in a collapsible toolbar to save screen space.

---

## Technical

### Python Flask Backend
Serves the app, handles MIDI file listing/parsing, Online Sequencer import, BitMidi search/load, and cache files.

### MIDI Caching
Downloaded or converted MIDI metadata is cached in `midi_cache/` for faster repeat loads.

### PixiJS Renderer
Falling notes are drawn by PixiJS on `#pixiCanvas`; the older hand-written WebGL renderer has been removed.

### Performance Optimizations
- **Worker preprocessing** (`performance-worker.js`) computes BPM estimates, simple-mode notes, and song durations.
- **WebAssembly note math** (`note-math.wasm`) accelerates repeated note-height calculations when available.
- **Mode/duration cache reuse** avoids redundant recomputation when switching modes.
- **Runtime diagnostics** show Worker/WASM activation and precompute mode/timing directly in the UI.

### Optimization Activation Verification
1. Load a song and open **Settings -> Game**.
2. Check the perf diagnostic line: `Perf: Worker ready | WASM ready | Precompute worker <ms>`.
3. Confirm fallback status values when unavailable: Worker/WASM `error`, `fetch-failed`, or `unsupported`.
4. Verify console timing output for each preprocess run: `[PianoHero] precompute mode=... notes=... time=...ms`.
5. Optionally verify network requests for `performance-worker.js?v=1` and `note-math.wasm?v=1`.

### Docker Support
Dockerfile included for self-contained deployment of the current Flask/MIDI app.

### Responsive Design
Horizontal scrolling game area for wide pianos with a hidden scrollbar for a clean appearance.
