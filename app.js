// Piano Hero Game
class PianoHero {
    constructor() {
        // DOM elements
        this.canvas = document.getElementById('notesCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.youtubeUrlInput = document.getElementById('youtubeUrl');
        this.loadBtn = document.getElementById('loadBtn');
        this.startBtn = document.getElementById('playPauseBtn');
        this.pauseBtn = document.getElementById('playPauseBtn'); // alias
        this.resetBtn = document.getElementById('stopBtn');
        this.statusMessage = document.getElementById('statusMessage');
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');
        this.scoreElement = document.getElementById('score');
        this.comboElement = document.getElementById('combo');
        this.accuracyElement = document.getElementById('accuracy');
        this.streakElement = document.getElementById('streak');
        this.songTimeline = document.getElementById('songTimeline');
        this.songTimelineFill = document.getElementById('songTimelineFill');
        this.songTimelineThumb = document.getElementById('songTimelineThumb');
        this.songTimeLabel = document.getElementById('songTimeLabel');
        this.backendSelect = document.getElementById('backendSelect');
        this.midiFileSelect = document.getElementById('midiFileSelect');
        this.loadMidiBtn = document.getElementById('loadMidiBtn');
        this.autoPlayBtn = document.getElementById('modeToggleSwitch');
        this.modeToggleBtn = document.getElementById('modeToggleSwitch');
        this.modeToggleSwitch = document.getElementById('modeToggleSwitch');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.stopBtn = document.getElementById('stopBtn');
        
        // Game state
        this.notes = [];
        this.fallingNotes = [];
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.totalNotes = 0;
        this.hitNotes = 0;
        this.missedNotes = 0;
        this.isPlaying = false;
        this.isPaused = false;
        this.startTime = 0;
        this.songDuration = 0; // total song length in seconds
        this.audioContext = null;
        this.audioBuffer = null;
        this.audioSource = null;
        this.pauseTime = 0;
        this.enableDemoFallback = true; // Default to true, will be updated from backend
        this.isAutoPlay = false;
        this.autoPlayTimeouts = [];
        this.previewTimeouts = [];
        this.previewSlug = null; // slug of currently previewing song
        
        // Game settings
        this.noteSpeed = 200; // pixels per second
        this.hitZoneY = this.canvas.height - 80;
        this.hitTolerance = 50; // pixels tolerance for hitting notes

        // Performance: cached static layers
        this._laneCanvas = null; // offscreen canvas for lanes + hit zone
        this._laneCacheDirty = true;
        this._boundRender = () => this._renderFrame();

        // Key scale / zoom
        this.keyScale = 1.0;

        // Speed control
        this.speedMultiplier = 1.0;
        this.songBPM = null; // detected from loaded notes

        // Game mode: 'normal', 'simple', 'coplay', 'practice'
        this.gameMode = 'normal';
        this.originalNotes = []; // unmodified notes from loader
        this.practiceWaiting = false; // true when waiting for player input
        this.practiceExpectedNotes = new Set(); // notes that must be pressed (chord support)
        this.practiceHitNotes = new Set(); // notes already pressed in current chord

        // Hold-note tracking
        this.heldKeys = new Set();                // keyboard keys currently held down
        this.activeNoteSources = new Map();       // note name → { source, noteGain, fadeStart, fadeEnd }
        this.heldFallingNotes = new Map();        // note name → falling note being held

        // Co-Play mode: lanes the player chose to play manually
        this.coPlayManualNotes = new Set();       // note names the player toggles as "manual"

        // Key Map modal state
        this.keyMapModalOpen = false;
        this.keyMapTargetNote = null;
        this.keyMapPendingKey = null;
        
        // API configuration
        this.apiBaseUrl = window.location.origin.replace(':3000', ':5000'); // Python server on port 5000
        
        // Chromatic note helpers
        this.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // Default range — will be rebuilt when a song is loaded
        this.allNotes = this.buildChromaticRange('C2', 'C7');

        // Keyboard bindings — two middle octaves (C3–B4) are playable
        // Lower octave C3–B3:  Z X C V B N M and sharps: S D G H J
        // Upper octave C4–B4:  Q W E R T Y U and sharps: 2 3 5 6 7
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
        // resizeCanvas is called after black keys are placed (inside buildPianoKeys)
        window.addEventListener('resize', () => {
            // On resize, rebuild black key positions from scratch
            this.buildPianoKeys();
        });
        
        // Load backend configuration
        this.loadBackendConfig();
        
        // Load MIDI file list and set up tabs
        this.loadMidiFileList();
        this.initTabs();
        this.initBitMidi();
        this.initSoundPanel();
        this.initGameSettings();
        
        // Event listeners
        this.loadBtn.addEventListener('click', () => this.loadYouTubeAudio());
        this.loadMidiBtn.addEventListener('click', () => this.loadMidiFile());
        this.midiFileSelect.addEventListener('change', () => { if (this.midiFileSelect.value) this.loadMidiFile(); });
        this.modeToggleSwitch.addEventListener('change', () => this.toggleManualAuto());
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.stopBtn.addEventListener('click', () => this.reset());

        // Song timeline seek
        this.songTimeline.addEventListener('click', (e) => this.seekTimeline(e));
        
        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Key Map modal button listeners
        document.getElementById('keyMapConfirm').addEventListener('click', () => this._closeKeyMapModal(true));
        document.getElementById('keyMapRemove').addEventListener('click', () => {
            if (this.keyMapTargetNote) this._removeKeyBinding(this.keyMapTargetNote);
            this._closeKeyMapModal(false);
        });
        document.getElementById('keyMapCancel').addEventListener('click', () => this._closeKeyMapModal(false));
        document.getElementById('keyMapModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('keyMapModal')) this._closeKeyMapModal(false);
        });
        
        // Piano key handlers are set in _placeBlackKeys (including touch events)
        
        // Start render loop
        requestAnimationFrame(this._boundRender);
    }
    
