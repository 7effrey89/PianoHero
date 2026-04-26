#!/usr/bin/env python3
"""
Piano Hero - Python Backend Server
Supports multiple MIDI conversion backends with youtube2midi as the primary implementation
"""

import os
import re
import json
import hashlib
import subprocess
import tempfile
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests as http_requests
import mido
import yt_dlp
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__, static_folder='.')
CORS(app)

# Paths & configuration
BASE_DIR = Path(__file__).parent
MIDI_CACHE_DIR = BASE_DIR / 'midi_cache'
MIDI_CACHE_DIR.mkdir(exist_ok=True)

# Cookies configuration (optional)
ENV_COOKIE_PATH = os.getenv('YTDLP_COOKIES')
DEFAULT_COOKIE_FILENAMES = ['cookies.txt', 'cookie.txt']
COOKIE_WARNING_EMITTED = False

def resolve_cookie_file():
    """Return the first cookie file that exists, or None if not found."""
    search_paths = []

    if ENV_COOKIE_PATH:
        search_paths.append(Path(ENV_COOKIE_PATH))
    else:
        search_paths.extend([BASE_DIR / name for name in DEFAULT_COOKIE_FILENAMES])

    for candidate in search_paths:
        if candidate.is_file():
            return candidate
    return None

# Get environment configuration
def parse_bool_env(env_var, default='true'):
    """
    Parse boolean environment variable, handling various formats.
    
    Args:
        env_var (str): Name of the environment variable
        default (str): Default value if env_var is not set
    
    Returns:
        bool: True if value is 'true', '1', 'yes', 'on', or 'enabled' (case-insensitive)
    
    Examples:
        >>> parse_bool_env('MY_VAR', 'true')  # MY_VAR='1' returns True
        >>> parse_bool_env('MY_VAR', 'false') # MY_VAR='no' returns False
    """
    value = os.getenv(env_var, default).lower()
    return value in ('true', '1', 'yes', 'on', 'enabled')

ENABLE_DEMO_FALLBACK = parse_bool_env('ENABLE_DEMO_FALLBACK', 'true')
FLASK_ENV = os.getenv('FLASK_ENV', 'development')
DEFAULT_DEBUG = 'false' if FLASK_ENV.lower() == 'production' else 'true'
DEBUG_MODE = parse_bool_env('FLASK_DEBUG', DEFAULT_DEBUG)

# Audio formats that yt-dlp might produce for our downloads
AUDIO_FILE_EXTENSIONS = ['.mp3', '.m4a', '.webm', '.opus', '.wav']

# Supported backends
BACKENDS = {
    'youtube2midi': 'YouTube2MIDI (Audio Analysis)',
    'basic_pitch': 'Spotify Basic Pitch (ML Model)',
    'librosa': 'Librosa (Audio Processing)',
    'aubio': 'Aubio (Real-time)',
    'magenta': 'Google Magenta (ML Model)'
}

def extract_video_id(url):
    """Extract YouTube video ID from URL"""
    import re
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
        r'^([a-zA-Z0-9_-]{11})$'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def is_valid_video_id(video_id):
    """Validate YouTube video ID format"""
    import re
    return bool(re.match(r'^[a-zA-Z0-9_-]{11}$', video_id))

def download_youtube_audio(video_id, output_path):
    """Download audio from YouTube video using yt-dlp"""
    url = f'https://www.youtube.com/watch?v={video_id}'
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        # Force yt-dlp to append the real file extension so we can locate the output
        'outtmpl': f"{output_path}.%(ext)s",
        'quiet': True,
        'no_warnings': True,
    }

    global COOKIE_WARNING_EMITTED
    cookie_file = resolve_cookie_file()
    if cookie_file:
        ydl_opts['cookiefile'] = str(cookie_file)
    elif ENV_COOKIE_PATH and not COOKIE_WARNING_EMITTED:
        print(f"Warning: Cookie file specified via YTDLP_COOKIES not found at {ENV_COOKIE_PATH}. Continuing without cookies.")
        COOKIE_WARNING_EMITTED = True
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return True
    except Exception as e:
        print(f"Error downloading audio: {e}")
        return False

