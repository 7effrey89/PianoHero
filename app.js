// Piano Hero Game
class PianoHero {
    constructor() {
        // DOM elements
        this.canvas = document.getElementById('notesCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.youtubeUrlInput = document.getElementById('youtubeUrl');
        this.loadBtn = document.getElementById('loadBtn');
        this.startBtn = document.getElementById('startBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.statusMessage = document.getElementById('statusMessage');
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');
        this.scoreElement = document.getElementById('score');
        this.comboElement = document.getElementById('combo');
        this.accuracyElement = document.getElementById('accuracy');
        this.backendSelect = document.getElementById('backendSelect');
        this.midiFileSelect = document.getElementById('midiFileSelect');
        this.loadMidiBtn = document.getElementById('loadMidiBtn');
        this.autoPlayBtn = document.getElementById('autoPlayBtn');
        
        // Game state
        this.notes = [];
        this.fallingNotes = [];
        this.score = 0;
        this.combo = 0;
        this.totalNotes = 0;
        this.hitNotes = 0;
        this.missedNotes = 0;
        this.isPlaying = false;
        this.isPaused = false;
        this.startTime = 0;
        this.audioContext = null;
        this.audioBuffer = null;
        this.audioSource = null;
        this.pauseTime = 0;
        this.enableDemoFallback = true; // Default to true, will be updated from backend
        this.isAutoPlay = false;
        this.autoPlayTimeouts = [];
        
        // Game settings
        this.noteSpeed = 200; // pixels per second
        this.hitZoneY = this.canvas.height - 80;
        this.hitTolerance = 50; // pixels tolerance for hitting notes
        
        // API configuration
        this.apiBaseUrl = window.location.origin.replace(':3000', ':5000'); // Python server on port 5000
        
        // Build the full chromatic scale C2–C7 (61 notes)
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        this.allNotes = [];
        for (let oct = 2; oct <= 6; oct++) {
            for (const n of noteNames) {
                this.allNotes.push(n + oct);
            }
        }
        this.allNotes.push('C7'); // top note

        // Keyboard bindings — two middle octaves (C3–B4) are playable
        // Lower octave C3–B3:  Z X C V B N M , . / and sharps: S D  G H J
        // Upper octave C4–B4:  Q W E R T Y U I O P and sharps: 2 3  5 6 7
        this.noteToKey = {
            // C3–B3 (bottom row + home row for sharps)
            'C3': 'Z', 'C#3': 'S', 'D3': 'X', 'D#3': 'D',
            'E3': 'C', 'F3': 'V', 'F#3': 'G', 'G3': 'B',
            'G#3': 'H', 'A3': 'N', 'A#3': 'J', 'B3': 'M',
            // C4–B4 (top rows)
            'C4': 'Q', 'C#4': '2', 'D4': 'W', 'D#4': '3',
            'E4': 'E', 'F4': 'R', 'F#4': '5', 'G4': 'T',
            'G#4': '6', 'A4': 'Y', 'A#4': '7', 'B4': 'U',
        };
        
        this.keyToNote = Object.fromEntries(
            Object.entries(this.noteToKey).map(([note, key]) => [key, note])
        );
        
        // Piano key positions (for rendering)
        this.keyPositions = this.calculateKeyPositions();
        
        // Audio synthesis for piano sounds (lazy initialization)
        this.audioContext = null;
        this.reverbNode = null;
        
        // Soundfont sample-based audio
        this.soundfontBuffers = {};      // { noteName: AudioBuffer }
        this.soundfontLoaded = false;
        this.soundfontLoading = false;
        this.currentInstrument = 'acoustic_grand_piano';
        this.soundfontBaseUrl = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';

        // Sound parameters (updated from UI)
        this.soundParams = {
            volume: 0.8,
            reverb: 0.35,
        };
        
        this.init();
    }
    
    init() {
        this.buildPianoKeys();
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Load backend configuration
        this.loadBackendConfig();
        
        // Load MIDI file list and set up tabs
        this.loadMidiFileList();
        this.initTabs();
        this.initSoundPanel();
        
        // Event listeners
        this.loadBtn.addEventListener('click', () => this.loadYouTubeAudio());
        this.loadMidiBtn.addEventListener('click', () => this.loadMidiFile());
        this.midiFileSelect.addEventListener('change', () => { if (this.midiFileSelect.value) this.loadMidiFile(); });
        this.startBtn.addEventListener('click', () => this.startGame());
        this.autoPlayBtn.addEventListener('click', () => this.startAutoPlay());
        this.pauseBtn.addEventListener('click', () => this.togglePause());
        this.resetBtn.addEventListener('click', () => this.reset());
        
        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Piano key clicks
        document.querySelectorAll('.key').forEach(key => {
            key.addEventListener('mousedown', () => this.handlePianoKeyPress(key));
            key.addEventListener('mouseup', () => this.handlePianoKeyRelease(key));
        });
        
        // Start render loop
        this.render();
    }
    
    buildPianoKeys() {
        const container = document.querySelector('.piano-keys');
        container.innerHTML = '';
        const blackKeyIndices = new Set([1, 3, 6, 8, 10]); // C#, D#, F#, G#, A# within octave
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // Count white keys for percentage math
        let whiteCount = 0;
        for (const note of this.allNotes) {
            if (!note.includes('#')) whiteCount++;
        }
        const whitePct = 100 / whiteCount;
        const blackWidthPct = whitePct * 0.65;

        // Create white keys first (they are flex children)
        for (const note of this.allNotes) {
            if (note.includes('#')) continue;
            const btn = document.createElement('button');
            btn.className = 'key white';
            btn.dataset.note = note;
            const keyBind = this.noteToKey[note] || '';
            if (keyBind) btn.dataset.key = keyBind;
            const noteName = note.replace(/\d+/, '');
            const label = keyBind ? `${keyBind}<br>${noteName}` : noteName;
            btn.innerHTML = `<span class="key-label">${label}</span>`;
            container.appendChild(btn);
        }

        // Create black keys (absolutely positioned)
        let whiteIdx = 0;
        for (const note of this.allNotes) {
            if (!note.includes('#')) {
                whiteIdx++;
                continue;
            }
            // Black key sits at the boundary of the previous white key
            const leftPct = whiteIdx * whitePct - blackWidthPct / 2;
            const btn = document.createElement('button');
            btn.className = 'key black';
            btn.dataset.note = note;
            const keyBind = this.noteToKey[note] || '';
            if (keyBind) btn.dataset.key = keyBind;
            const noteName = note.replace(/\d+/, '');
            const label = keyBind ? `${keyBind}<br>${noteName}` : noteName;
            btn.innerHTML = `<span class="key-label">${label}</span>`;
            btn.style.left = leftPct.toFixed(2) + '%';
            btn.style.width = blackWidthPct.toFixed(2) + '%';
            container.appendChild(btn);
        }
    }
    
    resizeCanvas() {
        const container = document.getElementById('gameCanvas');
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.hitZoneY = this.canvas.height - 20; // Hit zone at bottom, just above piano keys
        this.keyPositions = this.calculateKeyPositions();
    }
    
    calculateKeyPositions() {
        const positions = {};
        
        // Get actual DOM positions of piano keys
        this.allNotes.forEach(note => {
            const keyElement = document.querySelector(`.key[data-note="${note}"]`);
            if (keyElement) {
                const rect = keyElement.getBoundingClientRect();
                const canvasRect = this.canvas.getBoundingClientRect();
                
                // Calculate position relative to canvas
                const relativeLeft = rect.left - canvasRect.left;
                const relativeWidth = rect.width;
                
                positions[note] = {
                    x: relativeLeft + relativeWidth / 2,
                    width: relativeWidth,
                    left: relativeLeft,
                    isBlack: note.includes('#')
                };
            }
        });
        
        return positions;
    }
    
    async loadBackendConfig() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/backends`);
            if (response.ok) {
                const data = await response.json();
                // Use explicit check for better browser compatibility
                this.enableDemoFallback = data.enableDemoFallback !== undefined ? 
                    data.enableDemoFallback : true;
                console.log('Backend config loaded. Demo fallback enabled:', this.enableDemoFallback);
            }
        } catch (error) {
            console.log('Could not load backend config, using defaults');
        }
    }
    
    initTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
                btn.classList.add('active');
                document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
            });
        });
    }

    async loadMidiFileList() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/midi-files`);
            if (response.ok) {
                const data = await response.json();
                data.files.forEach(file => {
                    const option = document.createElement('option');
                    option.value = file;
                    option.textContent = file;
                    this.midiFileSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.log('Could not load MIDI file list');
        }
    }

    async loadMidiFile() {
        const filename = this.midiFileSelect.value;
        if (!filename) {
            alert('Please select a MIDI file');
            return;
        }

        this.loadMidiBtn.disabled = true;
        this.statusMessage.textContent = 'Loading MIDI file...';
        this.progressBar.classList.add('visible');
        this.updateProgress(30);

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/load-midi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to load MIDI file');
            }

            const data = await response.json();
            this.notes = data.notes;
            this.updateProgress(100);
            this.statusMessage.textContent = `Loaded "${data.filename}" — ${data.noteCount} notes. Click Start Game to play!`;
            this.startBtn.disabled = false;
            this.autoPlayBtn.disabled = false;
        } catch (error) {
            console.error('Error loading MIDI file:', error);
            this.statusMessage.textContent = 'Error: ' + error.message;
        } finally {
            this.loadMidiBtn.disabled = false;
            setTimeout(() => this.progressBar.classList.remove('visible'), 1000);
        }
    }

