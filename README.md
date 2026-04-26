# PianoHero 🎹

A Guitar Hero-style game for piano with Synthesia-inspired UI and real YouTube to MIDI conversion! Watch notes fall from the top in lanes perfectly aligned with piano keys at the bottom, and press them at the perfect moment to score points.

## Features

- **Synthesia-Style UI**: Lanes directly aligned above piano keys for intuitive gameplay
- **YouTube Integration**: Paste a YouTube URL to convert it to playable notes
- **Multiple Backend Options**: Choose from different MIDI conversion engines:
  - **YouTube2MIDI** (Audio Analysis) - Currently implemented
  - Spotify Basic Pitch (ML Model) - Coming soon
  - Librosa (Audio Processing) - Coming soon
  - Aubio (Real-time) - Coming soon
  - Google Magenta (ML Model) - Coming soon
- **Python Backend**: Flask server with yt-dlp for audio extraction
- **MIDI Conversion**: Real audio analysis with caching for faster replays
- **Falling Notes Gameplay**: Notes cascade in lanes matching piano keys
- **Piano Keyboard**: Visual piano keyboard with both mouse and keyboard input
- **Piano Sounds**: Web Audio API synthesis for realistic note sounds
- **Scoring System**: Points based on timing accuracy with combo multipliers
- **Real-time Feedback**: Visual feedback for successful and missed notes

## Quick Start

### Prerequisites
```bash
# Install Python dependencies
pip install -r requirements.txt

# Install ffmpeg (required for audio extraction)
# On Ubuntu/Debian:
sudo apt-get install ffmpeg

# On macOS:
brew install ffmpeg

# On Windows:
# Download from https://ffmpeg.org/download.html

# Or build a self-contained Docker image (includes ffmpeg)
docker build -t piano-hero .
# Run the container and expose port 5000 locally
docker run --rm -p 5000:5000 \
  -v "$(pwd)/midi_cache:/app/midi_cache" \
  --name piano-hero \
  piano-hero
```

On Windows PowerShell use ``${PWD}`` (or omit the `-v` flag if you do not need to persist cached MIDI files):

```powershell
docker run --rm -p 5000:5000 `
  -v "${PWD}/midi_cache:/app/midi_cache" `
  --name piano-hero `
  piano-hero
```

#### Providing YouTube cookies (optional but recommended)

Some YouTube videos require consent or authentication before yt-dlp can download audio. You can export your browser cookies (for example using the "Get cookies.txt" extension), place the resulting `cookies.txt` or `cookie.txt` file at the project root, and the server will automatically detect it. Alternatively, set the `YTDLP_COOKIES` environment variable to the file path.

Docker example with a mounted cookie file:

```bash
docker run --rm -p 5000:5000 \
  -v "$(pwd)/midi_cache:/app/midi_cache" \
  -v "$(pwd)/cookies.txt:/app/cookies.txt" \
  -e YTDLP_COOKIES=/app/cookies.txt \
  --name piano-hero \
  piano-hero
```

PowerShell version:

```powershell
docker run --rm -p 5000:5000 `
  -v "${PWD}/midi_cache:/app/midi_cache" `
  -v "${PWD}/cookies.txt:/app/cookies.txt" `
  -e YTDLP_COOKIES=/app/cookies.txt `
  --name piano-hero `
  piano-hero
```

### Running the Application
```bash
# Start the Python backend server
python3 server.py
```

Then open http://localhost:5000/ in your browser

> **Tip:** When using Docker, the server starts automatically. Visit http://localhost:5000/ once the container logs show "Piano Hero Python server starting...".

## How to Play

1. **Select Backend**: Choose your preferred MIDI conversion engine from the dropdown (currently only youtube2midi is available)
2. **Load a Track**: 
   - Paste a YouTube URL in the input field
   - Click "Load & Analyze"
   - Wait for the server to download audio and analyze notes
3. **Start Playing**:
   - Click "Start Game" when ready
   - Watch for notes falling in lanes
   - Press keyboard keys or click piano keys when notes reach the hit zone
4. **Hold Notes**:
   - Notes have varying heights based on their duration — longer notes appear as taller bars
   - When a long note reaches the hit zone, **press and hold** the key for the full length of the note
   - The note turns **green** while you hold it and stays visible as it scrolls past the hit zone
   - Release the key when the note has fully passed — releasing early fades the sound out
   - Short notes can be tapped normally