    // Convert a note name like "C#3" to a semitone index (C0 = 0)
    noteToSemitone(name) {
        const match = name.match(/^([A-G]#?)(\d+)$/);
        if (!match) return 0;
        return this.NOTE_NAMES.indexOf(match[1]) + parseInt(match[2]) * 12;
    }

    // Convert a semitone index back to a note name
    semitoneToNote(s) {
        return this.NOTE_NAMES[s % 12] + Math.floor(s / 12);
    }

    // Build a chromatic scale from lowNote to highNote inclusive
    buildChromaticRange(lowNote, highNote) {
        const lo = this.noteToSemitone(lowNote);
        const hi = this.noteToSemitone(highNote);
        const result = [];
        for (let s = lo; s <= hi; s++) {
            result.push(this.semitoneToNote(s));
        }
        return result;
    }

    // Called after notes are loaded — expand the keyboard to cover every note in the song
    rebuildKeyboardForNotes(notes) {
        if (!notes || notes.length === 0) return;

        // Find the min/max semitones in the loaded song
        let minS = Infinity, maxS = -Infinity;
        for (const n of notes) {
            const s = this.noteToSemitone(n.note);
            if (s < minS) minS = s;
            if (s > maxS) maxS = s;
        }

        // Extend to the nearest C below and B (or C) above so octaves are complete
        while (minS % 12 !== 0) minS--;  // down to nearest C
        while (maxS % 12 !== 0) maxS++;  // up to nearest C

        // Clamp to reasonable piano range A0 (semitone 9) – C8 (semitone 108)
        minS = Math.max(minS, 9);   // A0
        maxS = Math.min(maxS, 108); // C8

        const lowNote = this.semitoneToNote(minS);
        const highNote = this.semitoneToNote(maxS);

        this.allNotes = this.buildChromaticRange(lowNote, highNote);
        this.buildPianoKeys();
        // resizeCanvas is called after black keys are placed (inside buildPianoKeys)
    }

    buildPianoKeys() {
        const container = document.querySelector('.piano-keys');
        container.innerHTML = '';

        // Count white keys for sizing
        let whiteCount = 0;
        for (const note of this.allNotes) {
            if (!note.includes('#')) whiteCount++;
        }

        // Each white key is at least 35px wide, scaled by keyScale
        const MIN_WHITE_KEY_PX = 35 * this.keyScale;
        const pianoMinWidth = whiteCount * MIN_WHITE_KEY_PX;
        this.pianoMinWidth = pianoMinWidth;

        // Force the piano container and parents to be at least this wide
        container.style.minWidth = pianoMinWidth + 'px';
        const pianoDiv = document.getElementById('piano');
        if (pianoDiv) pianoDiv.style.minWidth = pianoMinWidth + 'px';
        const gameCanvas = document.getElementById('gameCanvas');
        if (gameCanvas) gameCanvas.style.minWidth = pianoMinWidth + 'px';

        // When scale > 1, prevent flex from making keys smaller than the scaled size
        const useFixedWidth = this.keyScale > 1;

        // Create white keys (flex children)
        const whiteKeys = [];
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
            if (useFixedWidth) {
                btn.style.flex = '0 0 ' + MIN_WHITE_KEY_PX + 'px';
                btn.style.minWidth = MIN_WHITE_KEY_PX + 'px';
            }
            container.appendChild(btn);
            whiteKeys.push(btn);
        }

        // Store black key info for placement after layout
        this._pendingBlackKeys = [];
        let whiteIdx = 0;
        for (const note of this.allNotes) {
            if (!note.includes('#')) {
                whiteIdx++;
                continue;
            }
            this._pendingBlackKeys.push({ note, whiteIdx });
        }

        // Place black keys after layout so we can read actual white key positions
        requestAnimationFrame(() => this._placeBlackKeys(container, whiteKeys));
    }

    _placeBlackKeys(container, whiteKeys) {
        const blackWidthRatio = 0.65;

        for (const { note, whiteIdx } of this._pendingBlackKeys) {
            const prevWhite = whiteKeys[whiteIdx - 1];
            const nextWhite = whiteKeys[whiteIdx];
            if (!prevWhite || !nextWhite) continue;

            // Use offsetLeft — relative to the container, unaffected by scroll
            const whiteWidth = prevWhite.offsetWidth;
            const boundary = nextWhite.offsetLeft;
            const blackWidth = whiteWidth * blackWidthRatio;

            const btn = document.createElement('button');
            btn.className = 'key black';
            btn.dataset.note = note;
            const keyBind = this.noteToKey[note] || '';
            if (keyBind) btn.dataset.key = keyBind;
            const noteName = note.replace(/\d+/, '');
            const label = keyBind ? `${keyBind}<br>${noteName}` : noteName;
            btn.innerHTML = `<span class="key-label">${label}</span>`;
            btn.style.left = (boundary - blackWidth / 2) + 'px';
            btn.style.width = blackWidth + 'px';
            container.appendChild(btn);
        }
        this._pendingBlackKeys = null;

        // Now recalculate canvas and key positions
        this.resizeCanvas();

        // Re-attach mouse + touch handlers for all keys
        document.querySelectorAll('.key').forEach(key => {
            key.onmousedown = (e) => { e.preventDefault(); this.handlePianoKeyPress(key); };
            key.onmouseup   = () => this.handlePianoKeyRelease(key);
            key.ontouchstart = (e) => { e.preventDefault(); this.handlePianoKeyPress(key); };
            key.ontouchend   = (e) => { e.preventDefault(); this.handlePianoKeyRelease(key); };
            key.ontouchcancel = (e) => { e.preventDefault(); this.handlePianoKeyRelease(key); };
        });

        // Build co-play lane selectors (requires updated keyPositions)
        this._buildLaneSelectors();
    }
    
    resizeCanvas() {
        const container = document.getElementById('gameCanvas');
        const piano = document.querySelector('.piano-keys');
        // The canvas must match the actual rendered piano width
        const pianoRenderedWidth = piano ? piano.scrollWidth : 0;
        const fullWidth = Math.max(container.parentElement.clientWidth, pianoRenderedWidth);
        container.style.width = fullWidth + 'px';
        this.canvas.width = fullWidth;
        this.canvas.height = container.clientHeight;
        this.hitZoneY = this.canvas.height - 20;
        this.keyPositions = this.calculateKeyPositions();
        this._laneCacheDirty = true;
    }
    
    calculateKeyPositions() {
        const positions = {};

        // Use offsetLeft/offsetWidth — relative to offset parent, unaffected by scroll
        this.allNotes.forEach(note => {
            const keyElement = document.querySelector(`.key[data-note="${note}"]`);
            if (keyElement) {
                const left = keyElement.offsetLeft;
                const width = keyElement.offsetWidth;
                
                positions[note] = {
                    x: left + width / 2,
                    width: width,
                    left: left,
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
            this.originalNotes = data.notes;
            this.songBPM = this.estimateBPM(data.notes);
            this.updateBPMDisplay();
            this.applyGameMode();
            this.updateProgress(100);
            this.statusMessage.textContent = `Loaded "${data.filename}" — ${data.noteCount} notes. Press Play!`;
            this._updateControlButtons();
        } catch (error) {
            console.error('Error loading MIDI file:', error);
            this.statusMessage.textContent = 'Error: ' + error.message;
        } finally {
            this.loadMidiBtn.disabled = false;
            setTimeout(() => this.progressBar.classList.remove('visible'), 1000);
        }
    }

    initBitMidi() {
        const searchBtn = document.getElementById('bitmidiSearchBtn');
        const queryInput = document.getElementById('bitmidiQuery');
        searchBtn.addEventListener('click', () => this.searchBitMidi());
        queryInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.searchBitMidi();
        });
    }

    async searchBitMidi() {
        const query = document.getElementById('bitmidiQuery').value.trim();
        if (!query) return;

        const container = document.getElementById('bitmidiResults');
        container.innerHTML = '<p class="bitmidi-loading">Searching…</p>';

        try {
            const resp = await fetch(`${this.apiBaseUrl}/api/bitmidi/search?q=${encodeURIComponent(query)}`);
            if (!resp.ok) throw new Error('Search failed');
            const data = await resp.json();

            if (!data.results || data.results.length === 0) {
                container.innerHTML = '<p class="bitmidi-empty">No results found.</p>';
                return;
            }

            container.innerHTML = '';
            data.results.forEach(item => {
                const row = document.createElement('div');
                row.className = 'bitmidi-item';
                row.innerHTML = `
                    <span class="bitmidi-name">${this.escapeHtml(item.name)}</span>
                    <button class="bitmidi-preview-btn" title="Preview">&#9654;</button>
                    <button class="bitmidi-load-btn">Load</button>
                `;
                row.querySelector('.bitmidi-preview-btn').addEventListener('click', (e) => {
                    this.togglePreview(item.slug, item.name, e.currentTarget);
                });
                row.querySelector('.bitmidi-load-btn').addEventListener('click', () => {
                    this.loadBitMidi(item.slug, item.name);
                });
                container.appendChild(row);
            });
        } catch (err) {
            container.innerHTML = `<p class="bitmidi-empty">Error: ${this.escapeHtml(err.message)}</p>`;
        }
    }

    async loadBitMidi(slug, name) {
        this.stopPreview();
        this.statusMessage.textContent = `Loading "${name}" from BitMidi…`;
        this.progressBar.classList.add('visible');
        this.updateProgress(20);

        try {
            const resp = await fetch(`${this.apiBaseUrl}/api/bitmidi/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug })
            });

            this.updateProgress(70);

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error || 'Failed to load');
            }

            const data = await resp.json();
            this.originalNotes = data.notes;
            this.songBPM = this.estimateBPM(data.notes);
            this.updateBPMDisplay();
            this.applyGameMode();
            this.updateProgress(100);
            this.statusMessage.textContent = `Loaded "${name}" — ${data.noteCount} notes. Press Play!`;
            this._updateControlButtons();
        } catch (err) {
            console.error('BitMidi load error:', err);
            this.statusMessage.textContent = 'Error: ' + err.message;
        } finally {
            setTimeout(() => this.progressBar.classList.remove('visible'), 1000);
        }
    }

    stopPreview() {
        this.previewTimeouts.forEach(t => clearTimeout(t));
        this.previewTimeouts = [];
        // Reset any active preview button
        const activeBtn = document.querySelector('.bitmidi-preview-btn.playing');
        if (activeBtn) {
            activeBtn.innerHTML = '&#9654;';
            activeBtn.classList.remove('playing');
        }
        this.previewSlug = null;
    }

    async togglePreview(slug, name, btn) {
        // If already previewing this song, stop it
        if (this.previewSlug === slug) {
            this.stopPreview();
            return;
        }

        // Stop any existing preview
        this.stopPreview();

        // Mark this button as playing
        btn.innerHTML = '&#9632;'; // stop square
        btn.classList.add('playing');
        this.previewSlug = slug;

        try {
            // Fetch notes via the load endpoint (reuses cache)
            const resp = await fetch(`${this.apiBaseUrl}/api/bitmidi/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug })
            });

            if (!resp.ok) throw new Error('Failed to fetch');
            const data = await resp.json();

            if (this.previewSlug !== slug) return; // user stopped during fetch

            const notes = data.notes;
            if (!notes || notes.length === 0) return;

            // Play a 15-second preview starting from the beginning
            const previewDuration = 15;
            const previewNotes = notes.filter(n => n.time <= previewDuration);

            previewNotes.forEach(note => {
                const tid = setTimeout(() => {
                    if (this.previewSlug !== slug) return;
                    this.playNoteSound(note.note, note.duration);
                }, note.time * 1000);
                this.previewTimeouts.push(tid);
            });

            // Auto-stop after preview duration
            const stopTid = setTimeout(() => {
                if (this.previewSlug === slug) this.stopPreview();
            }, previewDuration * 1000);
            this.previewTimeouts.push(stopTid);

        } catch (err) {
            console.error('Preview error:', err);
            this.stopPreview();
        }
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    initSoundPanel() {
        // Shared settings toggle (expands/collapses both panels together)
        document.getElementById('settingsToggle').addEventListener('click', () => {
            document.getElementById('settingsPanelsBody').classList.toggle('collapsed');
            document.querySelector('#settingsToggle .toggle-arrow').classList.toggle('open');
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

    initGameSettings() {
        // ── Key Scale ──
        const scaleSlider = document.getElementById('keyScaleSlider');
        const scaleInput = document.getElementById('keyScaleInput');

        const applyScale = (val) => {
            this.keyScale = Math.max(0.5, Math.min(3, parseFloat(val) || 1));
            scaleSlider.value = this.keyScale;
            scaleInput.value = this.keyScale;
            this.buildPianoKeys();
        };

        scaleSlider.addEventListener('input', () => applyScale(scaleSlider.value));
        scaleInput.addEventListener('change', () => applyScale(scaleInput.value));

        // ── Speed Control ──
        const speedSlider = document.getElementById('speedSlider');
        const speedInput = document.getElementById('speedInput');

        const applySpeed = (val) => {
            const pct = Math.max(25, Math.min(150, parseInt(val) || 100));
            const newSpeed = pct / 100;
            const oldSpeed = this.speedMultiplier;

            // Adjust startTime to preserve current song position when speed changes mid-song
            if (this.isPlaying && oldSpeed !== newSpeed) {
                const now = this.isPaused ? this.pauseTime : Date.now();
                const currentTime = (now - this.startTime) / 1000;
                // songPos = currentTime * oldSpeed; newCurrentTime = songPos / newSpeed
                const newCurrentTime = currentTime * oldSpeed / newSpeed;
                if (this.isPaused) {
                    this.startTime = this.pauseTime - newCurrentTime * 1000;
                } else {
                    this.startTime = Date.now() - newCurrentTime * 1000;
                }
            }

            this.speedMultiplier = newSpeed;
            speedSlider.value = pct;
            speedInput.value = pct;
            this.updateBPMDisplay();

            // If auto-play is in progress, reschedule timeouts with new speed
            if (this.isAutoPlay && this.isPlaying && !this.isPaused) {
                this.autoPlayTimeouts.forEach(t => clearTimeout(t));
                this.autoPlayTimeouts = [];
                this._scheduleAutoPlayNotes();
            }
        };

        speedSlider.addEventListener('input', () => applySpeed(speedSlider.value));
        speedInput.addEventListener('change', () => applySpeed(speedInput.value));

        // ── Game Mode ──
        const modeSelect = document.getElementById('gameModeSelect');
        const coplayHint = document.getElementById('coplayHint');
        modeSelect.addEventListener('change', () => {
            this.gameMode = modeSelect.value;

            // Show/hide co-play hint
            if (coplayHint) coplayHint.style.display = this.gameMode === 'coplay' ? '' : 'none';

            // Update co-play visual on keys and lane selectors
            this._updateCoPlayKeyVisuals();
            this._buildLaneSelectors();

            // Re-apply notes if a song is loaded
            if (this.originalNotes.length > 0) {
                this.applyGameMode();

                // If mid-game, remap falling notes while preserving hit/missed state
                if (this.isPlaying || this.isPaused) {
                    this._remapFallingNotes();
                }
            }
        });
    }

    updateBPMDisplay() {
        const el = document.getElementById('bpmDisplay');
        if (this.songBPM) {
            const effectiveBPM = Math.round(this.songBPM * this.speedMultiplier);
            el.textContent = `BPM: ${effectiveBPM} (original ${this.songBPM})`;
        } else {
            el.textContent = 'BPM: --';
        }
    }

    estimateBPM(notes) {
        if (!notes || notes.length < 2) return null;
        // Estimate BPM from average inter-note time
        const times = notes.map(n => n.time).sort((a, b) => a - b);
        const gaps = [];
        for (let i = 1; i < times.length; i++) {
            const gap = times[i] - times[i - 1];
            if (gap > 0.05 && gap < 2) gaps.push(gap); // filter out tiny/huge gaps
        }
        if (gaps.length === 0) return null;
        const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
        return Math.round(60 / median);
    }

    applyGameMode() {
        if (this.gameMode === 'simple') {
            this.notes = this._simplifyByMerge(this.originalNotes);
        } else {
            // Normal, coplay, practice — use original notes
            this.notes = this.originalNotes.map(n => ({ ...n }));
        }
        // Compute song duration from the latest note end time
        this.songDuration = this.notes.reduce((max, n) => Math.max(max, n.time + (n.duration || 0.15)), 0);
        this.updateSongTimeline(0);
        this.rebuildKeyboardForNotes(this.notes);
        // Re-apply co-play lane visuals after keyboard rebuild
        if (this.gameMode === 'coplay') {
            // Defer so _placeBlackKeys (rAF) finishes first
            requestAnimationFrame(() => this._updateCoPlayKeyVisuals());
        }
    }

    _remapFallingNotes() {
        // Rebuild falling notes from the new this.notes, preserving game state by time+index
        const stateMap = new Map();
        this.fallingNotes.forEach((fn, i) => {
            stateMap.set(i, { hit: fn.hit, missed: fn.missed, holdStart: fn.holdStart });
        });

        // Stop active sounds and clear held state
        this.autoPlayTimeouts.forEach(t => clearTimeout(t));
        this.autoPlayTimeouts = [];
        document.querySelectorAll('.key.active').forEach(k => k.classList.remove('active'));
        for (const note of this.activeNoteSources.keys()) {
            this.stopNoteSound(note);
        }
        this.heldFallingNotes.clear();

        // Rebuild with new note names but same timing and state
        this.fallingNotes = this.notes.map((note, i) => {
            const state = stateMap.get(i) || {};
            return {
                ...note,
                y: -50, // will be recalculated in next update()
                hit: state.hit || false,
                missed: state.missed || false,
                holdStart: state.holdStart
            };
        });

        this.totalNotes = this.fallingNotes.length;

        // Reschedule auto-play if active
        if (this.isAutoPlay && this.isPlaying && !this.isPaused) {
            this._scheduleAutoPlayNotes();
        }
    }

    /**
     * Simple mode: aggressively merge sequential same-pitch notes into long
     * held notes.  Any note on the same pitch that starts within 10ms after
     * the previous note ends is absorbed, extending the duration.
     * Original pitches are kept — the keyboard expands to fit.
     */
    _simplifyByMerge(notes) {
        let work = notes.map(n => ({ ...n }));
        work.sort((a, b) => {
            if (a.note !== b.note) return a.note < b.note ? -1 : 1;
            return a.time - b.time;
        });

        const merged = [];
        let i = 0;
        while (i < work.length) {
            const n = { ...work[i] };
            let nEnd = n.time + (n.duration || 0.15);
            while (i + 1 < work.length && work[i + 1].note === n.note) {
                const nxt = work[i + 1];
                if (nxt.time <= nEnd + 0.01) {
                    const nxtEnd = nxt.time + (nxt.duration || 0.15);
                    if (nxtEnd > nEnd) {
                        n.duration = nxtEnd - n.time;
                        nEnd = nxtEnd;
                    }
                    i++;
                } else {
                    break;
                }
            }
            merged.push(n);
            i++;
        }

        merged.sort((a, b) => a.time - b.time);
        return merged;
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
            this.originalNotes = data.notes;
            this.songBPM = this.estimateBPM(data.notes);
            this.updateBPMDisplay();
            this.applyGameMode();
            
            this.statusMessage.textContent = `Analysis complete! Found ${this.notes.length} notes using ${data.backend}. ${data.cached ? '(Loaded from cache)' : ''} Press Play!`;
            this.updateProgress(100);
            this._updateControlButtons();
            
        } catch (error) {
            console.error('Error loading YouTube audio:', error);
            this.statusMessage.textContent = 'Error: Could not connect to Python backend server. Make sure to run: python3 server.py';
            
            // Fallback to demo notes if server is not available and fallback is enabled
            if (this.enableDemoFallback) {
                this.statusMessage.textContent += ' Using demo notes instead.';
                this.notes = this.generateDemoNotes();
                this._updateControlButtons();
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
            alert('Please load a MIDI file first');
            return;
        }

        // If already playing/paused, switch from auto-play to manual
        if (this.isPlaying || this.isPaused) {
            this._switchToManual();
            return;
        }
        
        this.stopPreview();

        // Clear any lingering auto-play timeouts from a previous run
        this.autoPlayTimeouts.forEach(t => clearTimeout(t));
        this.autoPlayTimeouts = [];

        this.isPlaying = true;
        this.isPaused = false;

        // If user pre-seeked on the timeline, fallingNotes and startTime are already set.
        // Otherwise start from the beginning with a lead-in.
        const preSeeked = this.fallingNotes.length > 0 && this.startTime;
        if (!preSeeked) {
            const leadInSec = this.hitZoneY / (this.noteSpeed * this.speedMultiplier);
            this.startTime = Date.now() + leadInSec * 1000;

            this.fallingNotes = this.notes.map(note => ({
                ...note,
                y: -50,
                hit: false,
                missed: false
            }));
        } else {
            // Shift startTime so the game clock picks up from the pre-seeked position
            const refTime = this.pauseTime || Date.now();
            const gameClockSec = (refTime - this.startTime) / 1000;
            this.startTime = Date.now() - gameClockSec * 1000;
        }

        this._updateControlButtons();

        // Practice mode setup
        this.practiceWaiting = false;
        this.practiceExpectedNotes = new Set();
        this.practiceHitNotes = new Set();
        this.practicePauseOffset = 0;

        const modeLabel = this.gameMode === 'practice' ? 'Practice mode' :
                          this.gameMode === 'coplay' ? 'Co-Play' :
                          this.gameMode === 'simple' ? 'Simple mode' : 'Game';
        this.statusMessage.textContent = `${modeLabel} in progress...`;
        
        this.totalNotes = this.fallingNotes.length;
        
        // Co-Play: auto-start auto-play for non-manual lanes
        if (this.gameMode === 'coplay' && this.coPlayManualNotes.size > 0) {
            this.isAutoPlay = true;
            this._scheduleAutoPlayNotes();
        }

        // In a real implementation, start playing the actual audio here
        this.playDemoAudio();
    }

    _switchToManual() {
        // Cancel auto-play timeouts and clear active keys
        this.autoPlayTimeouts.forEach(t => clearTimeout(t));
        this.autoPlayTimeouts = [];
        document.querySelectorAll('.key.active').forEach(k => k.classList.remove('active'));
        // Stop all currently sounding notes
        for (const note of this.activeNoteSources.keys()) {
            this.stopNoteSound(note);
        }
        this.heldFallingNotes.clear();

        // Unpause if paused
        if (this.isPaused) {
            this.isPaused = false;
            const pauseDuration = Date.now() - this.pauseTime;
            this.startTime += pauseDuration;
        }

        // Co-Play: keep auto-playing non-manual lanes
        if (this.gameMode === 'coplay' && this.coPlayManualNotes.size > 0) {
            this.isAutoPlay = true;
            this._scheduleAutoPlayNotes();
        } else {
            this.isAutoPlay = false;
        }

        this._updateControlButtons();
        const modeLabel = this.gameMode === 'practice' ? 'Practice mode' :
                          this.gameMode === 'coplay' ? 'Co-Play' :
                          this.gameMode === 'simple' ? 'Simple mode' : 'Manual play';
        this.statusMessage.textContent = `${modeLabel} — continuing from current position!`;
    }
    
    playDemoAudio() {
        // In a real implementation, this would play the YouTube audio
        // For demo, we just track time
    }

    /** Apply or remove coplay-manual CSS class on all piano keys and update lane selectors */
    _updateCoPlayKeyVisuals() {
        document.querySelectorAll('.key').forEach(k => {
            const note = k.dataset.note;
            if (this.gameMode === 'coplay' && this.coPlayManualNotes.has(note)) {
                k.classList.add('coplay-manual');
            } else {
                k.classList.remove('coplay-manual');
            }
        });
        // Sync lane selector selected state
        document.querySelectorAll('.lane-selector').forEach(sel => {
            const note = sel.dataset.note;
            if (this.coPlayManualNotes.has(note)) {
                sel.classList.add('selected');
            } else {
                sel.classList.remove('selected');
            }
        });
        this._laneCacheDirty = true;
    }

    /** Build lane selector buttons above each piano key (visible only in co-play mode) */
    _buildLaneSelectors() {
        // Remove any existing selectors
        document.querySelectorAll('.lane-selector').forEach(el => el.remove());

        if (this.gameMode !== 'coplay') return;

        const container = document.querySelector('.piano-keys');
        if (!container) return;

        for (const note of this.allNotes) {
            const pos = this.keyPositions[note];
            if (!pos) continue;

            const btn = document.createElement('button');
            btn.className = 'lane-selector' + (this.coPlayManualNotes.has(note) ? ' selected' : '');
            btn.dataset.note = note;

            const keyBind = this.noteToKey[note];
            btn.textContent = keyBind || '?';
            btn.title = `${note}: ${keyBind ? 'Key ' + keyBind : 'No binding'} — click to toggle manual lane`;

            btn.style.left  = pos.left + 'px';
            btn.style.width = pos.width + 'px';
            btn.style.zIndex = pos.isBlack ? '10' : '5';

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleLaneSelectorClick(note, btn);
            });
            btn.addEventListener('touchstart', (e) => {
                e.stopPropagation();
            }, { passive: true });

            container.appendChild(btn);
        }
    }

    /** Toggle a lane and (when selecting) open the key remap modal */
    _handleLaneSelectorClick(note, btn) {
        const wasSelected = this.coPlayManualNotes.has(note);

        if (wasSelected) {
            // Deselect lane
            this.coPlayManualNotes.delete(note);
            btn.classList.remove('selected');
        } else {
            // Select lane and offer key remapping
            this.coPlayManualNotes.add(note);
            btn.classList.add('selected');
            this._openKeyMapModal(note);
        }

        this._updateCoPlayKeyVisuals();
        this._laneCacheDirty = true;

        // Reschedule auto-play if mid-game
        if (this.isPlaying && !this.isPaused && this.isAutoPlay) {
            this.autoPlayTimeouts.forEach(t => clearTimeout(t));
            this.autoPlayTimeouts = [];
            this._scheduleAutoPlayNotes();
        }
    }

    /** Open the key remapping lightbox for a given piano note */
    _openKeyMapModal(note) {
        this.keyMapTargetNote = note;
        this.keyMapPendingKey = null;
        this.keyMapModalOpen = true;

        const currentKey = this.noteToKey[note];
        document.getElementById('keyMapNoteName').textContent = note;
        document.getElementById('keyMapCurrentKey').textContent = currentKey || 'None';
        document.getElementById('keyMapNewRow').classList.add('hidden');
        document.getElementById('keyMapNewKey').textContent = '';
        document.getElementById('keyMapNewKey').classList.remove('conflict');
        document.getElementById('keyMapConfirm').classList.add('hidden');
        document.getElementById('keyMapModal').classList.remove('hidden');
    }

    /** Capture a key press in the remap modal and show preview */
    _captureKeyForRemap(key) {
        let displayKey;
        if (key === ' ') {
            displayKey = 'Space';
        } else if (key.length === 1) {
            displayKey = key.toUpperCase();
        } else {
            return; // ignore Arrow keys, F-keys, etc.
        }

        this.keyMapPendingKey = displayKey;

        // Show the new binding preview
        const newRow = document.getElementById('keyMapNewRow');
        newRow.classList.remove('hidden');
        const newKeyEl = document.getElementById('keyMapNewKey');
        newKeyEl.textContent = displayKey;
        newKeyEl.classList.remove('conflict');
        newKeyEl.title = '';

        // Warn if this key is already used by another note
        const existingNote = this.keyToNote[displayKey];
        if (existingNote && existingNote !== this.keyMapTargetNote) {
            newKeyEl.classList.add('conflict');
            newKeyEl.title = `⚠ Currently mapped to ${existingNote} — will be reassigned`;
        }

        document.getElementById('keyMapConfirm').classList.remove('hidden');
    }

    /** Close the key remap modal, optionally saving the pending key */
    _closeKeyMapModal(save) {
        if (save && this.keyMapPendingKey && this.keyMapTargetNote) {
            this._applyKeyRemap(this.keyMapTargetNote, this.keyMapPendingKey);
        }
        this.keyMapModalOpen = false;
        this.keyMapTargetNote = null;
        this.keyMapPendingKey = null;
        document.getElementById('keyMapModal').classList.add('hidden');
    }

    /** Reassign a piano note to a new keyboard key */
    _applyKeyRemap(note, newKey) {
        // Remove the note's old keyboard binding
        const oldKey = this.noteToKey[note];
        if (oldKey) {
            delete this.keyToNote[oldKey];
        }

        // Remove any existing assignment of the new key to a different note
        const existingNote = this.keyToNote[newKey];
        if (existingNote) {
            delete this.noteToKey[existingNote];
            this._refreshKeyLabel(existingNote);
        }

        // Apply the new binding
        this.noteToKey[note] = newKey;
        this.keyToNote[newKey] = note;
        this._refreshKeyLabel(note);

        // Update the lane selector label
        const sel = document.querySelector(`.lane-selector[data-note="${note}"]`);
        if (sel) sel.textContent = newKey;
    }

    /** Remove all keyboard bindings for a piano note */
    _removeKeyBinding(note) {
        const oldKey = this.noteToKey[note];
        if (!oldKey) return;
        delete this.keyToNote[oldKey];
        delete this.noteToKey[note];
        this._refreshKeyLabel(note);
        const sel = document.querySelector(`.lane-selector[data-note="${note}"]`);
        if (sel) sel.textContent = '?';
    }

    /** Refresh the label shown on a piano key element */
    _refreshKeyLabel(note) {
        const keyEl = document.querySelector(`.key[data-note="${note}"]`);
        if (!keyEl) return;
        const newBind = this.noteToKey[note];
        const noteName = note.replace(/\d+/, '');
        if (newBind) {
            keyEl.dataset.key = newBind;
            keyEl.innerHTML = `<span class="key-label">${newBind}<br>${noteName}</span>`;
        } else {
            delete keyEl.dataset.key;
            keyEl.innerHTML = `<span class="key-label">${noteName}</span>`;
        }
    }

    /** Check for a note hit triggered by a direct click/touch on an unbound piano key */
    _checkHitByNote(note) {
        let closestNote = null;
        let closestDistance = this.hitTolerance + 1;

        for (let i = 0; i < this.fallingNotes.length; i++) {
            const fn = this.fallingNotes[i];
            if (fn.note === note && !fn.hit && !fn.missed) {
                const dist = Math.abs(fn.y - this.hitZoneY);
                if (dist <= this.hitTolerance && dist < closestDistance) {
                    closestNote = fn;
                    closestDistance = dist;
                }
            }
        }

        if (closestNote) {
            closestNote.hit = true;
            closestNote.holdStart = (Date.now() - this.startTime) / 1000;
            this.combo++;
            this.hitNotes++;
            const accuracy = 1 - (closestDistance / this.hitTolerance);
            const points = Math.floor(100 * accuracy * (1 + this.combo * 0.1));
            this.score += points;
            this.updateScore();
            this.showHitFeedback(note, true);
            this.heldFallingNotes.set(note, closestNote);
        }
    }

    startAutoPlay() {
        // If already playing/paused, switch to auto-play from current position
        const continuing = this.isPlaying || this.isPaused;

        if (!continuing) {
            this.startGame();
        } else {
            // Cancel any existing auto-play timeouts
            this.autoPlayTimeouts.forEach(t => clearTimeout(t));
            this.autoPlayTimeouts = [];
            document.querySelectorAll('.key.active').forEach(k => k.classList.remove('active'));
            for (const note of this.activeNoteSources.keys()) {
                this.stopNoteSound(note);
            }
            this.heldFallingNotes.clear();

            // Clear practice mode state
            this.practiceWaiting = false;
            this.practiceExpectedNotes = new Set();
            this.practiceHitNotes = new Set();
            document.querySelectorAll('.key.practice-target').forEach(k => k.classList.remove('practice-target'));

            // Unpause if paused
            if (this.isPaused) {
                this.isPaused = false;
                const pauseDuration = Date.now() - this.pauseTime;
                this.startTime += pauseDuration;
            }
        }

        this.isAutoPlay = true;
        this._updateControlButtons();

        const isCoPlay = this.gameMode === 'coplay';
        const manualCount = this.coPlayManualNotes.size;
        if (isCoPlay && manualCount > 0) {
            this.statusMessage.textContent = continuing
                ? `Co-Play — ${manualCount} manual lane${manualCount > 1 ? 's' : ''}, continuing!`
                : `Co-Play — ${manualCount} manual lane${manualCount > 1 ? 's' : ''}, go!`;
        } else {
            this.statusMessage.textContent = continuing
                ? 'Auto Play — continuing from current position!'
                : 'Auto Play — watch and listen!';
        }

        this._scheduleAutoPlayNotes();
    }

    /** Toggle between Manual and Auto play mode */
    toggleManualAuto() {
        if (this.isPaused || (!this.isPlaying && !this.isPaused)) {
            // While paused or before game starts, just flip the flag — don't start/resume
            this.isAutoPlay = this.modeToggleSwitch.checked;
            this._updateControlButtons();
            return;
        }
        if (this.modeToggleSwitch.checked) {
            this.startAutoPlay();
        } else {
            this._switchToManual();
        }
        this._updateControlButtons();
    }

    /** Play/Pause toggle — starts game if not yet started */
    togglePlayPause() {
        if (!this.isPlaying && !this.isPaused) {
            // Not started — begin
            if (this.isAutoPlay) {
                this.startAutoPlay();
            } else {
                this.startGame();
            }
            this._updateControlButtons();
            return;
        }

        // Toggle pause
        this.isPaused = !this.isPaused;

        if (this.isPaused) {
            this.pauseTime = Date.now();
            if (this.isAutoPlay) {
                this.autoPlayTimeouts.forEach(t => clearTimeout(t));
                this.autoPlayTimeouts = [];
                document.querySelectorAll('.key.active').forEach(k => k.classList.remove('active'));
                for (const note of this.activeNoteSources.keys()) {
                    this.stopNoteSound(note);
                }
                this.heldFallingNotes.clear();
            }
            this.statusMessage.textContent = 'Paused — press Play to continue';
        } else {
            const pauseDuration = Date.now() - this.pauseTime;
            this.startTime += pauseDuration;
            if (this.isAutoPlay) {
                this._scheduleAutoPlayNotes();
                this.statusMessage.textContent = 'Auto Play in progress...';
            } else {
                this.statusMessage.textContent = 'Game in progress...';
            }
        }
        this._updateControlButtons();
    }

    /** Update all control button states and labels */
    _updateControlButtons() {
        const hasNotes = this.notes.length > 0;
        const playing = this.isPlaying && !this.isPaused;

        // Mode toggle: always enabled
        this.modeToggleSwitch.disabled = false;
        this.modeToggleSwitch.checked = this.isAutoPlay;

        // Play / Pause
        this.playPauseBtn.disabled = !hasNotes;
        if (playing) {
            this.playPauseBtn.innerHTML = '&#10074;&#10074; Pause';
            this.playPauseBtn.classList.add('playing');
        } else {
            this.playPauseBtn.innerHTML = '&#9654; Play';
            this.playPauseBtn.classList.remove('playing');
        }

        // Stop
        this.stopBtn.disabled = !this.isPlaying && !this.isPaused;
    }

    _scheduleAutoPlayNotes() {
        // Use real game clock (negative during lead-in) so sounds sync with visual notes
        const currentTime = (Date.now() - this.startTime) / 1000;

        // Schedule automatic key presses for remaining notes
        const speed = this.speedMultiplier;
        const isCoPlay = this.gameMode === 'coplay';
        this.fallingNotes.forEach(note => {
            if (note.hit || note.missed) return; // skip already played notes

            // Co-Play: skip notes on manual lanes — player must hit them
            if (isCoPlay && this.coPlayManualNotes.has(note.note)) return;

            const delay = Math.max(0, (note.time / speed - currentTime) * 1000);
            const key = this.noteToKey[note.note];
            const holdMs = Math.max(80, ((note.duration || 0.15) / speed) * 1000);

            const tid = setTimeout(() => {
                if (!this.isPlaying || this.isPaused) return;

                // Directly mark the note as hit (bypasses timing-sensitive position check)
                if (!note.hit && !note.missed) {
                    note.hit = true;
                    note.holdStart = (Date.now() - this.startTime) / 1000;
                    this.combo++;
                    this.hitNotes++;
                    this.score += Math.floor(100 * (1 + this.combo * 0.1));
                    this.updateScore();
                    this.showHitFeedback(note.note, true);
                    this.heldFallingNotes.set(note.note, note);
                }

                // Play sound + visual (hold for note duration)
                const keyElement = key
                    ? document.querySelector(`.key[data-key="${key}"]`)
                    : document.querySelector(`.key[data-note="${note.note}"]`);
                if (keyElement) keyElement.classList.add('active');
                this.playNoteSound(note.note, note.duration);

                const releaseTid = setTimeout(() => {
                    if (keyElement) keyElement.classList.remove('active');
                    this.heldFallingNotes.delete(note.note);
                }, holdMs);
                this.autoPlayTimeouts.push(releaseTid);
            }, delay);
            this.autoPlayTimeouts.push(tid);
        });
    }
    
    // togglePause is now handled by togglePlayPause()
    
    reset() {
        this.isPlaying = false;
        this.isPaused = false;
        this.isAutoPlay = false;
        this.autoPlayTimeouts.forEach(t => clearTimeout(t));
        this.autoPlayTimeouts = [];
        this.fallingNotes = [];
        this.heldFallingNotes.clear();
        this.heldKeys.clear();
        // Stop all active note sounds
        for (const note of this.activeNoteSources.keys()) {
            this.stopNoteSound(note);
        }
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.hitNotes = 0;
        this.missedNotes = 0;
        this.totalNotes = 0;
        this.practiceWaiting = false;
        this.practiceExpectedNotes = new Set();
        this.practiceHitNotes = new Set();
        document.querySelectorAll('.key.practice-target').forEach(k => k.classList.remove('practice-target'));
        document.querySelectorAll('.key.active').forEach(k => k.classList.remove('active'));
        this.updateScore();
        this.updateSongTimeline(0);
        this._updateControlButtons();
        this.statusMessage.textContent = this.notes.length > 0 ? 
            'Ready to play! Press Play.' : 'Load a MIDI file to start';
    }
    
    handleKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

        // If key map modal is open, route key presses to the remapper
        if (this.keyMapModalOpen) {
            e.preventDefault();
            if (e.key === 'Escape') {
                this._closeKeyMapModal(false);
            } else if (e.key === 'Enter') {
                this._closeKeyMapModal(true);
            } else {
                this._captureKeyForRemap(e.key);
            }
            return;
        }

        const key = e.key.toUpperCase();
        if (this.keyToNote[key]) {
            e.preventDefault();
            this.pressKey(key);
        }
    }
    