def convert_midi_to_notes(midi_path):
    """Convert MIDI file to note events for the game"""
    try:
        mid = mido.MidiFile(midi_path)
        notes = []
        tempo = 500000  # Default tempo (120 BPM)
        
        for track in mid.tracks:
            current_time = 0
            active_notes = {}
            for msg in track:
                current_time += mido.tick2second(msg.time, mid.ticks_per_beat, tempo)
                
                if msg.type == 'set_tempo':
                    tempo = msg.tempo
                elif msg.type == 'note_on' and msg.velocity > 0:
                    active_notes[msg.note] = current_time
                elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                    if msg.note in active_notes:
                        start_time = active_notes[msg.note]
                        duration = current_time - start_time
                        note_name = midi_note_to_game_note(msg.note)
                        
                        if note_name:
                            notes.append({
                                'note': note_name,
                                'time': start_time,
                                'duration': duration
                            })
                        del active_notes[msg.note]
        
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

def convert_with_youtube2midi(video_id):
    """Convert YouTube video to MIDI using audio analysis"""
    print(f"Converting video {video_id} with youtube2midi method...")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = Path(tmpdir) / f"{video_id}"
        midi_path = Path(tmpdir) / f"{video_id}.mid"
        
        # Download audio
        print("Downloading audio...")
        if not download_youtube_audio(video_id, audio_path):
            return None
        
        # Find the actual audio file (yt-dlp adds extension)
        audio_file = None
        for ext in AUDIO_FILE_EXTENSIONS:
            potential_file = Path(str(audio_path) + ext)
            if potential_file.exists():
                audio_file = potential_file
                break

        # Fall back to scanning the tmp directory in case yt-dlp altered the filename
        if not audio_file:
            for candidate in Path(tmpdir).glob(f"{video_id}*"):
                suffix = candidate.suffix.lower()
                if candidate.is_file() and suffix in AUDIO_FILE_EXTENSIONS and not candidate.name.endswith('.part'):
                    audio_file = candidate
                    break

        if not audio_file:
            # Debug logging to help diagnose why downloads aren't being detected
            print("Could not locate downloaded audio. Temp directory contents:")
            for candidate in Path(tmpdir).iterdir():
                print(f"  - {candidate.name}")
                if candidate.is_file() and not candidate.name.endswith('.part'):
                    audio_file = candidate
                    print("  -> Falling back to", candidate.name)
                    break
        
        if not audio_file:
            print("Audio file not found after download")
            return None
        
        print(f"Audio downloaded to: {audio_file}")
        
        # Convert to MIDI using basic pitch detection
        # For now, generate a demo pattern based on audio length if fallback is enabled
        # In production, you would use actual pitch detection here
        if ENABLE_DEMO_FALLBACK:
            notes = generate_demo_notes_from_audio(audio_file)
        else:
            # No fallback - would implement real pitch detection here
            print("Demo fallback disabled - real pitch detection not yet implemented")
            return None
        
        return notes

def generate_demo_notes_from_audio(audio_path):
    """Generate demo notes based on audio file"""
    # This is a placeholder - in production, implement actual pitch detection
    # For now, generate a more varied pattern than before
    import random
    
    notes = []
    all_notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']
    
    # Generate 50 notes over 60 seconds
    for i in range(50):
        time = i * 1.2 + 2.0  # Start at 2 seconds
        note = random.choice(all_notes)
        notes.append({
            'note': note,
            'time': time,
            'duration': 0.4
        })
    
    return notes

