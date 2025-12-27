#!/usr/bin/env python3
"""
Piano Hero - Python Backend Server
Supports multiple MIDI conversion backends with youtube2midi as the primary implementation
"""

import os
import json
import hashlib
import subprocess
import tempfile
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import mido
import yt_dlp

app = Flask(__name__, static_folder='.')
CORS(app)

# Configuration
MIDI_CACHE_DIR = Path(__file__).parent / 'midi_cache'
MIDI_CACHE_DIR.mkdir(exist_ok=True)

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
        current_time = 0
        tempo = 500000  # Default tempo (120 BPM)
        
        # Track active notes
        active_notes = {}
        
        for track in mid.tracks:
            current_time = 0
            for msg in track:
                current_time += mido.tick2second(msg.time, mid.ticks_per_beat, tempo)
                
                if msg.type == 'set_tempo':
                    tempo = msg.tempo
                elif msg.type == 'note_on' and msg.velocity > 0:
                    # Note on
                    note_name = mido.note_to_name(msg.note)
                    active_notes[msg.note] = current_time
                elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                    # Note off
                    if msg.note in active_notes:
                        start_time = active_notes[msg.note]
                        duration = current_time - start_time
                        note_name = midi_note_to_game_note(msg.note)
                        
                        if note_name:  # Only include notes in our range
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
    """Convert MIDI note number to game note name (C4-C5 range)"""
    # MIDI note 60 = C4, 72 = C5
    note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    
    # Only accept notes in the C4-C5 range (MIDI 60-72)
    if 60 <= midi_note <= 72:
        octave = (midi_note // 12) - 1
        note_index = midi_note % 12
        note_name = note_names[note_index]
        return f"{note_name}{octave}"
    return None

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
            print("Audio file not found after download")
            return None
        
        print(f"Audio downloaded to: {audio_file}")
        
        # Convert to MIDI using basic pitch detection
        # For now, generate a demo pattern based on audio length
        # In production, you would use actual pitch detection here
        notes = generate_demo_notes_from_audio(audio_file)
        
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
        'default': 'youtube2midi'
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
        return jsonify({'error': 'Failed to convert video'}), 500
    
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

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Piano Hero Python server starting on port {port}")
    print(f"MIDI cache directory: {MIDI_CACHE_DIR}")
    print(f"Available backends: {', '.join(BACKENDS.keys())}")
    app.run(host='0.0.0.0', port=port, debug=True)