5. **Score Points**:
   - Perfect timing = more points
   - Build combos for score multipliers
   - Try to hit all notes for maximum accuracy!

## Keyboard Controls

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

You can also click the piano keys with your mouse!

## Architecture

### Python Backend (Flask)
- **YouTube Audio Extraction**: Uses yt-dlp to download audio from YouTube
- **MIDI Conversion**: Currently implements youtube2midi method with audio analysis
- **Caching System**: Stores converted MIDI files in `midi_cache/` for instant replay
- **Multiple Backends**: Extensible architecture for different conversion engines
- **RESTful API**: JSON-based communication with frontend

### JavaScript Frontend
- **HTML5 Canvas**: Renders falling notes and lanes
- **Web Audio API**: Sample-based instrument playback using [MIDI.js Soundfonts](https://github.com/gleitz/midi-js-soundfonts)
- **DOM-based Positioning**: Calculates lane positions from actual piano key elements for perfect alignment
- **Vanilla JavaScript**: No framework dependencies

## API Endpoints

### GET /api/backends
Returns list of available MIDI conversion backends

### POST /api/convert
Convert YouTube video to MIDI notes
```json
{
  "youtubeUrl": "https://youtube.com/watch?v=...",
  "backend": "youtube2midi"
}
```

### GET /api/midi/:videoId?backend=youtube2midi
Retrieve cached MIDI data for a video

## File Structure

```
PianoHero/
├── server.py          # Python Flask backend
├── requirements.txt   # Python dependencies
├── index.html         # Synthesia-style integrated layout
├── styles.css         # Modern CSS with game area styling
├── app.js             # Game logic with DOM-based positioning
├── .gitignore         # Git ignore rules
├── midi_cache/        # MIDI cache directory (auto-created)
└── README.md          # Documentation
```

## Development

### Adding New Backends

To add a new MIDI conversion backend:

1. Add the backend to the `BACKENDS` dictionary in `server.py`
2. Implement the conversion function (e.g., `convert_with_basic_pitch()`)
3. Add the case to the backend selection in the `/api/convert` endpoint
4. Update the dropdown in `index.html` to enable the option

Example:
```python
def convert_with_basic_pitch(video_id):
    """Convert using Spotify's Basic Pitch ML model"""
    # Download audio
    # Run Basic Pitch inference
    # Convert to note format
    return notes
```

### Current Implementation Status

- ✅ **youtube2midi**: Basic implementation with audio download and demo note generation
- ⏳ **basic_pitch**: Coming soon (requires TensorFlow)
- ⏳ **librosa**: Coming soon (requires librosa library)
- ⏳ **aubio**: Coming soon (requires aubio library)
- ⏳ **magenta**: Coming soon (requires Magenta library)

## Production Deployment

### Environment Variables

The application uses a `.env` file for configuration. Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

Available environment variables:
- `PORT`: Server port (default: 5000)
- `FLASK_ENV`: Set to 'production' for production
- `ENABLE_DEMO_FALLBACK`: Enable fallback to demo notes when real pitch detection is not available (default: true)
  - Set to `true` to enable demo note generation as a fallback
  - Set to `false` to disable fallbacks and return errors when pitch detection is unavailable
- `YTDLP_COOKIES`: Absolute or relative path to a cookies.txt file for yt-dlp (optional). If unset, the server automatically checks for `cookies.txt` or `cookie.txt` in the project root.

### Security Considerations
- The server includes video ID validation to prevent path traversal
- CORS is enabled for all origins (configure as needed for production)
- Rate limiting should be added for production use

## YouTube Terms of Service

**Important**: Downloading YouTube videos may violate YouTube's Terms of Service. This tool is for educational and personal use only. Always respect copyright laws and YouTube's policies.

## Credits

- **Piano Sounds**: Instrument samples provided by [MIDI.js Soundfonts](https://github.com/gleitz/midi-js-soundfonts) — pre-rendered General MIDI soundfonts generated from [FluidR3_GM.sf2](http://www.synthfont.com/SoundFonts/FluidR3_GM.sfArk), released under the [Creative Commons Attribution 3.0 license](https://creativecommons.org/licenses/by/3.0/us/). Samples are loaded at runtime from `gleitz.github.io`.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