    handleKeyUp(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        const key = e.key.toUpperCase();
        if (this.keyToNote[key]) {
            e.preventDefault();
            this.releaseKey(key);
        }
    }
    
    handlePianoKeyPress(keyElement) {
        // Co-play lane toggling is now handled by the lane selector buttons above each key.
        // Piano key clicks/touches always play the note in every mode.
        const key = keyElement.dataset.key;
        if (key) {
            this.pressKey(key);
        } else {
            // No keyboard binding — play sound directly
            const note = keyElement.dataset.note;
            if (note) {
                keyElement.classList.add('active');
                this.stopNoteSound(note);
                this.playNoteSound(note);
                if (this.isPlaying && !this.isPaused) {
                    if (this.gameMode === 'practice' && this.practiceWaiting) {
                        if (this.practiceExpectedNotes.has(note) && !this.practiceHitNotes.has(note)) {
                            this._practiceHitNote(note);
                        }
                    } else {
                        this._checkHitByNote(note);
                    }
                }
            }
        }
    }
    
    handlePianoKeyRelease(keyElement) {
        const key = keyElement.dataset.key;
        if (key) {
            this.releaseKey(key);
        } else {
            keyElement.classList.remove('active');
            const note = keyElement.dataset.note;
            if (note) {
                this.stopNoteSound(note);
                this.heldFallingNotes.delete(note);
            }
        }
    }
    