    initSoundPanel() {
        // Toggle panel
        document.getElementById('soundPanelToggle').addEventListener('click', () => {
            document.getElementById('soundPanelBody').classList.toggle('collapsed');
            document.querySelector('.toggle-arrow').classList.toggle('open');
        });

        // Instrument selector — loads soundfont when changed
        const presetSelect = document.getElementById('soundPreset');
        presetSelect.addEventListener('change', () => {
            this.loadSoundfont(presetSelect.value);
        });

        // Wire up volume and reverb sliders
        const volumeSlider = document.getElementById('volumeSlider');
        volumeSlider.addEventListener('input', () => {
            this.soundParams.volume = volumeSlider.value / 100;
            document.getElementById('volumeVal').textContent = volumeSlider.value + '%';
        });

        const reverbSlider = document.getElementById('reverbSlider');
        reverbSlider.addEventListener('input', () => {
            this.soundParams.reverb = reverbSlider.value / 100;
            document.getElementById('reverbVal').textContent = reverbSlider.value + '%';
        });

        // Auto-load the default instrument soundfont
        this.loadSoundfont(this.currentInstrument);
    }

    async loadSoundfont(instrument) {
        if (this.soundfontLoading) return;
        this.soundfontLoading = true;
        this.currentInstrument = instrument;

        const statusEl = document.getElementById('soundfontStatus');
        statusEl.textContent = 'Loading...';
        statusEl.className = 'soundfont-status loading';

        try {
            const url = `${this.soundfontBaseUrl}${instrument}-mp3.js`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();

            // Parse the JS file to extract the note-to-dataURI map
            // Format: MIDI.Soundfont.instrument_name = { "A0": "data:audio/mp3;base64,...", ... }
            // Use index-based parsing to find the correct object (regex was too greedy)
            const marker = text.indexOf('MIDI.Soundfont.');
            if (marker === -1) throw new Error('Could not parse soundfont');
            const objStart = text.indexOf('{', marker);
            const objEnd = text.lastIndexOf('}');
            if (objStart === -1 || objEnd === -1 || objEnd <= objStart) throw new Error('Could not parse soundfont');

            const noteData = JSON.parse(
                text.substring(objStart, objEnd + 1).replace(/,\s*}$/, '}')
            );

            // Store raw data URIs; decode lazily when AudioContext is available
            this.soundfontRawData = noteData;
            this.soundfontBuffers = {};
            this.soundfontLoaded = false;

            // If AudioContext already exists (from a user gesture), decode now
            if (this.audioContext) {
                await this._decodeSoundfontSamples(noteData);
            }

            const count = Object.keys(noteData).length;
            statusEl.textContent = `✓ ${count} samples`;
            statusEl.className = 'soundfont-status loaded';
            console.log(`Soundfont loaded: ${instrument} (${count} samples)`);
        } catch (error) {
            console.error('Failed to load soundfont:', error);
            statusEl.textContent = '✗ Failed';
            statusEl.className = 'soundfont-status error';
            this.soundfontLoaded = false;
        } finally {
            this.soundfontLoading = false;
        }
    }

    // Map game notes (C4, C#4, etc.) to soundfont note names (C4, Db4, etc.)
    gameNoteToSoundfontName(note) {
        // The soundfont uses flats (Bb, Eb, Ab, Db, Gb) while our game uses sharps
        const sharpToFlat = {
            'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb'
        };
        for (const [sharp, flat] of Object.entries(sharpToFlat)) {
            if (note.startsWith(sharp)) {
                return flat + note.slice(sharp.length);
            }
        }
        return note;
    }

    async _decodeSoundfontSamples(noteData) {
        const entries = Object.entries(noteData);
        const buffers = {};
        const decodePromises = entries.map(async ([noteName, dataUri]) => {
            const base64 = dataUri.split(',')[1];
            const binaryStr = atob(base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            try {
                const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer.slice(0));
                buffers[noteName] = audioBuffer;
            } catch (e) {
                // Some notes may fail to decode; skip them
            }
        });

        await Promise.all(decodePromises);
        this.soundfontBuffers = buffers;
        this.soundfontLoaded = true;
    }

    async loadYouTubeAudio() {
        const url = this.youtubeUrlInput.value.trim();
        if (!url) {
            alert('Please enter a YouTube URL');
            return;
        }
        
        // Extract video ID from YouTube URL
        const videoId = this.extractVideoId(url);
        if (!videoId) {
            alert('Invalid YouTube URL');
            return;
        }
        
        this.loadBtn.disabled = true;
        this.statusMessage.textContent = 'Loading audio from YouTube...';
        this.progressBar.classList.add('visible');
        this.updateProgress(10);
        
        try {
            this.statusMessage.textContent = 'Converting YouTube video to MIDI...';
            this.updateProgress(30);
            
            // Get selected backend
            const backend = this.backendSelect.value;
            
            // Call backend API to convert YouTube to MIDI
            const response = await fetch(`${this.apiBaseUrl}/api/convert`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    youtubeUrl: url,
                    backend: backend
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to convert YouTube video');
            }
            
            const data = await response.json();
            
            this.statusMessage.textContent = 'Analyzing notes...';
            this.updateProgress(70);
            
            // Use notes from backend
            this.notes = data.notes;
            
            this.statusMessage.textContent = `Analysis complete! Found ${this.notes.length} notes using ${data.backend}. ${data.cached ? '(Loaded from cache)' : ''} Click Start Game to play!`;
            this.updateProgress(100);
            this.startBtn.disabled = false;
            this.autoPlayBtn.disabled = false;
            
        } catch (error) {
            console.error('Error loading YouTube audio:', error);
            this.statusMessage.textContent = 'Error: Could not connect to Python backend server. Make sure to run: python3 server.py';
            
            // Fallback to demo notes if server is not available and fallback is enabled
            if (this.enableDemoFallback) {
                this.statusMessage.textContent += ' Using demo notes instead.';
                this.notes = this.generateDemoNotes();
                this.startBtn.disabled = false;
                this.autoPlayBtn.disabled = false;
            } else {
                this.statusMessage.textContent += ' Demo fallback is disabled.';
            }
        } finally {
            this.loadBtn.disabled = false;
            setTimeout(() => {
                this.progressBar.classList.remove('visible');
            }, 1000);
        }
    }
    
    extractVideoId(url) {
        // Extract video ID from various YouTube URL formats
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
            /^([a-zA-Z0-9_-]{11})$/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }
    
    generateDemoNotes() {
        // Generate a sequence of notes for demo purposes
        // In a real implementation, this would come from audio analysis
        const notes = [];
        const noteDuration = 0.5; // seconds between notes
        
        // Generate a simple melody pattern
        const patterns = [
            ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
            ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'],
            ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'C4'],
            ['F4', 'A4', 'C5', 'A4', 'F4', 'D4', 'F4']
        ];
        
        let time = 2; // Start after 2 seconds
        patterns.forEach(pattern => {
            pattern.forEach(note => {
                notes.push({
                    note: note,
                    time: time,
                    hit: false
                });
                time += noteDuration;
            });
            time += 1; // Pause between patterns
        });
        
        return notes;
    }
    
    startGame() {
        if (this.notes.length === 0) {
            alert('Please load a YouTube video first');
            return;
        }
        
        this.isPlaying = true;
        this.isPaused = false;
        this.startTime = Date.now();
        this.startBtn.disabled = true;
        this.autoPlayBtn.disabled = true;
        this.pauseBtn.disabled = false;
        this.statusMessage.textContent = 'Game in progress...';
        
        // Create falling notes
        this.fallingNotes = this.notes.map(note => ({
            ...note,
            y: -50,
            hit: false,
            missed: false
        }));
        
        this.totalNotes = this.fallingNotes.length;
        
        // In a real implementation, start playing the actual audio here
        this.playDemoAudio();
    }
    
    playDemoAudio() {
        // In a real implementation, this would play the YouTube audio
        // For demo, we just track time
    }

    startAutoPlay() {
        this.startGame();
        this.isAutoPlay = true;
        this.statusMessage.textContent = 'Auto Play — watch and listen!';

        // Schedule automatic key presses for every note
        this.fallingNotes.forEach(note => {
            const delay = note.time * 1000; // convert to ms
            const key = this.noteToKey[note.note];

            const tid = setTimeout(() => {
                if (!this.isPlaying || this.isPaused) return;
                if (key) {
                    this.pressKey(key);
                    setTimeout(() => this.releaseKey(key), 120);
                } else {
                    // Note has no keyboard binding — just play sound + visual
                    this.playNoteSound(note.note);
                    const el = document.querySelector(`.key[data-note="${note.note}"]`);
                    if (el) {
                        el.classList.add('active');
                        setTimeout(() => el.classList.remove('active'), 120);
                    }
                }
            }, delay);
            this.autoPlayTimeouts.push(tid);
        });
    }
    
    togglePause() {
        this.isPaused = !this.isPaused;
        
        if (this.isPaused) {
            this.pauseBtn.textContent = 'Resume';
            this.pauseTime = Date.now();
            this.statusMessage.textContent = 'Game paused';
        } else {
            this.pauseBtn.textContent = 'Pause';
            const pauseDuration = Date.now() - this.pauseTime;
            this.startTime += pauseDuration;
            this.statusMessage.textContent = 'Game in progress...';
        }
    }
    
    reset() {
        this.isPlaying = false;
        this.isPaused = false;
        this.fallingNotes = [];
        this.score = 0;
        this.combo = 0;
        this.hitNotes = 0;
        this.missedNotes = 0;
        this.totalNotes = 0;
        this.updateScore();
        this.startBtn.disabled = this.notes.length === 0;
        this.autoPlayBtn.disabled = this.notes.length === 0;
        this.pauseBtn.disabled = true;
        this.pauseBtn.textContent = 'Pause';
        this.statusMessage.textContent = this.notes.length > 0 ? 
            'Ready to play! Click Start Game.' : 'Enter a YouTube URL to start';
    }
    
    handleKeyDown(e) {
        const key = e.key.toUpperCase();
        if (this.keyToNote[key]) {
            e.preventDefault();
            this.pressKey(key);
        }
    }
    
    handleKeyUp(e) {
        const key = e.key.toUpperCase();
        if (this.keyToNote[key]) {
            e.preventDefault();
            this.releaseKey(key);
        }
    }
    
    handlePianoKeyPress(keyElement) {
        const key = keyElement.dataset.key;
        if (key) {
            this.pressKey(key);
        } else {
            // No keyboard binding — play sound directly
            const note = keyElement.dataset.note;
            if (note) {
                keyElement.classList.add('active');
                this.playNoteSound(note);
            }
        }
    }
    
    handlePianoKeyRelease(keyElement) {
        const key = keyElement.dataset.key;
        if (key) {
            this.releaseKey(key);
        } else {
            keyElement.classList.remove('active');
        }
    }
    
    pressKey(key) {
        const keyElement = document.querySelector(`.key[data-key="${key}"]`);
        if (keyElement) {
            keyElement.classList.add('active');
        }
        
        // Play the piano note sound
        const note = this.keyToNote[key];
        if (note) {
            this.playNoteSound(note);
        }
        
        if (this.isPlaying && !this.isPaused) {
            this.checkHit(key);
        }
    }
    
    playNoteSound(note) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.setupAudioGraph();
            // Decode soundfont samples now that AudioContext exists (deferred from page load)
            if (this.soundfontRawData && !this.soundfontLoaded) {
                this._decodeSoundfontSamples(this.soundfontRawData);
            }
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // Find the matching soundfont buffer
        const sfName = this.gameNoteToSoundfontName(note);
        const buffer = this.soundfontBuffers[sfName] || this.soundfontBuffers[note];
        if (!buffer) return;

        const p = this.soundParams;
        const now = this.audioContext.currentTime;

        // Update persistent graph levels
        this.masterGain.gain.value = p.volume;
        this.dryGain.gain.value = 1 - p.reverb * 0.5;
        this.wetGain.gain.value = p.reverb * 0.5;

        // Create a source from the sample buffer
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;

        const noteGain = this.audioContext.createGain();
        noteGain.gain.value = 1.4;  // Boost for fuller body
        source.connect(noteGain);
        noteGain.connect(this.dryGain);
        if (p.reverb > 0.01) noteGain.connect(this.wetGain);

        source.start(now);

        // Fade out the note to avoid the long natural sustain of the sample
        const fadeStart = now + 1.2;   // hold for 1.2s
        const fadeEnd   = fadeStart + 0.8; // then fade over 0.8s
        noteGain.gain.setValueAtTime(1.4, fadeStart);
        noteGain.gain.linearRampToValueAtTime(0, fadeEnd);
        source.stop(fadeEnd);
    }

    setupAudioGraph() {
        // Persistent nodes — created once, reused for every note
        this.masterGain = this.audioContext.createGain();

        // Compressor for fullness and punch
        const compressor = this.audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 12;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.15;
        this.masterGain.connect(compressor);
        compressor.connect(this.audioContext.destination);

        // Low-shelf EQ — adds warmth / body to the lower frequencies
        this.warmthEQ = this.audioContext.createBiquadFilter();
        this.warmthEQ.type = 'lowshelf';
        this.warmthEQ.frequency.value = 300;
        this.warmthEQ.gain.value = 4;   // +4 dB boost below 300 Hz

        // High-shelf sparkle
        this.presenceEQ = this.audioContext.createBiquadFilter();
        this.presenceEQ.type = 'highshelf';
        this.presenceEQ.frequency.value = 4000;
        this.presenceEQ.gain.value = 2;  // +2 dB

        // Dry path: source → warmth → presence → masterGain
        this.dryGain = this.audioContext.createGain();
        this.dryGain.connect(this.warmthEQ);
        this.warmthEQ.connect(this.presenceEQ);
        this.presenceEQ.connect(this.masterGain);

        // Reverb path — multi-tap delay network for richer reflections
        this.wetGain = this.audioContext.createGain();

        // Early reflections
        const preDelay = this.audioContext.createDelay(0.1);
        preDelay.delayTime.value = 0.015;

        const tap1 = this.audioContext.createDelay(0.5);
        tap1.delayTime.value = 0.05;
        const tap2 = this.audioContext.createDelay(0.5);
        tap2.delayTime.value = 0.12;
        const tap3 = this.audioContext.createDelay(0.5);
        tap3.delayTime.value = 0.20;
        const tap4 = this.audioContext.createDelay(0.5);
        tap4.delayTime.value = 0.30;

        // Feedback for tail — kept low to avoid long echo
        const fb = this.audioContext.createGain();
        fb.gain.value = 0.18;

        // Soften the reverb tail (but keep it brighter than before)
        const lpf = this.audioContext.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.value = 5000;

        // Reverb mix bus
        const reverbBus = this.audioContext.createGain();
        reverbBus.gain.value = 0.45;
        reverbBus.connect(this.masterGain);

        this.wetGain.connect(preDelay);
        preDelay.connect(tap1);
        preDelay.connect(tap2);
        tap1.connect(reverbBus);
        tap2.connect(reverbBus);
        tap2.connect(tap3);
        tap3.connect(reverbBus);
        tap3.connect(tap4);
        tap4.connect(reverbBus);
        tap4.connect(lpf);
        lpf.connect(fb);
        fb.connect(tap1);
    }
    
    releaseKey(key) {
        const keyElement = document.querySelector(`.key[data-key="${key}"]`);
        if (keyElement) {
            keyElement.classList.remove('active');
        }
    }
    
    checkHit(key) {
        const note = this.keyToNote[key];
        if (!note) return;
        
        // Find the closest note in the hit zone for this key
        let closestNote = null;
        let closestDistance = this.hitTolerance + 1;
        
        for (let i = 0; i < this.fallingNotes.length; i++) {
            const fallingNote = this.fallingNotes[i];
            
            if (fallingNote.note === note && !fallingNote.hit && !fallingNote.missed) {
                const distance = Math.abs(fallingNote.y - this.hitZoneY);
                
                if (distance <= this.hitTolerance && distance < closestDistance) {
                    closestNote = fallingNote;
                    closestDistance = distance;
                }
            }
        }
        
        // Hit the closest note if found
        if (closestNote) {
            closestNote.hit = true;
            this.combo++;
            this.hitNotes++;
            
            // Calculate score based on accuracy
            const accuracy = 1 - (closestDistance / this.hitTolerance);
            const points = Math.floor(100 * accuracy * (1 + this.combo * 0.1));
            this.score += points;
            
            this.updateScore();
            this.showHitFeedback(note, true);
        }
    }
    
    showHitFeedback(note, success) {
        const keyElement = document.querySelector(`.key[data-note="${note}"]`);
        if (keyElement) {
            keyElement.classList.add(success ? 'hit-success' : 'hit-miss');
            setTimeout(() => {
                keyElement.classList.remove('hit-success', 'hit-miss');
            }, 300);
        }
    }
    
    updateScore() {
        this.scoreElement.textContent = this.score;
        this.comboElement.textContent = this.combo;
        
        const processedNotes = this.hitNotes + this.missedNotes;
        const accuracy = processedNotes > 0 ? 
            Math.floor((this.hitNotes / processedNotes) * 100) : 0;
        this.accuracyElement.textContent = accuracy;
    }
    
    update() {
        if (!this.isPlaying || this.isPaused) return;
        
        const currentTime = (Date.now() - this.startTime) / 1000;
        
        // Update falling notes
        for (let i = this.fallingNotes.length - 1; i >= 0; i--) {
            const note = this.fallingNotes[i];
            
            if (!note.hit && !note.missed) {
                // Calculate Y position based on time
                const timeUntilHit = note.time - currentTime;
                note.y = this.hitZoneY - (timeUntilHit * this.noteSpeed);
                
                // Check if note was missed
                if (note.y > this.hitZoneY + this.hitTolerance) {
                    note.missed = true;
                    this.missedNotes++;
                    this.combo = 0;
                    this.updateScore();
                }
            }
            
            // Remove notes that are far past the hit zone
            if (note.y > this.canvas.height + 100) {
                this.fallingNotes.splice(i, 1);
            }
        }
        
        // Check if game is over
        if (this.fallingNotes.length === 0 && this.isPlaying) {
            this.isPlaying = false;
            this.isAutoPlay = false;
            this.autoPlayTimeouts.forEach(t => clearTimeout(t));
            this.autoPlayTimeouts = [];
            this.statusMessage.textContent = 
                `Game Over! Final Score: ${this.score} | Accuracy: ${this.accuracyElement.textContent}%`;
            this.startBtn.disabled = false;
            this.autoPlayBtn.disabled = false;
            this.pauseBtn.disabled = true;
        }
    }
    
    render() {
        this.update();
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw lanes for each key
        this.drawLanes();
        
        // Draw falling notes
        this.fallingNotes.forEach(note => {
            if (!note.hit && note.y > -50 && note.y < this.canvas.height + 50) {
                this.drawNote(note);
            }
        });
        
        // Draw hit zone indicators
        this.drawHitZoneIndicators();
        
        requestAnimationFrame(() => this.render());
    }
    
    drawLanes() {
        // Draw vertical lanes for each piano key, perfectly aligned with DOM elements
        this.allNotes.forEach(note => {
            const pos = this.keyPositions[note];
            if (!pos) return;
            
            const laneWidth = pos.width;
            const x = pos.left;
            
            // Draw lane background
            this.ctx.fillStyle = pos.isBlack ? 
                'rgba(80, 40, 120, 0.15)' : 'rgba(255, 255, 255, 0.08)';
            this.ctx.fillRect(x, 0, laneWidth, this.canvas.height);
            
            // Draw lane borders
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.moveTo(x + laneWidth, 0);
            this.ctx.lineTo(x + laneWidth, this.canvas.height);
            this.ctx.stroke();
        });
    }
    
    drawNote(note) {
        const pos = this.keyPositions[note.note];
        if (!pos) return;
        
        const noteWidth = pos.width * 0.9;
        const noteHeight = 30;
        const x = pos.left + (pos.width - noteWidth) / 2;
        const y = note.y - noteHeight / 2;
        
        // Draw note shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fillRect(x + 3, y + 3, noteWidth, noteHeight);
        
        // Draw note
        if (note.missed) {
            this.ctx.fillStyle = '#f44336';
        } else {
            this.ctx.fillStyle = pos.isBlack ? '#9C27B0' : '#2196F3';
        }
        
        this.ctx.fillRect(x, y, noteWidth, noteHeight);
        
        // Draw note border
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, noteWidth, noteHeight);
        
        // Draw note label
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 9px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(note.note, pos.x, note.y);
    }
    
    drawHitZoneIndicators() {
        // Draw hit zone line at the bottom
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.fillRect(0, this.hitZoneY - 2, this.canvas.width, 4);
        
        // Draw indicator for each key
        Object.entries(this.keyPositions).forEach(([note, pos]) => {
            const width = pos.width * 0.9;
            const height = 8;
            const x = pos.left + (pos.width - width) / 2;
            const y = this.hitZoneY - height / 2;
            
            this.ctx.fillStyle = pos.isBlack ? 
                'rgba(156, 39, 176, 0.4)' : 'rgba(33, 150, 243, 0.4)';
            this.ctx.fillRect(x, y, width, height);
            
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, width, height);
        });
    }
    
    updateProgress(percent) {
        this.progressFill.style.width = percent + '%';
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
    new PianoHero();
});
