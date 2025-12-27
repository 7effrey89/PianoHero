# PianoHero 🎹

A Guitar Hero-style game for piano! Watch notes fall from the top of the screen and press the corresponding piano keys at the perfect moment to score points.

## Features

- **YouTube Integration**: Paste a YouTube URL to use as your music track
- **Audio Analysis**: Automatically detects notes from the audio (simulated in demo)
- **Falling Notes Gameplay**: Notes cascade down the screen Guitar Hero-style
- **Piano Keyboard**: Visual piano keyboard with both mouse and keyboard input
- **Scoring System**: Points based on timing accuracy with combo multipliers
- **Real-time Feedback**: Visual feedback for successful and missed notes

## How to Play

1. **Open the Game**: Open `index.html` in a web browser
2. **Load a Track**: 
   - Paste a YouTube URL in the input field
   - Click "Load & Analyze" (this simulates audio analysis)
   - Wait for the processing to complete
3. **Start Playing**:
   - Click "Start Game" when ready
   - Watch for falling notes
   - Press the corresponding keyboard keys or click piano keys when notes reach the hit zone at the bottom
4. **Score Points**:
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

## Technical Implementation

### Current Demo Implementation

This demo version includes:
- Full game mechanics and UI
- Piano key sound synthesis using Web Audio API
- Simulated note generation for demonstration
- Canvas-based rendering with lanes for each key
- Keyboard and mouse input handling
- Scoring system with combo multipliers

**Important Note on YouTube Audio Analysis:**
The current implementation uses **simulated/demo notes** to demonstrate the game mechanics. Real YouTube audio analysis cannot be done directly in the browser due to:
- Cross-Origin Resource Sharing (CORS) restrictions
- YouTube's Terms of Service prohibiting direct audio extraction
- Computational requirements for real-time pitch detection

The demo generates a simple repeating pattern (C4→D4→E4→F4→G4→A4→B4→C5) to showcase the gameplay.

### Production Implementation Notes

For a full production implementation with real YouTube audio analysis, you would need:

1. **Backend Service** (e.g., Node.js/Python):
   - Use `youtube-dl` or similar to download audio
   - Extract audio track in a suitable format (MP3/WAV)
   - Serve audio files to the frontend

2. **Audio Analysis**:
   - **Option A**: Use Web Audio API with pitch detection algorithms
   - **Option B**: Backend processing with libraries like:
     - `librosa` (Python) for audio feature extraction
     - `aubio` for pitch detection
     - `madmom` for music information retrieval
   - **Option C**: Machine learning models like Google's `Magenta` or `Spotify's Basic Pitch`

3. **Note Detection**:
   - Perform FFT (Fast Fourier Transform) analysis
   - Detect fundamental frequencies
   - Map frequencies to piano notes
   - Store timing information for each detected note

4. **Audio Playback**:
   - Stream audio synchronized with the game
   - Use Web Audio API for precise timing

### File Structure

```
PianoHero/
├── index.html          # Main HTML structure
├── styles.css          # Styling and animations
├── app.js             # Game logic and mechanics
└── README.md          # This file
```

### Technologies Used

- **HTML5 Canvas**: For rendering falling notes
- **CSS3**: For styling, animations, and effects
- **Vanilla JavaScript**: Core game logic
- **Web Audio API**: (Ready for integration) Audio processing

## Future Enhancements

- [ ] Real YouTube audio downloading and analysis
- [ ] Multiple difficulty levels
- [ ] Different note speeds
- [ ] More piano keys (full octave range)
- [ ] Leaderboard system
- [ ] Song library/presets
- [ ] Practice mode
- [ ] Visual effects and particles
- [ ] Sound effects for key presses
- [ ] Mobile/touch support

## Browser Compatibility

Works best in modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari

## License

Open source - feel free to use and modify!

## Notes

This is a demonstration implementation. The YouTube audio analysis is simulated for demo purposes. A production implementation would require a backend service to handle YouTube audio downloading and processing, as well as more sophisticated audio analysis algorithms to accurately detect notes from music tracks.