    pressKey(key) {
        if (this.heldKeys.has(key)) return; // ignore key repeat
        this.heldKeys.add(key);

        const keyElement = document.querySelector(`.key[data-key="${key}"]`);
        if (keyElement) {
            keyElement.classList.add('active');
        }
        
        // Play the piano note sound (sustained until release)
        const note = this.keyToNote[key];
        if (note) {
            this.stopNoteSound(note); // stop any prior sound for this note
            this.playNoteSound(note);
        }
        
        if (this.isPlaying && !this.isPaused) {
            this.checkHit(key);
        }
    }
    
    playNoteSound(note, duration) {
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

        // Update persistent graph levels smoothly (avoid clicks)
        this.masterGain.gain.setTargetAtTime(p.volume, now, 0.01);
        this.dryGain.gain.setTargetAtTime(1 - p.reverb * 0.5, now, 0.01);
        this.wetGain.gain.setTargetAtTime(p.reverb * 0.5, now, 0.01);

        // Create a source from the sample buffer
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;

        const noteGain = this.audioContext.createGain();
        noteGain.gain.setValueAtTime(1.4, now);
        source.connect(noteGain);
        noteGain.connect(this.dryGain);
        if (p.reverb > 0.01) noteGain.connect(this.wetGain);

        source.start(now);

        // If explicit duration (auto-play), schedule fixed fade
        // Otherwise (user-played), sustain until stopNoteSound is called
        if (duration != null) {
            const speed = this.speedMultiplier;
            const holdTime = Math.max(0.15, Math.min(8, duration / speed));
            const fadeTime = Math.min(0.6, holdTime * 0.4);
            const fadeStart = now + holdTime;
            const fadeEnd   = fadeStart + fadeTime;
            noteGain.gain.setValueAtTime(1.4, fadeStart);
            noteGain.gain.linearRampToValueAtTime(0, fadeEnd);
            source.stop(fadeEnd);
        } else {
            // Sustain for up to 10s max (safety cap); will be cut short by stopNoteSound
            const maxSustain = now + 10;
            noteGain.gain.setValueAtTime(1.4, maxSustain);
            noteGain.gain.linearRampToValueAtTime(0, maxSustain + 0.3);
            source.stop(maxSustain + 0.3);
        }

        // Track for later stop-on-release
        this.activeNoteSources.set(note, { source, noteGain });

        // Disconnect nodes after playback to prevent memory leaks
        source.onended = () => {
            source.disconnect();
            noteGain.disconnect();
            // Clean up tracking if this source is still the active one
            const active = this.activeNoteSources.get(note);
            if (active && active.source === source) {
                this.activeNoteSources.delete(note);
            }
        };
    }

