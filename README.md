# Piano Hero

A browser-based piano rhythm game with Synthesia-style falling notes, a full 88-key piano, sample-based instrument playback, local MIDI files, BitMidi search, and Online Sequencer import.

## Features

- **Song sources**: load MIDI files from `midi/`, search BitMidi, or send songs from Online Sequencer with the bookmarklet flow.
- **Game modes**: manual, auto play, simple merged-note mode, practice mode, microphone practice, and co-play lane selection.
- **Piano playback**: Web Audio API graph with soundfont instruments, master volume, reverb, EQ, and dynamics compression.
- **Visuals**: PixiJS falling-note renderer, per-key FX, ribbon/glow overlays, configurable graphics quality, and responsive 88-key layout.
- **Performance pipeline**: Web Worker preprocessing, optional WASM note-height math, visible-note windowing, and runtime perf diagnostics.
- **Backend**: Flask API for static app hosting, MIDI parsing, Online Sequencer, BitMidi, and cache management.

## Quick Start

### Local Python

```bash
pip install -r requirements.txt
python server.py
```

Open http://127.0.0.1:5000/ in your browser.

### Docker

```bash
docker build -t piano-hero .
docker run --rm -p 5000:5000 \
  -v "$(pwd)/midi_cache:/app/midi_cache" \
  --name piano-hero \
  piano-hero
```

PowerShell:

```powershell
docker run --rm -p 5000:5000 `
  -v "${PWD}/midi_cache:/app/midi_cache" `
  --name piano-hero `
  piano-hero
```

## How To Play

1. Open the song browser in the header.
2. Choose a local MIDI file, search BitMidi, or use the Online Sequencer tab.
3. Pick manual or auto play, then press Play.
4. Hit notes as they reach the keyboard. Long notes should be held through their duration.
5. Use the settings menu for instruments, speed, graphics quality, note style, FX, and practice options.

## Controls

- **A** = C4
- **W** = C#4
- **S** = D4
- **E** = D#4
- **D** = E4
- **F** = F4
- **T** = F#4
- **G** = G4
- **Y** = G#4
- **H** = A4
- **U** = A#4
- **J** = B4
- **K** = C5

You can also click or tap piano keys directly.

## Architecture

### Frontend

- [index.html](index.html) defines the browser UI.
- [app.js](app.js) owns game state, input, scoring, audio, song loading, and the render loop.
- [pixi-renderer.js](pixi-renderer.js) draws falling notes on `#pixiCanvas` with PixiJS.
- [piano-fx.js](piano-fx.js) and [PianoKeySparkFX.js](PianoKeySparkFX.js) draw keypress FX.
- [performance-worker.js](performance-worker.js) precomputes BPM, simple-mode notes, and durations off the main thread.
- [note-math.wasm](note-math.wasm) is an optional fast path for note-height math, with JavaScript fallback.

PixiJS is still GPU-backed internally, but this project no longer carries the older hand-written WebGL renderer.

### Backend

- [server.py](server.py) serves the app, lists and parses local MIDI files, proxies Online Sequencer and BitMidi workflows, and writes reusable JSON cache files under `midi_cache/`.
- [requirements.txt](requirements.txt) contains only the Python packages needed by the current app.

## API Endpoints

- `GET /api/midi-files`: list `.mid` / `.midi` files from `midi/`.
- `POST /api/load-midi`: parse a local MIDI file into game notes.
- `POST /api/midi-files/rename`: rename a local MIDI file.
- `POST /api/midi-files/delete`: delete a local MIDI file.
- `GET /api/onlineseq/search`: search Online Sequencer.
- `POST /api/onlineseq/load`: load an Online Sequencer song by sequence ID.
- `GET|POST /api/onlineseq/cookie`: bookmarklet session handoff support for Online Sequencer.
- `POST /api/onlineseq/upload_midi`: receive MIDI bytes from the bookmarklet.
- `GET /api/onlineseq/upload_stream`: server-sent events for bookmarklet uploads.
- `GET /api/onlineseq/last_upload`: fallback retrieval of the last bookmarklet upload.
- `GET /api/bitmidi/search`: search BitMidi.
- `POST /api/bitmidi/preview`: preview a BitMidi result without saving it to `midi/`.
- `POST /api/bitmidi/load`: download, cache, and load a BitMidi song.

## Project Layout

```text
PianoHero/
|-- app.js
|-- index.html
|-- pixi-renderer.js
|-- piano-fx.js
|-- PianoKeySparkFX.js
|-- performance-worker.js
|-- note-math.wasm
|-- server.py
|-- styles.css
|-- midi/
|-- midi_cache/
`-- images/
```

## Configuration

Copy [.env.example](.env.example) to `.env` if you want to override defaults.

- `PORT`: server port, default `5000`.
- `FLASK_ENV`: `development` or `production`.

Personal browser cookie exports should not be committed; `cookie.txt` and `cookies.txt` are ignored.

## Credits

- Piano samples are loaded at runtime from MIDI.js Soundfonts generated from FluidR3_GM.sf2.

## MIDI Sources

- https://onlinesequencer.net/playlist/23554/1989077
