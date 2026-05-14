#!/usr/bin/env python3
"""
Piano Hero - Python Backend Server
Serves MIDI files and provides BitMidi integration
"""

import os
import re
import json
import hashlib
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests as http_requests
import mido
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__, static_folder='.')
CORS(app)

# Paths & configuration
BASE_DIR = Path(__file__).parent
MIDI_CACHE_DIR = BASE_DIR / 'midi_cache'
MIDI_CACHE_DIR.mkdir(exist_ok=True)

# Get environment configuration
def parse_bool_env(env_var, default='true'):
    """Parse boolean environment variable."""
    value = os.getenv(env_var, default).lower()
    return value in ('true', '1', 'yes', 'on', 'enabled')

FLASK_ENV = os.getenv('FLASK_ENV', 'development')
DEFAULT_DEBUG = 'false' if FLASK_ENV.lower() == 'production' else 'true'
DEBUG_MODE = parse_bool_env('FLASK_DEBUG', DEFAULT_DEBUG)


def convert_midi_to_notes(midi_path):
    """Convert MIDI file to note events for the game.

    Uses mido.merge_tracks() so that tempo meta-events (which typically
    live in track 0 of Type-1 files) are interleaved correctly with note
    events from all other tracks.  active_notes is keyed by (channel, note)
    so the same pitch on different channels doesn't collide.
    """
    try:
        mid = mido.MidiFile(midi_path)
        notes = []
        tempo = 500000  # Default tempo (120 BPM)

        current_time = 0
        active_notes = {}  # (channel, midi_note) -> (start_time, channel)
        # Track which channels carry notes (for hand assignment)
        note_channels = set()

        for msg in mido.merge_tracks(mid.tracks):
            current_time += mido.tick2second(msg.time, mid.ticks_per_beat, tempo)

            if msg.type == 'set_tempo':
                tempo = msg.tempo
            elif msg.type == 'note_on' and msg.velocity > 0:
                key = (msg.channel, msg.note)
                note_channels.add(msg.channel)
                # Re-trigger: close the previous instance of this note first
                if key in active_notes:
                    start_time = active_notes[key]
                    duration = current_time - start_time
                    if duration > 0:
                        note_name = midi_note_to_game_note(msg.note)
                        if note_name:
                            notes.append({
                                'note': note_name,
                                'time': start_time,
                                'duration': duration,
                                'ch': msg.channel
                            })
                active_notes[key] = current_time
            elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                key = (msg.channel, msg.note)
                if key in active_notes:
                    start_time = active_notes[key]
                    duration = current_time - start_time
                    note_name = midi_note_to_game_note(msg.note)
                    if note_name and duration > 0:
                        notes.append({
                            'note': note_name,
                            'time': start_time,
                            'duration': duration,
                            'ch': msg.channel
                        })
                    del active_notes[key]

        # Flush notes that never received a note_off
        for (channel, midi_note), start_time in active_notes.items():
            note_name = midi_note_to_game_note(midi_note)
            if note_name:
                notes.append({
                    'note': note_name,
                    'time': start_time,
                    'duration': 0.25,
                    'ch': channel
                })

        # Assign hand labels based on channel median pitch
        if len(note_channels) >= 2:
            ch_list = sorted(note_channels)
            ch_pitches = {c: [] for c in ch_list}
            for n in notes:
                ch_pitches[n['ch']].append(n['note'])
            
            note_order = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
            def pitch_val(name):
                oct = int(name[-1])
                base = name[:-1]
                return oct * 12 + note_order.index(base)
            
            ch_median = {}
            for c, pitches in ch_pitches.items():
                if pitches:
                    vals = sorted(pitch_val(p) for p in pitches)
                    ch_median[c] = vals[len(vals) // 2]
                else:
                    ch_median[c] = 0
            
            sorted_chs = sorted(ch_median.keys(), key=lambda c: ch_median[c], reverse=True)
            hand_map = {}
            for i, c in enumerate(sorted_chs):
                hand_map[c] = i
            
            for n in notes:
                n['hand'] = hand_map.get(n['ch'], 0)
        else:
            for n in notes:
                n['hand'] = 0

        # Remove internal ch field
        for n in notes:
            del n['ch']

        # Merge truly overlapping same-pitch notes (one starts while the
        # other is still sounding).  Sequential notes that merely abut
        # (end == start) must stay separate — they are repeated key presses.
        notes.sort(key=lambda x: (x['note'], x['time']))
        merged = []
        i = 0
        while i < len(notes):
            n = dict(notes[i])
            n_end = n['time'] + n['duration']
            # Only absorb notes that start DURING the current note (true overlap)
            while i + 1 < len(notes) and notes[i + 1]['note'] == n['note']:
                nxt = notes[i + 1]
                nxt_start = nxt['time']
                # Strict overlap: next note starts before current note ends
                # Small tolerance (10ms) for MIDI timing jitter only
                if nxt_start < n_end - 0.01:
                    # Extend to cover the later note
                    nxt_end = nxt_start + nxt['duration']
                    if nxt_end > n_end:
                        n['duration'] = nxt_end - n['time']
                        n_end = nxt_end
                    i += 1
                else:
                    break
            merged.append(n)
            i += 1
        notes = merged

        # Sort by time
        notes.sort(key=lambda x: x['time'])
        return notes
    except Exception as e:
        print(f"Error converting MIDI: {e}")
        return []


def midi_note_to_game_note(midi_note):
    """Convert MIDI note number to game note name.

    Supports the full piano range A0 (MIDI 21) through C8 (MIDI 108).
    Notes outside that range are clamped by octave transposition.
    """
    note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

    # Clamp into A0 (21) – C8 (108) by octave transposition
    while midi_note < 21:
        midi_note += 12
    while midi_note > 108:
        midi_note -= 12

    octave = (midi_note // 12) - 1
    note_index = midi_note % 12
    return f"{note_names[note_index]}{octave}"


# ── Routes ───────────────────────────────────────────────────────────

@app.route('/')
def index():
    """Serve the main page"""
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files"""
    return send_from_directory('.', path)

@app.route('/api/midi-files', methods=['GET'])
def list_midi_files():
    """List available .mid files in the midi/ folder"""
    midi_dir = BASE_DIR / 'midi'
    if not midi_dir.is_dir():
        return jsonify({'files': []})
    files = sorted(f.name for f in midi_dir.iterdir() if f.suffix.lower() in ('.mid', '.midi'))
    return jsonify({'files': files})

@app.route('/api/load-midi', methods=['POST'])
def load_midi_file():
    """Load a local .mid file and convert it to game notes"""
    data = request.json
    filename = data.get('filename')
    if not filename:
        return jsonify({'error': 'Filename is required'}), 400

    # Sanitize: only allow the basename, no path traversal
    safe_name = Path(filename).name
    midi_path = BASE_DIR / 'midi' / safe_name

    if not midi_path.is_file() or midi_path.suffix.lower() not in ('.mid', '.midi'):
        return jsonify({'error': 'MIDI file not found'}), 404

    notes = convert_midi_to_notes(str(midi_path))
    if not notes:
        return jsonify({'error': 'Could not parse any notes from the MIDI file'}), 422

    return jsonify({
        'success': True,
        'notes': notes,
        'filename': safe_name,
        'noteCount': len(notes)
    })

@app.route('/api/midi-files/rename', methods=['POST'])
def rename_midi_file():
    """Rename a MIDI file in the midi/ folder"""
    data = request.json
    old_name = data.get('oldName', '').strip()
    new_name = data.get('newName', '').strip()

    if not old_name or not new_name:
        return jsonify({'error': 'Both oldName and newName are required'}), 400

    # Sanitize: only allow basename, no path traversal
    safe_old = Path(old_name).name
    safe_new = Path(new_name).name
    if not safe_new.lower().endswith(('.mid', '.midi')):
        safe_new += '.mid'

    midi_dir = BASE_DIR / 'midi'
    old_path = midi_dir / safe_old
    new_path = midi_dir / safe_new

    if not old_path.is_file():
        return jsonify({'error': 'File not found'}), 404
    if new_path.exists():
        return jsonify({'error': 'A file with that name already exists'}), 409

    old_path.rename(new_path)
    return jsonify({'success': True, 'newName': safe_new})


@app.route('/api/midi-files/delete', methods=['POST'])
def delete_midi_file():
    """Delete a MIDI file from the midi/ folder"""
    data = request.json
    filename = data.get('filename', '').strip()

    if not filename:
        return jsonify({'error': 'Filename is required'}), 400

    safe_name = Path(filename).name
    midi_dir = BASE_DIR / 'midi'
    file_path = midi_dir / safe_name

    if not file_path.is_file() or file_path.suffix.lower() not in ('.mid', '.midi'):
        return jsonify({'error': 'File not found'}), 404

    file_path.unlink()
    return jsonify({'success': True})


# ── BitMidi integration ──────────────────────────────────────────────

def _get_bitmidi_download_url(slug):
    """Fetch a BitMidi song page and return the .mid download URL, or None."""
    page_resp = http_requests.get(
        f'https://bitmidi.com{slug}',
        headers={'User-Agent': 'PianoHero/1.0'},
        timeout=10,
    )
    page_resp.raise_for_status()

    dl_match = re.search(r'href="(https?://bitmidi\.com/uploads/[^"]+\.mid)"', page_resp.text)
    if not dl_match:
        dl_match = re.search(r'href="(/uploads/[^"]+\.mid)"', page_resp.text)
    if not dl_match:
        return None

    dl_url = dl_match.group(1)
    if dl_url.startswith('/'):
        dl_url = 'https://bitmidi.com' + dl_url
    return dl_url


@app.route('/api/bitmidi/preview', methods=['POST'])
def bitmidi_preview():
    """Fetch a MIDI file from BitMidi and return parsed notes for preview (no save to midi/)."""
    data = request.json
    slug = data.get('slug', '').strip()
    if not slug or not re.match(r'^/[a-z0-9][a-z0-9\-]*-mid$', slug):
        return jsonify({'error': 'Invalid slug'}), 400

    # Check cache first
    cache_key = hashlib.sha256(slug.encode()).hexdigest()[:16]
    cache_file = MIDI_CACHE_DIR / f"bitmidi_{cache_key}.json"
    if cache_file.exists():
        with open(cache_file, 'r') as f:
            cached = json.load(f)
        return jsonify({'notes': cached.get('notes', []), 'noteCount': cached.get('noteCount', 0)})

    try:
        dl_url = _get_bitmidi_download_url(slug)
        if not dl_url:
            return jsonify({'error': 'Could not find download link'}), 404

        midi_resp = http_requests.get(dl_url, timeout=15)
        midi_resp.raise_for_status()

        # Save to temp file for parsing only
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.mid', delete=False) as tmp:
            tmp.write(midi_resp.content)
            tmp_path = tmp.name
        try:
            notes = convert_midi_to_notes(tmp_path)
        finally:
            os.unlink(tmp_path)

        if not notes:
            return jsonify({'error': 'Could not parse any notes from the MIDI file'}), 422

        # Cache preview result (without savedAs so load knows to re-download)
        preview_cache = {
            'notes': notes,
            'slug': slug,
            'noteCount': len(notes),
        }
        with open(cache_file, 'w') as f:
            json.dump(preview_cache, f)

        return jsonify({'notes': notes, 'noteCount': len(notes)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bitmidi/search', methods=['GET'])
def bitmidi_search():
    """Proxy search requests to bitmidi.com and scrape results."""
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'results': []})

    resp = http_requests.get(
        'https://bitmidi.com/search',
        params={'q': query},
        headers={'User-Agent': 'PianoHero/1.0'},
        timeout=10,
    )
    resp.raise_for_status()

    # Parse result links from the HTML
    # Each result is an <a> with a title attribute and href like /pokemon-pokemon-center-theme-mid
    results = []
    for m in re.finditer(
        r'<a\s[^>]*href="(/[a-z0-9][a-z0-9\-]*-mid)"[^>]*title="([^"]+)"',
        resp.text,
        re.IGNORECASE,
    ):
        slug = m.group(1)
        name = m.group(2).strip()
        if name and slug not in [r['slug'] for r in results]:
            results.append({'slug': slug, 'name': name})

    return jsonify({'results': results})


@app.route('/api/bitmidi/load', methods=['POST'])
def bitmidi_load():
    """Fetch a MIDI file from bitmidi.com by its page slug, convert to game notes."""
    data = request.json
    slug = data.get('slug', '').strip()
    name = data.get('name', '').strip()
    if not slug or not re.match(r'^/[a-z0-9][a-z0-9\-]*-mid$', slug):
        return jsonify({'error': 'Invalid slug'}), 400

    # Check cache first
    cache_key = hashlib.sha256(slug.encode()).hexdigest()[:16]
    cache_file = MIDI_CACHE_DIR / f"bitmidi_{cache_key}.json"
    if cache_file.exists():
        with open(cache_file, 'r') as f:
            cached = json.load(f)
        # Ensure the .mid file also exists in midi/ folder
        midi_dir = BASE_DIR / 'midi'
        saved_name = cached.get('savedAs', '')
        if not saved_name or not (midi_dir / saved_name).is_file():
            # Re-download and save
            cache_file.unlink()
        else:
            return jsonify(cached)

    dl_url = _get_bitmidi_download_url(slug)
    if not dl_url:
        return jsonify({'error': 'Could not find download link on bitmidi page'}), 404

    # Download the MIDI file
    midi_resp = http_requests.get(dl_url, timeout=15)
    midi_resp.raise_for_status()

    # Save to midi/ folder
    midi_dir = BASE_DIR / 'midi'
    midi_dir.mkdir(exist_ok=True)
    # Derive a safe filename from the name or slug
    if name:
        safe_name = re.sub(r'[<>:"/\\|?*]', '', name)
    else:
        safe_name = slug.strip('/').replace('-mid', '').replace('-', ' ').title()
    if not safe_name.lower().endswith('.mid'):
        safe_name += '.mid'
    midi_path = midi_dir / safe_name
    # Avoid overwriting: append number if exists
    counter = 1
    while midi_path.exists():
        stem = safe_name.rsplit('.', 1)[0]
        midi_path = midi_dir / f"{stem} ({counter}).mid"
        counter += 1
    midi_path.write_bytes(midi_resp.content)

    notes = convert_midi_to_notes(str(midi_path))

    if not notes:
        return jsonify({'error': 'Could not parse any notes from the MIDI file'}), 422

    result = {
        'success': True,
        'notes': notes,
        'slug': slug,
        'noteCount': len(notes),
        'savedAs': midi_path.name,
    }
    with open(cache_file, 'w') as f:
        json.dump(result, f)

    return jsonify(result)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Piano Hero Python server starting on port {port}")
    print(f"MIDI cache directory: {MIDI_CACHE_DIR}")
    print(f"Environment: {FLASK_ENV} (debug={DEBUG_MODE})")
    app.run(host='0.0.0.0', port=port, debug=DEBUG_MODE)