    stopNoteSound(note) {
        const active = this.activeNoteSources.get(note);
        if (!active) return;
        const { noteGain, source } = active;
        const now = this.audioContext.currentTime;
        // Quick fade-out to avoid click
        noteGain.gain.cancelScheduledValues(now);
        noteGain.gain.setValueAtTime(noteGain.gain.value, now);
        noteGain.gain.linearRampToValueAtTime(0, now + 0.08);
        try { source.stop(now + 0.08); } catch (e) { /* already stopped */ }
        this.activeNoteSources.delete(note);
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
        this.heldKeys.delete(key);
        const keyElement = document.querySelector(`.key[data-key="${key}"]`);
        if (keyElement) {
            keyElement.classList.remove('active');
        }
        // Stop the sustained sound
        const note = this.keyToNote[key];
        if (note) {
            this.stopNoteSound(note);
            this.heldFallingNotes.delete(note);
        }
    }
    
    checkHit(key) {
        const note = this.keyToNote[key];
        if (!note) return;

        // ── Practice mode: check if it's one of the expected notes ──
        if (this.gameMode === 'practice' && this.practiceWaiting) {
            if (this.practiceExpectedNotes.has(note) && !this.practiceHitNotes.has(note)) {
                this._practiceHitNote(note);
            }
            return; // In practice mode, only expected notes count
        }
        
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
        
        if (closestNote) {
            closestNote.hit = true;
            closestNote.holdStart = (Date.now() - this.startTime) / 1000;
            this.combo++;
            this.hitNotes++;
            
            const accuracy = 1 - (closestDistance / this.hitTolerance);
            const points = Math.floor(100 * accuracy * (1 + this.combo * 0.1));
            this.score += points;
            
            this.updateScore();
            this.showHitFeedback(note, true);
            this.heldFallingNotes.set(note, closestNote);
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
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        this.streakElement.textContent = this.maxCombo;
        
        const processedNotes = this.hitNotes + this.missedNotes;
        const accuracy = processedNotes > 0 ? 
            Math.floor((this.hitNotes / processedNotes) * 100) : 0;
        this.accuracyElement.textContent = accuracy;
    }

    _formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    updateSongTimeline(currentTimeSec) {
        if (!this.songDuration || this.songDuration <= 0) return;
        const pct = Math.max(0, Math.min(100, (currentTimeSec / this.songDuration) * 100));
        this.songTimelineFill.style.width = pct + '%';
        this.songTimelineThumb.style.left = pct + '%';
        this.songTimeLabel.textContent = `${this._formatTime(Math.max(0, currentTimeSec))} / ${this._formatTime(this.songDuration)}`;
    }

    seekTimeline(e) {
        if (!this.songDuration || this.songDuration <= 0) return;
        if (!this.notes || this.notes.length === 0) return;

        const rect = this.songTimeline.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const seekTimeSec = pct * this.songDuration; // song time (unscaled)
        const speed = this.speedMultiplier;
        // Game clock = seekTimeSec / speed (since update uses scaledNoteTime = note.time / speed)
        const gameClockSec = seekTimeSec / speed;
        const notYetStarted = !this.isPlaying && !this.isPaused;

        // Adjust startTime so the game clock reads gameClockSec
        if (this.isPaused || notYetStarted) {
            const refTime = this.pauseTime || Date.now();
            this.startTime = refTime - gameClockSec * 1000;
        } else {
            this.startTime = Date.now() - gameClockSec * 1000;
        }

        // Cancel auto-play timeouts and clear active sounds
        this.autoPlayTimeouts.forEach(t => clearTimeout(t));
        this.autoPlayTimeouts = [];
        document.querySelectorAll('.key.active').forEach(k => k.classList.remove('active'));
        for (const note of this.activeNoteSources.keys()) {
            this.stopNoteSound(note);
        }
        this.heldFallingNotes.clear();

        // Rebuild falling notes: mark notes before seek point as hit/missed
        this.fallingNotes = this.notes.map(note => {
            const noteEnd = note.time + (note.duration || 0.15);
            const alreadyPassed = noteEnd < seekTimeSec;
            return {
                ...note,
                y: -50,
                hit: alreadyPassed,
                missed: false
            };
        });

        // Recalculate stats for notes before seek point
        this.hitNotes = this.fallingNotes.filter(n => n.hit).length;
        this.missedNotes = 0;
        this.totalNotes = this.fallingNotes.length;
        this.updateScore();
        this.updateSongTimeline(seekTimeSec);

        // Reschedule auto-play if active
        if (this.isAutoPlay && !this.isPaused) {
            this._scheduleAutoPlayNotes();
        }

        // If paused or not yet started, force a single render frame so notes are visible
        if (this.isPaused || notYetStarted) {
            this._renderAtTime(gameClockSec);
        }
    }

    /** Compute note Y positions for a given game clock time and draw one frame */
    _renderAtTime(gameClockSec) {
        const speed = this.speedMultiplier;
        for (const note of this.fallingNotes) {
            const scaledNoteTime = note.time / speed;
            const timeUntilHit = scaledNoteTime - gameClockSec;
            note.y = this.hitZoneY - (timeUntilHit * this.noteSpeed * speed);
        }
        this.draw();
    }
    
    update() {
        if (!this.isPlaying || this.isPaused) return;

        // ── Practice mode: freeze time until correct note is played ──
        if (this.gameMode === 'practice' && !this.isAutoPlay) {
            return this.updatePracticeMode();
        }
        
        const currentTime = (Date.now() - this.startTime) / 1000;
        const speed = this.speedMultiplier;

        // Update song progress timeline
        this.updateSongTimeline(currentTime * speed);
        
        // Update falling notes
        for (let i = this.fallingNotes.length - 1; i >= 0; i--) {
            const note = this.fallingNotes[i];
            
            // Always update Y position so notes keep scrolling (even after hit/missed)
            const scaledNoteTime = note.time / speed;
            const timeUntilHit = scaledNoteTime - currentTime;
            note.y = this.hitZoneY - (timeUntilHit * this.noteSpeed * speed);

            if (!note.hit && !note.missed) {
                // Check if note was missed
                if (note.y > this.hitZoneY + this.hitTolerance) {
                    note.missed = true;
                    this.missedNotes++;
                    this.combo = 0;
                    this.updateScore();
                }
            }
            
            // Remove notes that have fully scrolled off the bottom
            const dur = note.duration || 0.15;
            const noteHeight = Math.max(12, dur * this.noteSpeed * speed);
            if ((note.y - noteHeight) > this.canvas.height + 50) {
                this.fallingNotes.splice(i, 1);
            }
        }
        
        // Check if game is over
        if (this.fallingNotes.length === 0 && this.isPlaying) {
            this.isPlaying = false;
            this.isAutoPlay = false;
            this.autoPlayTimeouts.forEach(t => clearTimeout(t));
            this.autoPlayTimeouts = [];
            this.updateSongTimeline(this.songDuration);
            this.statusMessage.textContent = 
                `Game Over! Final Score: ${this.score} | Best Streak: ${this.maxCombo} | Accuracy: ${this.accuracyElement.textContent}%`;
            this._updateControlButtons();
        }
    }

    updatePracticeMode() {
        // Find the next unhit note
        const nextNote = this.fallingNotes.find(n => !n.hit && !n.missed);
        if (!nextNote) {
            // All done
            this.isPlaying = false;
            document.querySelectorAll('.key.practice-target').forEach(k => k.classList.remove('practice-target'));
            this.statusMessage.textContent = 
                `Practice complete! Score: ${this.score} | Accuracy: ${this.accuracyElement.textContent}%`;
            this._updateControlButtons();
            return;
        }

        // Freeze the virtual clock at the next note's time
        const virtualTime = nextNote.time;

        // Find ALL unhit notes at the same time (chord) — tolerance of 0.03s
        const chordNotes = this.fallingNotes.filter(
            n => !n.hit && !n.missed && Math.abs(n.time - virtualTime) < 0.03
        );

        for (const note of this.fallingNotes) {
            if (note.hit) continue;
            if (note.missed) continue;
            const timeUntilHit = note.time - virtualTime;
            note.y = this.hitZoneY - (timeUntilHit * this.noteSpeed);
        }

        // Build the set of expected notes for this chord
        const expectedSet = new Set(chordNotes.map(n => n.note));

        // Only reset tracking if the chord changed
        if (!this.practiceWaiting || !this._setsEqual(expectedSet, this.practiceExpectedNotes)) {
            this.practiceExpectedNotes = expectedSet;
            this.practiceHitNotes = new Set();
        }

        this.practiceWaiting = true;

        // Highlight expected keys on the piano
        document.querySelectorAll('.key.practice-target').forEach(k => k.classList.remove('practice-target'));
        for (const noteName of this.practiceExpectedNotes) {
            if (this.practiceHitNotes.has(noteName)) continue; // already pressed
            const targetKey = document.querySelector(`.key[data-note="${noteName}"]`);
            if (targetKey) targetKey.classList.add('practice-target');
        }

        const remaining = [...this.practiceExpectedNotes].filter(n => !this.practiceHitNotes.has(n));
        this.statusMessage.textContent = `Practice: play ${remaining.join(' + ')}`;
    }

    _setsEqual(a, b) {
        if (a.size !== b.size) return false;
        for (const v of a) if (!b.has(v)) return false;
        return true;
    }

    _practiceHitNote(noteName) {
        // Mark the matching falling note as hit
        const target = this.fallingNotes.find(
            n => !n.hit && !n.missed && n.note === noteName &&
                 this.practiceExpectedNotes.has(noteName)
        );
        if (!target) return false;

        target.hit = true;
        this.combo++;
        this.hitNotes++;
        this.score += Math.floor(100 * (1 + this.combo * 0.1));
        this.updateScore();
        this.showHitFeedback(noteName, true);
        this.practiceHitNotes.add(noteName);

        // Remove highlight from this key
        const keyEl = document.querySelector(`.key[data-note="${noteName}"]`);
        if (keyEl) keyEl.classList.remove('practice-target');

        // If all chord notes are hit, advance
        if (this.practiceHitNotes.size >= this.practiceExpectedNotes.size) {
            this.practiceWaiting = false;
            this.practiceExpectedNotes = new Set();
            this.practiceHitNotes = new Set();
        }
        return true;
    }
    
    _renderFrame() {
        this.update();
        
        const w = this.canvas.width, h = this.canvas.height;
        const ctx = this.ctx;

        // Clear canvas
        ctx.clearRect(0, 0, w, h);
        
        // Draw cached static layer (lanes + hit zone)
        if (this._laneCacheDirty || !this._laneCanvas) {
            this._rebuildLaneCache();
        }
        if (this._laneCanvas) {
            ctx.drawImage(this._laneCanvas, 0, 0);
        }
        
        // Draw vertical timeline
        this._drawTimeline();

        // Draw falling notes (including hit notes — they stay visible until scrolled off)
        const canvasH = h + 50;
        const speed = this.speedMultiplier;
        for (let i = 0, len = this.fallingNotes.length; i < len; i++) {
            const note = this.fallingNotes[i];
            // note.y = bottom edge; top edge = note.y - noteHeight
            const dur = note.duration || 0.15;
            const noteH = Math.max(12, dur * this.noteSpeed * speed);
            const topEdge = note.y - noteH;
            // Visible if top edge is above bottom of canvas AND bottom edge is below top
            if (topEdge < canvasH && note.y > -50) {
                this.drawNote(note);
            }
        }
        
        requestAnimationFrame(this._boundRender);
    }
    
    _rebuildLaneCache() {
        // Render lanes + hit zone to an offscreen canvas (redrawn only on resize)
        const w = this.canvas.width, h = this.canvas.height;
        if (!this._laneCanvas || this._laneCanvas.width !== w || this._laneCanvas.height !== h) {
            this._laneCanvas = document.createElement('canvas');
            this._laneCanvas.width = w;
            this._laneCanvas.height = h;
        }
        const lctx = this._laneCanvas.getContext('2d');
        lctx.clearRect(0, 0, w, h);

        const isCoPlay = this.gameMode === 'coplay';

        // Draw vertical lanes
        for (const note of this.allNotes) {
            const pos = this.keyPositions[note];
            if (!pos) continue;

            const isManual = isCoPlay && this.coPlayManualNotes.has(note);
            if (isManual) {
                lctx.fillStyle = 'rgba(255, 165, 0, 0.18)'; // orange tint for manual lanes
            } else {
                lctx.fillStyle = pos.isBlack ? 
                    'rgba(80, 40, 120, 0.15)' : 'rgba(255, 255, 255, 0.08)';
            }
            lctx.fillRect(pos.left, 0, pos.width, h);
            
            lctx.strokeStyle = isManual ? 'rgba(255, 165, 0, 0.4)' : 'rgba(255, 255, 255, 0.2)';
            lctx.lineWidth = 2;
            lctx.beginPath();
            lctx.moveTo(pos.left, 0);
            lctx.lineTo(pos.left, h);
            lctx.moveTo(pos.left + pos.width, 0);
            lctx.lineTo(pos.left + pos.width, h);
            lctx.stroke();
        }

        // Draw hit zone line
        lctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        lctx.fillRect(0, this.hitZoneY - 2, w, 4);

        // Draw hit zone indicators
        for (const [note, pos] of Object.entries(this.keyPositions)) {
            const iw = pos.width * 0.9;
            const ih = 8;
            const ix = pos.left + (pos.width - iw) / 2;
            const iy = this.hitZoneY - ih / 2;
            lctx.fillStyle = pos.isBlack ? 
                'rgba(156, 39, 176, 0.4)' : 'rgba(33, 150, 243, 0.4)';
            lctx.fillRect(ix, iy, iw, ih);
            lctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            lctx.lineWidth = 2;
            lctx.strokeRect(ix, iy, iw, ih);
        }

        this._laneCacheDirty = false;
    }
    
    drawNote(note) {
        const pos = this.keyPositions[note.note];
        if (!pos) return;
        const ctx = this.ctx;
        
        const noteWidth = pos.width * 0.9;
        // Height based on duration: duration(s) * noteSpeed(px/s) * speed, min 12px
        const dur = note.duration || 0.15;
        const noteHeight = Math.max(12, dur * this.noteSpeed * this.speedMultiplier);
        const x = pos.left + (pos.width - noteWidth) / 2;
        // note.y is the bottom edge (hit zone arrival point)
        const y = note.y - noteHeight;
        const r = Math.min(6, noteHeight / 2, noteWidth / 2); // corner radius
        
        // Pick colour — hand-aware like Synthesia
        // hand 0 = right hand (green tones), hand 1 = left hand (blue tones)
        let fill;
        const isHeld = note.hit && this.heldFallingNotes.get(note.note) === note;
        const isCoPlayManual = this.gameMode === 'coplay' && this.coPlayManualNotes.has(note.note);
        const hand = note.hand || 0;
        if (note.missed) {
            fill = '#f44336';
        } else if (note.hit && isHeld) {
            fill = hand === 0 ? '#66BB6A' : '#42A5F5'; // brighter when held
        } else if (note.hit) {
            fill = hand === 0 ? 'rgba(102, 187, 106, 0.4)' : 'rgba(66, 165, 245, 0.4)';
        } else if (this.gameMode === 'practice' && this.practiceWaiting && this.practiceExpectedNotes.has(note.note) && !note.hit) {
            fill = '#FFD600';
        } else if (isCoPlayManual) {
            fill = '#FF9800';
        } else if (this.gameMode === 'coplay') {
            fill = hand === 0 ? 'rgba(76, 175, 80, 0.45)' : 'rgba(33, 150, 243, 0.45)';
        } else {
            // Normal mode: right hand = green, left hand = blue/purple
            if (hand === 0) {
                fill = pos.isBlack ? '#388E3C' : '#4CAF50';
            } else {
                fill = pos.isBlack ? '#1565C0' : '#2196F3';
            }
        }
        
        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        this._roundRect(ctx, x + 2, y + 2, noteWidth, noteHeight, r);
        ctx.fill();

        // Body
        ctx.fillStyle = fill;
        this._roundRect(ctx, x, y, noteWidth, noteHeight, r);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        this._roundRect(ctx, x, y, noteWidth, noteHeight, r);
        ctx.stroke();

        // Gradient highlight on top edge
        if (noteHeight > 16) {
            const grad = ctx.createLinearGradient(x, y, x, y + Math.min(10, noteHeight * 0.3));
            grad.addColorStop(0, 'rgba(255,255,255,0.35)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            this._roundRect(ctx, x, y, noteWidth, Math.min(10, noteHeight * 0.3), r);
            ctx.fill();
        }
        
        // Label (only if note is tall enough)
        if (noteHeight > 18) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 9px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(note.note, pos.x, y + noteHeight / 2);
        }
    }

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }
    