@app.route('/')
def index():
    """Serve the main page"""
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files"""
    return send_from_directory('.', path)

@app.route('/api/backends', methods=['GET'])
def get_backends():
    """Get list of available backends"""
    return jsonify({
        'backends': [{'id': k, 'name': v} for k, v in BACKENDS.items()],
        'default': 'youtube2midi',
        'enableDemoFallback': ENABLE_DEMO_FALLBACK
    })

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

@app.route('/api/convert', methods=['POST'])
def convert_video():
    """Convert YouTube video to MIDI notes"""
    data = request.json
    youtube_url = data.get('youtubeUrl')
    backend = data.get('backend', 'youtube2midi')
    
    if not youtube_url:
        return jsonify({'error': 'YouTube URL is required'}), 400
    
    # Extract and validate video ID
    video_id = extract_video_id(youtube_url)
    if not video_id or not is_valid_video_id(video_id):
        return jsonify({'error': 'Invalid YouTube URL or video ID'}), 400
    
    # Check cache
    cache_file = MIDI_CACHE_DIR / f"{video_id}_{backend}.json"
    if cache_file.exists():
        with open(cache_file, 'r') as f:
            cached_data = json.load(f)
        return jsonify({
            'success': True,
            'notes': cached_data['notes'],
            'cached': True,
            'backend': backend
        })
    
    # Convert based on backend
    if backend == 'youtube2midi':
        notes = convert_with_youtube2midi(video_id)
    else:
        # Other backends not yet implemented
        return jsonify({
            'error': f'Backend {backend} not yet implemented. Currently only youtube2midi is available.'
        }), 501
    
    if notes is None:
        if ENABLE_DEMO_FALLBACK:
            return jsonify({'error': 'Failed to convert video'}), 500
        else:
            return jsonify({
                'error': 'Pitch detection not implemented. Set ENABLE_DEMO_FALLBACK=true in .env to use demo notes.'
            }), 501
    
    # Cache the results
    cache_data = {'notes': notes, 'backend': backend}
    with open(cache_file, 'w') as f:
        json.dump(cache_data, f)
    
    return jsonify({
        'success': True,
        'notes': notes,
        'cached': False,
        'backend': backend
    })

@app.route('/api/midi/<video_id>', methods=['GET'])
def get_cached_midi(video_id):
    """Retrieve cached MIDI data"""
    if not is_valid_video_id(video_id):
        return jsonify({'error': 'Invalid video ID format'}), 400
    
    backend = request.args.get('backend', 'youtube2midi')
    cache_file = MIDI_CACHE_DIR / f"{video_id}_{backend}.json"
    
    if cache_file.exists():
        with open(cache_file, 'r') as f:
            data = json.load(f)
        return jsonify(data)
    
    return jsonify({'error': 'MIDI file not found'}), 404

# ── BitMidi integration ──────────────────────────────────────────────

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
    if not slug or not re.match(r'^/[a-z0-9][a-z0-9\-]*-mid$', slug):
        return jsonify({'error': 'Invalid slug'}), 400

    # Check cache first
    cache_key = hashlib.sha256(slug.encode()).hexdigest()[:16]
    cache_file = MIDI_CACHE_DIR / f"bitmidi_{cache_key}.json"
    if cache_file.exists():
        with open(cache_file, 'r') as f:
            cached = json.load(f)
        return jsonify(cached)

    # Fetch the song page to find the download URL
    page_resp = http_requests.get(
        f'https://bitmidi.com{slug}',
        headers={'User-Agent': 'PianoHero/1.0'},
        timeout=10,
    )
    page_resp.raise_for_status()

    # Look for the direct .mid download link, e.g. /uploads/85523.mid
    dl_match = re.search(r'href="(https?://bitmidi\.com/uploads/[^"]+\.mid)"', page_resp.text)
    if not dl_match:
        # Try relative path
        dl_match = re.search(r'href="(/uploads/[^"]+\.mid)"', page_resp.text)
    if not dl_match:
        return jsonify({'error': 'Could not find download link on bitmidi page'}), 404

    dl_url = dl_match.group(1)
    if dl_url.startswith('/'):
        dl_url = 'https://bitmidi.com' + dl_url

    # Download the MIDI file to a temp file
    midi_resp = http_requests.get(dl_url, timeout=15)
    midi_resp.raise_for_status()

    with tempfile.NamedTemporaryFile(suffix='.mid', delete=False) as tmp:
        tmp.write(midi_resp.content)
        tmp_path = tmp.name

    try:
        notes = convert_midi_to_notes(tmp_path)
    finally:
        os.unlink(tmp_path)

    if not notes:
        return jsonify({'error': 'Could not parse any notes from the MIDI file'}), 422

    result = {
        'success': True,
        'notes': notes,
        'slug': slug,
        'noteCount': len(notes),
    }
    with open(cache_file, 'w') as f:
        json.dump(result, f)

    return jsonify(result)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Piano Hero Python server starting on port {port}")
    print(f"MIDI cache directory: {MIDI_CACHE_DIR}")
    print(f"Available backends: {', '.join(BACKENDS.keys())}")
    print(f"Demo fallback enabled: {ENABLE_DEMO_FALLBACK}")
    print(f"Environment: {FLASK_ENV} (debug={DEBUG_MODE})")
    cookie_file = resolve_cookie_file()
    if cookie_file:
        print(f"Using cookie file: {cookie_file}")
    elif ENV_COOKIE_PATH:
        print(f"Cookie file specified via YTDLP_COOKIES was not found: {ENV_COOKIE_PATH}")
    else:
        print("Cookie file not found (cookies.txt / cookie.txt). yt-dlp will run without authenticated cookies.")
    app.run(host='0.0.0.0', port=port, debug=DEBUG_MODE)
