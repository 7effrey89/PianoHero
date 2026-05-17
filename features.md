# Piano Hero — Features

## Song Sources

### Local MIDI Files
Load MIDI files from the `midi/` folder. Songs are listed in a dropdown for quick selection.

### BitMidi Search
Search and browse thousands of MIDI files from BitMidi's online library. Preview songs before loading.

### YouTube URL
Paste a YouTube URL to automatically extract audio and convert it to MIDI using backend analysis engines (YouTube2MIDI).

---

## Game Modes

### Normal
Classic falling-notes gameplay. All notes fall and the player must hit them at the right time using keyboard bindings.

### Simple (Merged Notes)
Notes are simplified/merged for easier gameplay, reducing the number of simultaneous keys needed.

### Co-Play (Pick Your Lanes)
Choose which keys/lanes you want to play manually — the rest are auto-played by the computer. Ideal for practicing specific parts of a song.

- **Lane selectors** appear above each key to toggle manual control
- **Key remapping** — click a selected lane again to assign a custom keyboard key
- **Others Volume** — adjustable slider to lower the volume of auto-played notes so you can hear your own playing clearly
- **Orange visual theme** — manual lanes highlighted in orange with pulsing glow
- **Yellow hit flash** — distinct visual feedback when correctly hitting a note on a manual lane

### Practice (Wait for Input)
The game pauses and waits for the player to press the correct note(s) before advancing. Great for learning at your own pace.

---

## Playback Controls

### Manual / Auto Toggle
Switch between manual play (player hits all notes) and auto-play (computer plays all notes) at any time — even mid-song without pausing.

### Play / Pause / Stop
Standard transport controls. Pause freezes the game state; resume continues from the same position.

### Speed Control
Adjust playback speed from 25% to 150%. BPM display updates accordingly.

### Song Timeline
Clickable timeline bar showing current progress. Click anywhere to seek to that position in the song.

---

## Visual Feedback

### Correct Hit (Green)
Key scales up with a green glow when hitting the correct note at the right time.

### Wrong Key (Red)
Key flashes red with a shake animation when pressing a key that doesn't match any falling note. Combo is reset.

### Co-Play Hit (Yellow)
Bright yellow flash with scale animation when correctly hitting a note on a manually-controlled lane in Co-Play mode.

### Active Key Press (Blue/Yellow)
Keys light up when pressed — blue/green for normal mode, yellow for co-play manual lanes.

---

## Sound

### Soundfont Instruments
Choose from 18+ instruments including grand piano, electric piano, harpsichord, organ, guitar, marimba, and more. Soundfonts are loaded from a CDN.

### Volume Control
Master volume slider for overall output level.

### Reverb
Adjustable reverb effect with multi-tap delay network for realistic room ambience.

### Audio Graph
Full Web Audio API pipeline with:
- Dynamics compressor for punch
- Low-shelf EQ for warmth
- High-shelf EQ for presence
- Per-note gain control

---

## Scoring

- **Points** — based on timing accuracy (closer to hit zone = more points)
- **Combo** — consecutive hits increase a multiplier; resets on miss or wrong key
- **Best Streak** — tracks longest combo achieved
- **Accuracy** — percentage of correctly hit notes vs total processed

---

## Keyboard & Input

### Keyboard Bindings
Piano keys are mapped to keyboard keys. Bindings are displayed on each key.

### Key Remapping
In Co-Play mode, click a selected lane to open the remap modal and assign any key (including Space).

### Mouse / Touch
Click or tap piano keys directly to play notes. Works on touch devices.

---

## Settings

### Key Scale
Zoom the piano keyboard from 0.5× to 3× for different screen sizes.

### Collapsible Settings Panel
Sound and Game settings in a collapsible toolbar to save screen space.

---

## Technical

### Python Flask Backend
Serves the app, handles MIDI file listing, YouTube audio extraction, and MIDI conversion.

### MIDI Caching
Converted MIDI data is cached in `midi_cache/` for instant replay on subsequent loads.

### Performance Optimizations
- **Worker preprocessing** (`performance-worker.js`) computes:
  - BPM estimate
  - simple-mode merged notes
  - normal/simple song durations
- **WebAssembly note math** (`note-math.wasm`) accelerates repeated note height calculations in render/update hot paths.
- **Mode/duration cache reuse** avoids redundant recomputation when switching between normal and simple modes.
- **Runtime diagnostics** show Worker/WASM activation and precompute mode/timing directly in the UI.

### Optimization Activation Verification
1. Load a song and open **Settings → Game**.
2. Check the perf diagnostic line:
   - `Perf: Worker ready | WASM ready | Precompute worker <ms>`
3. Confirm fallback status values when unavailable:
   - Worker: `error` / `unsupported`
   - WASM: `error` / `fetch-failed` / `unsupported`
4. Verify console timing output for each preprocess run:
   - `[PianoHero] precompute mode=... notes=... time=...ms`
5. (Optional) Verify network requests in DevTools for `performance-worker.js?v=1` and `note-math.wasm?v=1`.

### Docker Support
Dockerfile included for self-contained deployment with all dependencies (ffmpeg, yt-dlp).

### Responsive Design
Horizontal scrolling game area for wide pianos; hidden scrollbar for clean appearance.