    _drawTimeline() {
        if (!this.isPlaying || this.isPaused) return;
        const ctx = this.ctx;
        const speed = this.speedMultiplier;
        const currentTime = (Date.now() - this.startTime) / 1000;
        const pxPerSec = this.noteSpeed * speed;

        // Determine tick interval: 1s, 5s, or 10s depending on zoom
        let tickSec = 1;
        if (pxPerSec < 60) tickSec = 5;
        else if (pxPerSec < 30) tickSec = 10;

        // Original song-time range visible on canvas
        const timeAtTop = (currentTime + this.hitZoneY / pxPerSec) * speed;
        const timeAtBottom = (currentTime - (this.canvas.height - this.hitZoneY) / pxPerSec) * speed;

        const firstTick = Math.ceil(Math.max(0, timeAtBottom) / tickSec) * tickSec;
        const lastTick = Math.floor(timeAtTop / tickSec) * tickSec;

        ctx.save();
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (let t = firstTick; t <= lastTick; t += tickSec) {
            const scaledT = t / speed;
            const yy = this.hitZoneY - (scaledT - currentTime) * pxPerSec;
            if (yy < 0 || yy > this.canvas.height) continue;

            // Horizontal grid line
            ctx.strokeStyle = (t % 5 === 0) ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, yy);
            ctx.lineTo(this.canvas.width, yy);
            ctx.stroke();

            // Time label
            const mins = Math.floor(t / 60);
            const secs = Math.floor(t % 60);
            const label = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(2, yy - 8, ctx.measureText(label).width + 6, 16);
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillText(label, 5, yy);
        }
        ctx.restore();
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
