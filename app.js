// Piano Hero Game
class PianoHero {
    constructor() {
        // DOM elements
        this.canvas = document.getElementById('notesCanvas');
        this.ctx = this.canvas.getContext('2d');
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
        this.midiFileList = document.getElementById('midiFileList');
        this.autoPlayBtn = document.getElementById('modeToggleSwitch');
        this.gameArea = document.getElementById('gameArea');
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
        this.isAutoPlay = false;
        this.autoPlayTimeouts = [];
        this.previewTimeouts = [];
        this.previewSlug = null; // slug of currently previewing song
        
        // Game settings
        this.noteSpeed = 200; // pixels per second
        this.hitZoneY = this.canvas.height;
        this.hitTolerance = 50; // pixels tolerance for hitting notes
        this.showTimingFeedback = true; // show Perfect/Great/Good/OK/Miss text

        // Performance: cached static layers
        this._laneCanvas = null; // offscreen canvas for lanes + hit zone
        this._laneCacheDirty = true;
        this._boundRender = (ts) => this._renderFrame(ts);

        // PixiJS GPU-accelerated note renderer (DOM-composited, no drawImage needed)
        this.glCanvas = document.getElementById('glCanvas');
        this.glRenderer = this.glCanvas ? new PixiNoteRenderer(this.glCanvas) : null;
        if (this.glRenderer) console.log('[PianoHero] Using PixiJS note renderer');
        else console.log('[PianoHero] PixiJS not available, using Canvas 2D fallback');

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

        // Sparkle particles for held notes
        this.particles = [];
        this.particleStyle = 'sparkle'; // 'sparkle' or 'splash'
        this.sparkleIntensity = 1.0; // 0.0 to 1.0
        this.sparkleEnabled = true;
        this.sparkleHeight = 1.0; // 0.1 to 2.0
        this.laneStyle = 'synthesia'; // full, fill, blackonly, dim, synthesia, none
        this.noteStyle = 'classic'; // beam, classic
        this.waveEnabled = true;
        this.waveCount = 6;

        // Neon glow effect for falling notes
        this.neonGlowEnabled = false;
        this.hasBgImage = false;
        this.bgOverlayOpacity = 0.25;
        this._glowCanvas = null;
        this._glowCtx = null;

        // Shared wave overlay canvas for classic bars
        this._waveCanvas = null;
        this._waveCtx = null;

        // Reuse timing feedback nodes to reduce frequent DOM allocation/removal churn
        this._timingFeedbackPool = [];

        // Force field hit bar
        this.forceFieldEnabled = false;
        this._forceFieldParticles = [];
        this._forceFieldTime = 0;

        // Co-Play mode: lanes the player chose to play manually
        this.coPlayManualNotes = new Set();       // note names the player toggles as "manual"
        this.coPlayAutoVolume = 0.3;              // volume multiplier for auto-played (non-manual) notes in co-play

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

        // Keyboard bindings — OnlinePianist "Real" layout (3 octaves C3–A5)
        // QWERTY row + bottom row = white keys, number row + home row = black keys
        this.noteToKey = {
            // C3–B3: QWERTY row
            'C3': 'Q', 'C#3': '2', 'D3': 'W', 'D#3': '3',
            'E3': 'E', 'F3': 'R', 'F#3': '5', 'G3': 'T',
            'G#3': '6', 'A3': 'Y', 'A#3': '7', 'B3': 'U',
            // C4–B4: QWERTY continues (I O P) + bottom row (Z X C V)
            'C4': 'I', 'C#4': '9', 'D4': 'O', 'D#4': '0',
            'E4': 'P', 'F4': 'Z', 'F#4': 'S', 'G4': 'X',
            'G#4': 'D', 'A4': 'C', 'A#4': 'F', 'B4': 'V',
            // C5–A5: bottom row continues (B N M , . -)
            'C5': 'B', 'C#5': 'H', 'D5': 'N', 'D#5': 'J',
            'E5': 'M', 'F5': ',', 'F#5': 'L', 'G5': '.',
            'G#5': 'Æ', 'A5': '-', 'A#5': 'Ø',
        };

        // Map e.code to key label for keys where e.key might be unreliable
        this.codeToKey = {
            'Semicolon': 'Æ',     // Nordic Æ key (US semicolon position)
            'Quote': 'Ø',         // Nordic Ø key (US quote position)
            'Slash': '-',         // Nordic - key (US slash position)
            'Comma': ',',
            'Period': '.',
            'Minus': '-',         // Also handle the actual minus key on number row
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

        // Salamander Grand Piano (high-quality real piano samples)
        this.useSalamander = false;
        this.salamanderBuffers = {};     // { midiNumber: AudioBuffer }
        this.salamanderLoaded = false;
        this.currentSampleBank = null;   // 'Salamander'
        this.salamanderBaseUrl = 'https://tonejs.github.io/audio/salamander/';
        // Available samples (every minor third from A0 to C8)
        this.salamanderNotes = [
            'A0','C1','Ds1','Fs1','A1','C2','Ds2','Fs2','A2',
            'C3','Ds3','Fs3','A3','C4','Ds4','Fs4','A4',
            'C5','Ds5','Fs5','A5','C6','Ds6','Fs6','A6',
            'C7','Ds7','Fs7','A7','C8'
        ];

        // Sound parameters (updated from UI)
        this.soundParams = {
            volume: 0.8,
            reverb: 0,
        };

        // Sustain pedal — when on, notes ring out until they decay naturally
        this.sustainEnabled = true;
        this.sustainedNotes = new Set(); // notes held by sustain pedal

        // Audio enhancement settings
        this.eqCompressionEnabled = false;
        this.sympatheticResonanceEnabled = false;
        this._sympatheticPlaying = false; // prevent recursive triggering

        // Mouse/touch glissando state
        this._mouseDown = false;
        this._activeTouches = new Map(); // touchId -> last key element
        
        this.init();
    }
    
    init() {
        this.buildPianoKeys();
        // resizeCanvas is called after black keys are placed (inside buildPianoKeys)
        window.addEventListener('resize', () => {
            // On resize, rebuild black key positions from scratch
            this.buildPianoKeys();
        });
        
        // Load MIDI file list and set up tabs
        this.loadMidiFileList();
        this.initTabs();
        this.initBitMidi();
        this.initSoundPanel();
        this.initGameSettings();
        this._loadSettings();
        this._ensureSoundfontLoaded();

        // Song browser dropdown toggle
        const toggleSongBrowser = (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById('songBrowserDropdown');
            dropdown.classList.toggle('hidden');
            // Close mode dropdown if open
            document.getElementById('modeDropdown').classList.add('hidden');
        };
        document.getElementById('songBrowserBtn').addEventListener('click', toggleSongBrowser);
        document.getElementById('midiListHeaderText').addEventListener('click', toggleSongBrowser);

        // Close song browser when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('songBrowserDropdown');
            const btn = document.getElementById('songBrowserBtn');
            const songName = document.getElementById('midiListHeaderText');
            if (!dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && !btn.contains(e.target) && !songName.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
            // Close mode dropdown when clicking outside
            const modeDropdown = document.getElementById('modeDropdown');
            const modeBtn = document.getElementById('modeDropdownBtn');
            if (!modeDropdown.classList.contains('hidden') && !modeDropdown.contains(e.target) && !modeBtn.contains(e.target)) {
                modeDropdown.classList.add('hidden');
            }
        });

        // Mode dropdown toggle
        document.getElementById('modeDropdownBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById('modeDropdown');
            dropdown.classList.toggle('hidden');
            // Close song browser if open
            document.getElementById('songBrowserDropdown').classList.add('hidden');
        });

        // Mode dropdown option clicks
        document.querySelectorAll('.mode-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const isAuto = opt.dataset.auto === 'true';
                const mode = opt.dataset.mode;
                // Update active state
                document.querySelectorAll('.mode-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                // Update toggle switch
                this.modeToggleSwitch.checked = isAuto;
                // Update game mode
                this.gameMode = mode;
                const gameModeSelect = document.getElementById('gameModeSelect');
                if (gameModeSelect) gameModeSelect.value = mode;
                // Update label
                this._updateModeLabel();
                // Apply mode change
                this.isAutoPlay = isAuto;
                this._saveSettings();
                // Show/hide co-play controls
                const coplayHint = document.getElementById('coplayHint');
                if (coplayHint) coplayHint.style.display = mode === 'coplay' ? '' : 'none';
                const coplayVolRow = document.getElementById('coplayVolumeRow');
                if (coplayVolRow) coplayVolRow.style.display = mode === 'coplay' ? '' : 'none';
                this._updateCoPlayKeyVisuals();
                this._buildLaneSelectors();
                if (this.originalNotes.length > 0) this.applyGameMode();
                // Close dropdown
                document.getElementById('modeDropdown').classList.add('hidden');
                // If playing, apply the auto/manual switch
                if (this.isPlaying && !this.isPaused) {
                    if (isAuto) this.startAutoPlay();
                    else this._switchToManual();
                }
                this._updateControlButtons();
            });
        });
        
        // Event listeners
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
            const label = keyBind ? `<span class="keycap">${keyBind}</span><span class="note-name">${noteName}</span>` : `<span class="note-name">${noteName}</span>`;
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

    _placeBlackKeys(container, whiteKeys, retryCount = 0) {
        // If the container hasn't been laid out yet, retry (up to 10 frames)
        if (whiteKeys.length > 0 && whiteKeys[0].offsetWidth === 0 && retryCount < 10) {
            requestAnimationFrame(() => this._placeBlackKeys(container, whiteKeys, retryCount + 1));
            return;
        }
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
            const label = keyBind ? `<span class="keycap">${keyBind}</span><span class="note-name">${noteName}</span>` : `<span class="note-name">${noteName}</span>`;
            btn.innerHTML = `<span class="key-label">${label}</span>`;
            btn.style.left = (boundary - blackWidth / 2) + 'px';
            btn.style.width = blackWidth + 'px';
            container.appendChild(btn);
        }
        this._pendingBlackKeys = [];

        // Now recalculate canvas and key positions
        this.resizeCanvas();

        // Set up mouse + touch glissando handlers on the piano container
        this._setupPianoInteraction();

        // Build co-play lane selectors (requires updated keyPositions)
        this._buildLaneSelectors();
    }

    _setupPianoInteraction() {
        // Only bind all listeners once (container element persists across rebuilds)
        if (this._pianoInteractionBound) return;
        this._pianoInteractionBound = true;

        const container = document.querySelector('.piano-keys');

        // Mouse down on piano
        container.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this._mouseDown = true;
            const key = this._getKeyAtPoint(e.clientX, e.clientY);
            if (key) {
                this._mouseLastKey = key;
                this.handlePianoKeyPress(key);
            }
        });

        // Document-level mouse listeners
        document.addEventListener('mousemove', (e) => {
            if (!this._mouseDown) return;
            const key = this._getKeyAtPoint(e.clientX, e.clientY);
            if (key && key !== this._mouseLastKey) {
                if (this._mouseLastKey) this.handlePianoKeyRelease(this._mouseLastKey);
                this._mouseLastKey = key;
                this.handlePianoKeyPress(key);
            }
        });

        document.addEventListener('mouseup', () => {
            if (!this._mouseDown) return;
            this._mouseDown = false;
            if (this._mouseLastKey) {
                this.handlePianoKeyRelease(this._mouseLastKey);
                this._mouseLastKey = null;
            }
        });

        // Touch handlers (multi-touch glissando)
        container.addEventListener('touchstart', (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                const key = this._getKeyAtPoint(touch.clientX, touch.clientY);
                if (key) {
                    this._activeTouches.set(touch.identifier, key);
                    this.handlePianoKeyPress(key);
                }
            }
        }, { passive: false });

        container.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                const key = this._getKeyAtPoint(touch.clientX, touch.clientY);
                const prevKey = this._activeTouches.get(touch.identifier);
                if (key && key !== prevKey) {
                    if (prevKey) this.handlePianoKeyRelease(prevKey);
                    this._activeTouches.set(touch.identifier, key);
                    this.handlePianoKeyPress(key);
                }
            }
        }, { passive: false });

        const touchEnd = (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                const key = this._activeTouches.get(touch.identifier);
                if (key) {
                    this.handlePianoKeyRelease(key);
                    this._activeTouches.delete(touch.identifier);
                }
            }
        };
        container.addEventListener('touchend', touchEnd, { passive: false });
        container.addEventListener('touchcancel', touchEnd, { passive: false });
    }

    _getKeyAtPoint(x, y) {
        const els = document.elementsFromPoint(x, y);
        for (const el of els) {
            if (el.classList && el.classList.contains('key') && el.classList.contains('black')) return el;
        }
        for (const el of els) {
            if (el.classList && el.classList.contains('key')) return el;
        }
        return null;
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
        if (this.glRenderer) {
            this.glRenderer.resize(fullWidth, container.clientHeight);
        }
        // Also resize the glCanvas element itself for PixiJS
        if (this.glCanvas) {
            this.glCanvas.width = fullWidth;
            this.glCanvas.height = container.clientHeight;
        }
        this.hitZoneY = this.canvas.height;
        this.keyPositions = this.calculateKeyPositions();
        this._laneCacheDirty = true;
    }
    
    calculateKeyPositions() {
        const positions = {};

        // Build a lookup of all key DOM elements in one pass (no per-note querySelector)
        if (!this._keyElementCache) this._keyElementCache = {};
        const container = document.querySelector('.piano-keys');
        if (container) {
            const allKeys = container.querySelectorAll('.key[data-note]');
            for (let i = 0; i < allKeys.length; i++) {
                this._keyElementCache[allKeys[i].dataset.note] = allKeys[i];
            }
        }

        // Use offsetLeft/offsetWidth — relative to offset parent, unaffected by scroll
        this.allNotes.forEach(note => {
            const keyElement = this._keyElementCache[note];
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

    initTabs() {
        const dropdown = document.getElementById('songBrowserDropdown');
        dropdown.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                dropdown.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                dropdown.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
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
                this.renderMidiFileList(data.files);
            }
        } catch (error) {
            console.log('Could not load MIDI file list');
        }
    }

    renderMidiFileList(files) {
        this.midiFileList.innerHTML = '';
        if (!files.length) {
            this.midiFileList.innerHTML = '<div class="midi-list-empty">No MIDI files. Browse BitMidi to download some!</div>';
            return;
        }
        files.forEach(file => {
            const row = document.createElement('div');
            row.className = 'midi-list-item';
            row.innerHTML = `
                <span class="midi-list-name" title="${this.escapeHtml(file)}">${this.escapeHtml(file)}</span>
                <button class="midi-list-btn midi-list-rename" title="Rename">&#9998;</button>
                <button class="midi-list-btn midi-list-delete" title="Delete">&#128465;</button>
            `;
            row.querySelector('.midi-list-name').addEventListener('click', () => this.loadMidiFile(file));
            row.querySelector('.midi-list-rename').addEventListener('click', (e) => { e.stopPropagation(); this.renameMidiFile(file); });
            row.querySelector('.midi-list-delete').addEventListener('click', (e) => { e.stopPropagation(); this.deleteMidiFile(file); });
            this.midiFileList.appendChild(row);
        });
    }

    refreshMidiFileList() {
        this.loadMidiFileList();
    }

    async renameMidiFile(filename) {
        const newName = prompt('Rename file to:', filename);
        if (!newName || newName === filename) return;

        try {
            const resp = await fetch(`${this.apiBaseUrl}/api/midi-files/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldName: filename, newName })
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);
            this.statusMessage.textContent = `Renamed to "${data.newName}"`;
            this.refreshMidiFileList();
        } catch (err) {
            alert('Rename failed: ' + err.message);
        }
    }

    async deleteMidiFile(filename) {
        if (!confirm(`Delete "${filename}"?`)) return;

        try {
            const resp = await fetch(`${this.apiBaseUrl}/api/midi-files/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error);
            this.statusMessage.textContent = `Deleted "${filename}"`;
            this.refreshMidiFileList();
        } catch (err) {
            alert('Delete failed: ' + err.message);
        }
    }

    async loadMidiFile(filename) {
        if (!filename) return;

        // Close the song browser dropdown and update header song name
        document.getElementById('songBrowserDropdown').classList.add('hidden');
        const songNameEl = document.getElementById('midiListHeaderText');
        songNameEl.textContent = filename;
        songNameEl.title = filename;

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
        // Close browser and update song name
        document.getElementById('songBrowserDropdown').classList.add('hidden');
        const songNameEl = document.getElementById('midiListHeaderText');
        songNameEl.textContent = name;
        songNameEl.title = name;
        this.statusMessage.textContent = `Loading "${name}" from BitMidi…`;
        this.progressBar.classList.add('visible');
        this.updateProgress(20);

        try {
            const resp = await fetch(`${this.apiBaseUrl}/api/bitmidi/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug, name })
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
            const savedName = data.savedAs ? ` (saved as "${data.savedAs}")` : '';
            this.statusMessage.textContent = `Loaded "${name}"${savedName} — ${data.noteCount} notes. Press Play!`;
            this._updateControlButtons();
            this.refreshMidiFileList();
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
        // Reset any active preview button (playing or loading)
        const activeBtn = document.querySelector('.bitmidi-preview-btn.playing, .bitmidi-preview-btn.loading');
        if (activeBtn) {
            activeBtn.innerHTML = '&#9654;';
            activeBtn.classList.remove('playing', 'loading');
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

        // Show loading state
        btn.innerHTML = '';
        btn.classList.add('loading');
        this.previewSlug = slug;
        this.previewBtn = btn;

        try {
            // Fetch notes via the preview endpoint (no download to midi/ folder)
            const resp = await fetch(`${this.apiBaseUrl}/api/bitmidi/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug })
            });

            if (!resp.ok) throw new Error('Failed to fetch');
            const data = await resp.json();

            if (this.previewSlug !== slug) return; // user stopped during fetch

            // Switch from loading to playing state
            btn.classList.remove('loading');
            btn.innerHTML = '&#9632;'; // stop square
            btn.classList.add('playing');

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
        // Settings menu button in header (expands/collapses settings panel)
        document.getElementById('settingsMenuBtn').addEventListener('click', () => {
            document.getElementById('settingsPanelsBody').classList.toggle('collapsed');
        });

        // Instrument selector — loads soundfont when changed
        const presetSelect = document.getElementById('soundPreset');
        presetSelect.addEventListener('change', () => {
            if (!this.useSalamander) {
                this.loadSoundfont(presetSelect.value);
            }
            this._saveSettings();
        });

        // Sound bank selector — switches between soundfont libraries
        const soundBankSelect = document.getElementById('soundBankSelect');
        soundBankSelect.addEventListener('change', () => {
            if (soundBankSelect.value === 'Salamander') {
                this.useSalamander = true;
                presetSelect.disabled = true;
                if (this.currentSampleBank !== 'Salamander') this.loadSalamander();
            } else {
                this.useSalamander = false;
                presetSelect.disabled = false;
                this.soundfontBaseUrl = `https://gleitz.github.io/midi-js-soundfonts/${soundBankSelect.value}/`;
                this.loadSoundfont(presetSelect.value);
            }
            this._saveSettings();
        });

        // Wire up volume and reverb sliders
        const volumeSlider = document.getElementById('volumeSlider');
        volumeSlider.addEventListener('input', () => {
            this.soundParams.volume = volumeSlider.value / 100;
            document.getElementById('volumeVal').textContent = volumeSlider.value + '%';
            if (this.masterGain) {
                this.masterGain.gain.setTargetAtTime(this.soundParams.volume, this.audioContext.currentTime, 0.01);
            }
            this._saveSettings();
        });

        const reverbSlider = document.getElementById('reverbSlider');
        reverbSlider.addEventListener('input', () => {
            this.soundParams.reverb = reverbSlider.value / 100;
            document.getElementById('reverbVal').textContent = reverbSlider.value + '%';
            if (this.dryGain) {
                const now = this.audioContext.currentTime;
                this.dryGain.gain.setTargetAtTime(1 - this.soundParams.reverb * 0.5, now, 0.01);
                this.wetGain.gain.setTargetAtTime(this.soundParams.reverb * 0.5, now, 0.01);
            }
            this._saveSettings();
        });

        // Co-Play auto volume slider
        const coplayVolSlider = document.getElementById('coplayAutoVolume');
        if (coplayVolSlider) {
            coplayVolSlider.addEventListener('input', () => {
                this.coPlayAutoVolume = coplayVolSlider.value / 100;
                document.getElementById('coplayAutoVolumeVal').textContent = coplayVolSlider.value + '%';
                this._saveSettings();
            });
        }

        // Timing feedback toggle
        const timingFeedbackToggle = document.getElementById('timingFeedbackToggle');
        if (timingFeedbackToggle) {
            timingFeedbackToggle.addEventListener('change', () => {
                this.showTimingFeedback = timingFeedbackToggle.checked;
                this._saveSettings();
            });
        }

        // Sustain toggle
        const sustainToggle = document.getElementById('sustainToggle');
        const sympatheticToggle = document.getElementById('sympatheticResonanceToggle');
        const _updateSympatheticState = () => {
            const label = sympatheticToggle?.closest('.mode-toggle');
            if (label) {
                if (sustainToggle.checked) {
                    label.classList.remove('disabled');
                } else {
                    label.classList.add('disabled');
                    if (sympatheticToggle.checked) {
                        sympatheticToggle.checked = false;
                        this.sympatheticResonanceEnabled = false;
                    }
                }
            }
        };
        if (sustainToggle) {
            sustainToggle.addEventListener('change', () => {
                this.sustainEnabled = sustainToggle.checked;
                if (!this.sustainEnabled) {
                    // Release all sustained notes immediately
                    for (const note of this.sustainedNotes) {
                        this.stopNoteSound(note);
                    }
                    this.sustainedNotes.clear();
                }
                _updateSympatheticState();
                this._saveSettings();
            });
        }

        // EQ & Compression toggle
        const eqToggle = document.getElementById('eqCompressionToggle');
        if (eqToggle) {
            eqToggle.addEventListener('change', () => {
                this.eqCompressionEnabled = eqToggle.checked;
                this._updateEqCompression();
                this._saveSettings();
            });
        }

        // Sympathetic Resonance toggle
        if (sympatheticToggle) {
            sympatheticToggle.addEventListener('change', () => {
                this.sympatheticResonanceEnabled = sympatheticToggle.checked;
                this._saveSettings();
            });
        }
        // Set initial disabled state based on sustain
        _updateSympatheticState();

        // Don't load soundfont here — _loadSettings() will restore saved bank/instrument
        // and trigger the load. If no saved settings, we load the default after _loadSettings.
        this._soundInitDeferred = true;
    }

    // Called after _loadSettings to ensure a soundfont is loaded if settings didn't trigger one
    _ensureSoundfontLoaded() {
        if (!this.soundfontLoading && !this.soundfontLoaded && !this.salamanderLoaded &&
            Object.keys(this.soundfontBuffers).length === 0 &&
            Object.keys(this.salamanderBuffers).length === 0) {
            const currentBank = document.getElementById('soundBankSelect').value;
            if (currentBank === 'Salamander') {
                this.useSalamander = true;
                document.getElementById('soundPreset').disabled = true;
                this.loadSalamander();
            } else {
                document.getElementById('soundPreset').disabled = false;
                this.loadSoundfont(this.currentInstrument);
            }
        }
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

        scaleSlider.addEventListener('input', () => { applyScale(scaleSlider.value); this._saveSettings(); });
        scaleInput.addEventListener('change', () => { applyScale(scaleInput.value); this._saveSettings(); });

        // ── Speed Control ──
        const speedSlider = document.getElementById('speedSlider');
        const speedInput = document.getElementById('speedInput');

        const applySpeed = (val) => {
            const pct = Math.max(25, Math.min(150, parseInt(val) || 100));
            const newSpeed = pct / 100;
            const oldSpeed = this.speedMultiplier;

            // Adjust startTime to preserve current song position when speed changes mid-song
            if (this.isPlaying && oldSpeed !== newSpeed) {
                const now = this.isPaused ? this.pauseTime : performance.now();
                const currentTime = (now - this.startTime) / 1000;
                // songPos = currentTime * oldSpeed; newCurrentTime = songPos / newSpeed
                const newCurrentTime = currentTime * oldSpeed / newSpeed;
                if (this.isPaused) {
                    this.startTime = this.pauseTime - newCurrentTime * 1000;
                } else {
                    this.startTime = performance.now() - newCurrentTime * 1000;
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

        speedSlider.addEventListener('input', () => { applySpeed(speedSlider.value); this._saveSettings(); });
        speedInput.addEventListener('change', () => { applySpeed(speedInput.value); this._saveSettings(); });

        // ── Particle Style ──
        const particleStyleSelect = document.getElementById('particleStyleSelect');
        particleStyleSelect.addEventListener('change', () => {
            this.particleStyle = particleStyleSelect.value;
            this._saveSettings();
        });

        // ── Sparkle FX Toggle ──
        const sparkleToggle = document.getElementById('sparkleToggle');
        this.sparkleEnabled = sparkleToggle.checked;
        const sparkleSubRows = ['particleStyleRow', 'sparkleSliderRow', 'sparkleHeightRow'];
        const updateSparkleRows = () => {
            const show = sparkleToggle.checked;
            sparkleSubRows.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = show ? '' : 'none';
            });
        };
        sparkleToggle.addEventListener('change', () => {
            this.sparkleEnabled = sparkleToggle.checked;
            if (!this.sparkleEnabled) this.particles = [];
            updateSparkleRows();
            this._saveSettings();
        });
        updateSparkleRows();

        // ── Sparkle FX ──
        const sparkleSlider = document.getElementById('sparkleSlider');
        const sparkleValue = document.getElementById('sparkleValue');
        this.sparkleIntensity = parseInt(sparkleSlider.value) / 100;
        sparkleSlider.addEventListener('input', () => {
            this.sparkleIntensity = parseInt(sparkleSlider.value) / 100;
            sparkleValue.textContent = sparkleSlider.value + '%';
            this._saveSettings();
        });

        // ── Sparkle Height ──
        const sparkleHeightSlider = document.getElementById('sparkleHeightSlider');
        const sparkleHeightValue = document.getElementById('sparkleHeightValue');
        sparkleHeightSlider.addEventListener('input', () => {
            this.sparkleHeight = parseInt(sparkleHeightSlider.value) / 100;
            sparkleHeightValue.textContent = sparkleHeightSlider.value + '%';
            this._saveSettings();
        });

        // ── Lane Style ──
        const laneStyleSelect = document.getElementById('laneStyleSelect');
        laneStyleSelect.addEventListener('change', () => {
            this.laneStyle = laneStyleSelect.value;
            this._laneCacheDirty = true;
            this._saveSettings();
        });

        // ── Note Style ──
        const noteStyleSelect = document.getElementById('noteStyleSelect');
        noteStyleSelect.addEventListener('change', () => {
            this.noteStyle = noteStyleSelect.value;
            this._saveSettings();
        });

        // ── Wave Ribbon Toggle ──
        const waveToggle = document.getElementById('waveToggle');
        this.waveEnabled = waveToggle.checked;
        const updateWaveRows = () => {
            // Wave count slider is always visible; toggle only controls rendering
        };
        waveToggle.addEventListener('change', () => {
            this.waveEnabled = waveToggle.checked;
            updateWaveRows();
            this._saveSettings();
        });
        updateWaveRows();

        // ── Wave Ribbon Count ──
        const waveCountSlider = document.getElementById('waveCountSlider');
        this.waveCount = parseInt(waveCountSlider.value) || 6;
        waveCountSlider.addEventListener('input', () => {
            this.waveCount = parseInt(waveCountSlider.value) || 1;
            document.getElementById('waveCountVal').textContent = this.waveCount;
            this._saveSettings();
        });

        // ── Neon Glow ──
        const neonGlowToggle = document.getElementById('neonGlowToggle');
        neonGlowToggle.addEventListener('change', () => {
            this.neonGlowEnabled = neonGlowToggle.checked;
            this._saveSettings();
        });

        // ── Force Field Bar ──
        const forceFieldToggle = document.getElementById('forceFieldToggle');
        forceFieldToggle.addEventListener('change', () => {
            this.forceFieldEnabled = forceFieldToggle.checked;
            this._laneCacheDirty = true;
            this._saveSettings();
        });

        // ── Custom Background Image ──
        const bgImageBtn = document.getElementById('bgImageBtn');
        const bgImageClearBtn = document.getElementById('bgImageClearBtn');
        const bgImageInput = document.getElementById('bgImageInput');
        bgImageBtn.addEventListener('click', () => bgImageInput.click());
        bgImageInput.addEventListener('change', () => {
            const file = bgImageInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                this._setBackgroundImage(e.target.result);
                bgImageClearBtn.disabled = false;
            };
            reader.readAsDataURL(file);
            bgImageInput.value = '';
        });
        bgImageClearBtn.addEventListener('click', () => {
            this._clearBackgroundImage();
            bgImageClearBtn.disabled = true;
        });

        // ── Overlay Opacity Slider ──
        const bgOpacitySlider = document.getElementById('bgOpacitySlider');
        const bgOpacityVal = document.getElementById('bgOpacityVal');
        bgOpacitySlider.addEventListener('input', () => {
            const val = parseInt(bgOpacitySlider.value);
            bgOpacityVal.textContent = val + '%';
            this.bgOverlayOpacity = val / 100;
            this._applyOverlayOpacity();
            this._laneCacheDirty = true;
            this._saveSettings();
        });

        // Restore saved background
        const savedBg = localStorage.getItem('pianoHeroBgImage');
        if (savedBg) {
            this._setBackgroundImage(savedBg);
            bgImageClearBtn.disabled = false;
        }

        // ── Game Mode ──
        const modeSelect = document.getElementById('gameModeSelect');
        const coplayHint = document.getElementById('coplayHint');
        if (modeSelect) modeSelect.addEventListener('change', () => {
            this.gameMode = modeSelect.value;
            this._saveSettings();
            this._updateModeLabel();

            // Show/hide co-play hint and volume control
            if (coplayHint) coplayHint.style.display = this.gameMode === 'coplay' ? '' : 'none';
            const coplayVolRow = document.getElementById('coplayVolumeRow');
            if (coplayVolRow) coplayVolRow.style.display = this.gameMode === 'coplay' ? '' : 'none';

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

    _saveSettings() {
        if (this._loading) return;
        const settings = {
            volume: document.getElementById('volumeSlider').value,
            reverb: document.getElementById('reverbSlider').value,
            instrument: document.getElementById('soundPreset').value,
            soundBank: document.getElementById('soundBankSelect').value,
            sustain: document.getElementById('sustainToggle').checked,
            keyScale: document.getElementById('keyScaleSlider').value,
            speed: document.getElementById('speedSlider').value,
            gameMode: this.gameMode || 'normal',
            timingFeedback: document.getElementById('timingFeedbackToggle').checked,
            sparkleEnabled: document.getElementById('sparkleToggle').checked,
            particleStyle: document.getElementById('particleStyleSelect').value,
            sparkle: document.getElementById('sparkleSlider').value,
            sparkleHeight: document.getElementById('sparkleHeightSlider').value,
            laneStyle: document.getElementById('laneStyleSelect').value,
            coplayAutoVolume: document.getElementById('coplayAutoVolume').value,
            autoPlay: document.getElementById('modeToggleSwitch').checked,
            eqCompression: document.getElementById('eqCompressionToggle').checked,
            sympatheticResonance: document.getElementById('sympatheticResonanceToggle').checked,
            noteStyle: document.getElementById('noteStyleSelect').value,
            waveEnabled: document.getElementById('waveToggle').checked,
            waveCount: document.getElementById('waveCountSlider').value,
            neonGlow: document.getElementById('neonGlowToggle').checked,
            forceField: document.getElementById('forceFieldToggle').checked,
            bgOverlayOpacity: document.getElementById('bgOpacitySlider').value,
        };
        try { localStorage.setItem('pianoHeroSettings', JSON.stringify(settings)); } catch(e) {}
    }

    _setBackgroundImage(dataUrl) {
        document.body.style.backgroundImage = `url(${dataUrl})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        this.hasBgImage = true;
        this._applyOverlayOpacity();
        this._laneCacheDirty = true;
        try { localStorage.setItem('pianoHeroBgImage', dataUrl); } catch(e) {}
    }

    _clearBackgroundImage() {
        document.body.style.backgroundImage = '';
        document.body.style.backgroundSize = '';
        document.body.style.backgroundPosition = '';
        this.hasBgImage = false;
        this._applyOverlayOpacity();
        this._laneCacheDirty = true;
        try { localStorage.removeItem('pianoHeroBgImage'); } catch(e) {}
    }

    _applyOverlayOpacity() {
        const o = this.bgOverlayOpacity;
        document.getElementById('gameArea').style.background = `rgba(14, 11, 34, ${o})`;
        document.getElementById('gameCanvas').style.background = `rgba(14, 11, 34, ${o * 0.4})`;
    }

    _loadSettings() {
        let settings;
        try { settings = JSON.parse(localStorage.getItem('pianoHeroSettings')); } catch(e) {}
        if (!settings) return;
        this._loading = true;

        // Restore autoPlay FIRST — before any dispatchEvent triggers _saveSettings()
        if (settings.autoPlay != null) {
            const cb = document.getElementById('modeToggleSwitch');
            cb.checked = settings.autoPlay;
            this.isAutoPlay = settings.autoPlay;
        }

        // Sound
        if (settings.volume != null) {
            const s = document.getElementById('volumeSlider');
            s.value = settings.volume;
            s.dispatchEvent(new Event('input'));
        }
        if (settings.reverb != null) {
            const s = document.getElementById('reverbSlider');
            s.value = settings.reverb;
            s.dispatchEvent(new Event('input'));
        }
        if (settings.soundBank) {
            const sel = document.getElementById('soundBankSelect');
            sel.value = settings.soundBank;
            // If saved bank no longer exists in dropdown, fall back to Salamander
            if (!sel.value || sel.selectedIndex < 0) {
                settings.soundBank = 'Salamander';
                sel.value = 'Salamander';
            }
            if (settings.soundBank === 'Salamander') {
                this.useSalamander = true;
                if (this.currentSampleBank !== 'Salamander') this.loadSalamander();
            } else {
                this.useSalamander = false;
                this.soundfontBaseUrl = `https://gleitz.github.io/midi-js-soundfonts/${settings.soundBank}/`;
                this.loadSoundfont(settings.instrument || this.currentInstrument);
            }
        }
        if (settings.instrument) {
            const sel = document.getElementById('soundPreset');
            sel.value = settings.instrument;
            sel.dispatchEvent(new Event('change'));
        }
        if (settings.sustain != null) {
            const cb = document.getElementById('sustainToggle');
            cb.checked = settings.sustain;
            cb.dispatchEvent(new Event('change'));
        }

        // Game
        if (settings.keyScale != null) {
            const s = document.getElementById('keyScaleSlider');
            s.value = settings.keyScale;
            s.dispatchEvent(new Event('input'));
        }
        if (settings.speed != null) {
            const s = document.getElementById('speedSlider');
            s.value = settings.speed;
            s.dispatchEvent(new Event('input'));
        }
        if (settings.gameMode) {
            this.gameMode = settings.gameMode;
            const sel = document.getElementById('gameModeSelect');
            if (sel) {
                sel.value = settings.gameMode;
                sel.dispatchEvent(new Event('change'));
            }
        }
        if (settings.timingFeedback != null) {
            const cb = document.getElementById('timingFeedbackToggle');
            cb.checked = settings.timingFeedback;
            cb.dispatchEvent(new Event('change'));
        }
        if (settings.sparkleEnabled != null) {
            const cb = document.getElementById('sparkleToggle');
            cb.checked = settings.sparkleEnabled;
            cb.dispatchEvent(new Event('change'));
        }
        if (settings.sparkle != null) {
            const s = document.getElementById('sparkleSlider');
            s.value = settings.sparkle;
            s.dispatchEvent(new Event('input'));
        }
        if (settings.sparkleHeight != null) {
            const s = document.getElementById('sparkleHeightSlider');
            s.value = settings.sparkleHeight;
            s.dispatchEvent(new Event('input'));
        }
        if (settings.particleStyle) {
            const sel = document.getElementById('particleStyleSelect');
            sel.value = settings.particleStyle;
            sel.dispatchEvent(new Event('change'));
        }
        if (settings.laneStyle) {
            const sel = document.getElementById('laneStyleSelect');
            sel.value = settings.laneStyle;
            sel.dispatchEvent(new Event('change'));
        }
        if (settings.coplayAutoVolume != null) {
            const s = document.getElementById('coplayAutoVolume');
            s.value = settings.coplayAutoVolume;
            s.dispatchEvent(new Event('input'));
        }
        if (settings.eqCompression != null) {
            const cb = document.getElementById('eqCompressionToggle');
            cb.checked = settings.eqCompression;
            this.eqCompressionEnabled = settings.eqCompression;
            this._updateEqCompression();
        }
        if (settings.sympatheticResonance != null) {
            const cb = document.getElementById('sympatheticResonanceToggle');
            cb.checked = settings.sympatheticResonance;
            this.sympatheticResonanceEnabled = settings.sympatheticResonance;
        }
        if (settings.noteStyle) {
            const sel = document.getElementById('noteStyleSelect');
            sel.value = settings.noteStyle;
            this.noteStyle = settings.noteStyle;
        }
        if (settings.waveEnabled != null) {
            const cb = document.getElementById('waveToggle');
            cb.checked = settings.waveEnabled;
            cb.dispatchEvent(new Event('change'));
        }
        if (settings.waveCount != null) {
            const val = Math.max(1, parseInt(settings.waveCount) || 6);
            const s = document.getElementById('waveCountSlider');
            s.value = val;
            document.getElementById('waveCountVal').textContent = val;
            this.waveCount = val;
        }
        if (settings.neonGlow != null) {
            const cb = document.getElementById('neonGlowToggle');
            cb.checked = settings.neonGlow;
            this.neonGlowEnabled = settings.neonGlow;
        }
        if (settings.forceField != null) {
            const cb = document.getElementById('forceFieldToggle');
            cb.checked = settings.forceField;
            this.forceFieldEnabled = settings.forceField;
            this._laneCacheDirty = true;
        }
        if (settings.bgOverlayOpacity != null) {
            const s = document.getElementById('bgOpacitySlider');
            s.value = settings.bgOverlayOpacity;
            document.getElementById('bgOpacityVal').textContent = settings.bgOverlayOpacity + '%';
            this.bgOverlayOpacity = parseInt(settings.bgOverlayOpacity) / 100;
            this._applyOverlayOpacity();
            this._laneCacheDirty = true;
        }

        // Update header mode label to reflect restored settings
        this._updateModeLabel();
        this._loading = false;
        this._saveSettings(); // save once with fully restored state
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

    // --- Salamander Grand Piano loader ---
    _noteNameToMidi(name) {
        const noteMap = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
        let i = 0;
        let base = noteMap[name[i]];
        i++;
        if (name[i] === 's' || name[i] === '#') { base++; i++; }
        else if (name[i] === 'b') { base--; i++; }
        const octave = parseInt(name.slice(i));
        return (octave + 1) * 12 + base;
    }

    _midiToNoteName(midi) {
        const names = ['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'];
        const octave = Math.floor(midi / 12) - 1;
        const note = names[midi % 12];
        return note + octave;
    }

    _gameNoteToMidi(note) {
        // Convert game note like "C#4" or "Db4" to MIDI number
        const noteMap = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
        let i = 0;
        let base = noteMap[note[i]];
        i++;
        if (note[i] === '#') { base++; i++; }
        else if (note[i] === 'b') { base--; i++; }
        const octave = parseInt(note.slice(i));
        return (octave + 1) * 12 + base;
    }

    _findNearestSalamanderSample(midiNumber) {
        // Use pre-sorted cache to avoid re-parsing keys on every note
        if (!this._sortedSampleMidis || this._sortedSampleMidis.length !== Object.keys(this.salamanderBuffers).length) {
            this._sortedSampleMidis = Object.keys(this.salamanderBuffers).map(Number).sort((a, b) => a - b);
        }
        const loaded = this._sortedSampleMidis;
        if (loaded.length === 0) return null;
        let nearest = loaded[0];
        let minDist = Math.abs(midiNumber - nearest);
        for (const m of loaded) {
            const dist = Math.abs(midiNumber - m);
            if (dist < minDist) { minDist = dist; nearest = m; }
        }
        return { midi: nearest, semitoneOffset: midiNumber - nearest };
    }

    // --- IndexedDB sample cache ---
    _trimAudioBuffer(audioBuffer, maxSeconds) {
        const maxFrames = Math.min(audioBuffer.length, Math.ceil(maxSeconds * audioBuffer.sampleRate));
        // Downmix to mono to halve memory and improve playback performance
        const trimmed = this.audioContext.createBuffer(1, maxFrames, audioBuffer.sampleRate);
        if (audioBuffer.numberOfChannels >= 2) {
            const L = audioBuffer.getChannelData(0);
            const R = audioBuffer.getChannelData(1);
            const mono = trimmed.getChannelData(0);
            for (let i = 0; i < maxFrames; i++) {
                mono[i] = (L[i] + R[i]) * 0.5;
            }
        } else {
            trimmed.copyToChannel(audioBuffer.getChannelData(0).slice(0, maxFrames), 0);
        }
        return trimmed;
    }

    async _openSampleCache() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('PianoHeroSamples', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('samples')) {
                    db.createObjectStore('samples');
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async _getCachedSample(db, key) {
        return new Promise((resolve) => {
            const tx = db.transaction('samples', 'readonly');
            const store = tx.objectStore('samples');
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    async _putCachedSample(db, key, arrayBuffer) {
        return new Promise((resolve) => {
            const tx = db.transaction('samples', 'readwrite');
            const store = tx.objectStore('samples');
            store.put(arrayBuffer, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    async loadSalamander() {
        if (this.soundfontLoading) return;
        this.soundfontLoading = true;
        this.salamanderLoaded = false;

        const statusEl = document.getElementById('soundfontStatus');
        statusEl.textContent = 'Loading Salamander...';
        statusEl.className = 'soundfont-status loading';

        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.setupAudioGraph();
            }

            const db = await this._openSampleCache();
            const buffers = {};
            const total = this.salamanderNotes.length;
            let loaded = 0;

            const batchSize = 6;
            for (let i = 0; i < total; i += batchSize) {
                const batch = this.salamanderNotes.slice(i, i + batchSize);
                await Promise.all(batch.map(async (noteName) => {
                    const cacheKey = `salamander_${noteName}`;
                    try {
                        let arrayBuffer = await this._getCachedSample(db, cacheKey);
                        if (!arrayBuffer) {
                            const url = `${this.salamanderBaseUrl}${noteName}.mp3`;
                            const response = await fetch(url);
                            if (!response.ok) return;
                            arrayBuffer = await response.arrayBuffer();
                            await this._putCachedSample(db, cacheKey, arrayBuffer.slice(0));
                        }
                        let audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                        audioBuffer = this._trimAudioBuffer(audioBuffer, 8);
                        const midiNum = this._noteNameToMidi(noteName);
                        buffers[midiNum] = audioBuffer;
                    } catch (e) {
                        console.warn(`Failed to load Salamander sample: ${noteName}`, e);
                    }
                    loaded++;
                    statusEl.textContent = `Loading ${loaded}/${total}...`;
                }));
            }
            db.close();

            this.salamanderBuffers = buffers;
            this._sortedSampleMidis = null; // invalidate cache
            this.salamanderLoaded = true;
            this.currentSampleBank = 'Salamander';
            const count = Object.keys(buffers).length;
            statusEl.textContent = `✓ Salamander (${count} samples)`;
            statusEl.className = 'soundfont-status loaded';
            console.log(`Salamander Grand Piano loaded: ${count} samples`);
        } catch (error) {
            console.error('Failed to load Salamander:', error);
            statusEl.textContent = '✗ Failed';
            statusEl.className = 'soundfont-status error';
        } finally {
            this.soundfontLoading = false;
        }
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
            this.startTime = performance.now() + leadInSec * 1000;

            this.fallingNotes = this.notes.map(note => ({
                ...note,
                y: -50,
                hit: false,
                missed: false
            }));
        } else {
            // Shift startTime so the game clock picks up from the pre-seeked position
            const refTime = this.pauseTime || performance.now();
            const gameClockSec = (refTime - this.startTime) / 1000;
            this.startTime = performance.now() - gameClockSec * 1000;
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
            const pauseDuration = performance.now() - this.pauseTime;
            this.startTime += pauseDuration;
        }

        // Mark as manual (toggle shows "Manual")
        this.isAutoPlay = false;

        // Co-Play: keep auto-playing non-manual lanes in the background
        if (this.gameMode === 'coplay' && this.coPlayManualNotes.size > 0) {
            this._scheduleAutoPlayNotes();
        }

        this._updateControlButtons();
        const modeLabel = this.gameMode === 'practice' ? 'Practice mode' :
                          this.gameMode === 'coplay' ? 'Co-Play' :
                          this.gameMode === 'simple' ? 'Simple mode' : 'Manual play';
        this.statusMessage.textContent = `${modeLabel} — continuing from current position!`;
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

        // Remove previous delegated listeners
        if (this._laneSelectorCleanup) {
            this._laneSelectorCleanup();
            this._laneSelectorCleanup = null;
        }

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
            // Stagger rows: black key selectors on top row, white on bottom row to avoid overlap
            btn.style.top = pos.isBlack ? '0px' : '20px';
            btn.style.zIndex = pos.isBlack ? '10' : '5';

            container.appendChild(btn);
        }

        // Delegated event handler for all lane selectors (2 listeners total instead of 2×N)
        const handleLaneEvent = (e) => {
            const btn = e.target.closest('.lane-selector');
            if (!btn || !btn.dataset.note) return;
            e.stopPropagation();
            if (e.type === 'touchstart') e.preventDefault();
            this._handleLaneSelectorClick(btn.dataset.note, btn);
        };
        container.addEventListener('click', handleLaneEvent);
        container.addEventListener('touchstart', handleLaneEvent, { passive: false });
        this._laneSelectorCleanup = () => {
            container.removeEventListener('click', handleLaneEvent);
            container.removeEventListener('touchstart', handleLaneEvent);
        };
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
        const keyEl = this._keyElementCache && this._keyElementCache[note]
            || document.querySelector(`.key[data-note="${note}"]`);
        if (!keyEl) return;
        const newBind = this.noteToKey[note];
        const noteName = note.replace(/\d+/, '');
        if (newBind) {
            keyEl.dataset.key = newBind;
            keyEl.innerHTML = `<span class="key-label"><span class="keycap">${newBind}</span><span class="note-name">${noteName}</span></span>`;
        } else {
            delete keyEl.dataset.key;
            keyEl.innerHTML = `<span class="key-label"><span class="note-name">${noteName}</span></span>`;
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
            closestNote.holdStart = (performance.now() - this.startTime) / 1000;
            this.combo++;
            this.hitNotes++;
            const accuracy = 1 - (closestDistance / this.hitTolerance);
            const points = Math.floor(100 * accuracy * (1 + this.combo * 0.1));
            this.score += points;
            this.updateScore();
            this.showHitFeedback(note, true, accuracy);
            this.heldFallingNotes.set(note, closestNote);
            this._emitHitBurst(note, closestNote.hand || 0);
        } else {
            // Wrong key — show red miss feedback
            this.combo = 0;
            this.updateScore();
            this.showHitFeedback(note, false, 0);
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
                const pauseDuration = performance.now() - this.pauseTime;
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
            this._saveSettings();
            return;
        }
        if (this.modeToggleSwitch.checked) {
            this.startAutoPlay();
        } else {
            this._switchToManual();
        }
        this._updateControlButtons();
        this._saveSettings();
    }

    /** Play/Pause toggle — starts game if not yet started */
    togglePlayPause() {
        if (!this.isPlaying && !this.isPaused) {
            // Sync flag from checkbox in case it drifted
            this.isAutoPlay = this.modeToggleSwitch.checked;
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
            this.pauseTime = performance.now();
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
            const pauseDuration = performance.now() - this.pauseTime;
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

        // Play / Pause (compact header buttons)
        this.playPauseBtn.disabled = !hasNotes;
        if (playing) {
            this.playPauseBtn.innerHTML = '&#10074;&#10074;';
            this.playPauseBtn.classList.add('playing');
        } else {
            this.playPauseBtn.innerHTML = '&#9654;';
            this.playPauseBtn.classList.remove('playing');
        }

        // Stop
        this.stopBtn.disabled = !this.isPlaying && !this.isPaused;

        // Update mode label
        this._updateModeLabel();
    }

    /** Update mode dropdown button label */
    _updateModeLabel() {
        const modeLabel = document.getElementById('modeLabel');
        const modeSubLabel = document.getElementById('modeSubLabel');
        if (!modeLabel || !modeSubLabel) return;

        modeLabel.textContent = this.isAutoPlay ? 'AutoPlay' : 'Manual';

        const modeNames = { normal: 'Normal', simple: 'Simple', coplay: 'Co-play', practice: 'Practice' };
        modeSubLabel.textContent = modeNames[this.gameMode] || 'Normal';

        // Update active state in dropdown
        document.querySelectorAll('.mode-option').forEach(opt => {
            const isAuto = opt.dataset.auto === 'true';
            const mode = opt.dataset.mode;
            opt.classList.toggle('active', isAuto === this.isAutoPlay && mode === this.gameMode);
        });
    }

    _scheduleAutoPlayNotes() {
        // Use real game clock (negative during lead-in) so sounds sync with visual notes
        const currentTime = (performance.now() - this.startTime) / 1000;

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
                    note.holdStart = (performance.now() - this.startTime) / 1000;
                    this.combo++;
                    this.hitNotes++;
                    this.score += Math.floor(100 * (1 + this.combo * 0.1));
                    this.updateScore();
                    this.showHitFeedback(note.note, true, 1);
                    this.heldFallingNotes.set(note.note, note);
                    this._emitHitBurst(note.note, note.hand || 0);
                }

                // Play sound + visual (hold for note duration)
                if (!this._keyElementCache) this._keyElementCache = {};
                let keyElement = this._keyElementCache[note.note];
                if (keyElement === undefined) {
                    keyElement = document.querySelector(`.key[data-note="${note.note}"]`);
                    this._keyElementCache[note.note] = keyElement || null;
                }
                if (keyElement) keyElement.classList.add('active');
                // In co-play mode, reduce volume for auto-played (non-manual) notes
                const autoVol = isCoPlay ? this.coPlayAutoVolume : undefined;
                this.playNoteSound(note.note, note.duration, autoVol);

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
        this.isAutoPlay = this.modeToggleSwitch.checked;
        this.autoPlayTimeouts.forEach(t => clearTimeout(t));
        this.autoPlayTimeouts = [];
        this.fallingNotes = [];
        this.heldFallingNotes.clear();
        this.heldKeys.clear();
        this.particles = [];
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

        const key = this._resolveKey(e);
        if (this.keyToNote[key]) {
            e.preventDefault();
            this.pressKey(key);
        }
    }
    
    handleKeyUp(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        const key = this._resolveKey(e);
        if (this.keyToNote[key]) {
            e.preventDefault();
            this.releaseKey(key);
        }
    }

    _resolveKey(e) {
        // Check code-based mapping first (for locale-specific keys)
        if (this.codeToKey[e.code]) return this.codeToKey[e.code];
        return e.key === ' ' ? 'Space' : e.key.toUpperCase();
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
                // Always update visual held state on release
                this.heldFallingNotes.delete(note);
                if (this.sustainEnabled) {
                    this.sustainedNotes.add(note);
                } else {
                    this.stopNoteSound(note);
                }
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
    
    playNoteSound(note, duration, volumeOverride, velocity) {
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

        // Default velocity: 1.0 for manual, 0.8 for auto-play
        if (velocity == null) velocity = (duration != null) ? 0.8 : 1.0;

        // Stop any existing source for the same note to prevent polyphony buildup
        const existing = this.activeNoteSources.get(note);
        if (existing) {
            try {
                existing.noteGain.gain.cancelScheduledValues(this.audioContext.currentTime);
                existing.noteGain.gain.setValueAtTime(0, this.audioContext.currentTime);
                existing.source.stop(this.audioContext.currentTime + 0.02);
            } catch (e) { /* already stopped */ }
            this.activeNoteSources.delete(note);
        }

        // Determine buffer and playback rate
        let buffer, playbackRate = 1;
        if (this.useSalamander && (this.salamanderLoaded || Object.keys(this.salamanderBuffers).length > 0)) {
            const midiNum = this._gameNoteToMidi(note);
            const nearest = this._findNearestSalamanderSample(midiNum);
            if (!nearest) return;
            buffer = this.salamanderBuffers[nearest.midi];
            playbackRate = Math.pow(2, nearest.semitoneOffset / 12);
        } else {
            const sfName = this.gameNoteToSoundfontName(note);
            buffer = this.soundfontBuffers[sfName] || this.soundfontBuffers[note];
        }
        if (!buffer) return;

        const p = this.soundParams;
        const now = this.audioContext.currentTime;

        // Enforce polyphony limit — stop oldest notes if too many are active
        const MAX_POLYPHONY = 32;
        if (this.activeNoteSources.size >= MAX_POLYPHONY) {
            // Find and stop the oldest entries
            const iter = this.activeNoteSources.entries();
            const toRemove = this.activeNoteSources.size - MAX_POLYPHONY + 1;
            for (let i = 0; i < toRemove; i++) {
                const [key, val] = iter.next().value;
                try {
                    val.noteGain.gain.cancelScheduledValues(now);
                    val.noteGain.gain.setValueAtTime(0, now);
                    val.source.stop(now + 0.01);
                } catch (e) {}
                this.activeNoteSources.delete(key);
            }
        }

        // Create a source from the sample buffer
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        if (playbackRate !== 1) source.playbackRate.value = playbackRate;

        // Velocity-sensitive tone shaping: softer = darker, louder = brighter
        const velFilter = this.audioContext.createBiquadFilter();
        velFilter.type = 'lowpass';
        velFilter.frequency.value = 800 + velocity * 12000;  // 800-12800 Hz
        velFilter.Q.value = 0.7;

        // Apply volume with velocity scaling
        const baseLevel = 3.0 * (volumeOverride != null ? volumeOverride : 1) * (0.3 + 0.7 * velocity);
        const noteGain = this.audioContext.createGain();
        noteGain.gain.setValueAtTime(baseLevel, now);
        source.connect(velFilter);
        velFilter.connect(noteGain);
        noteGain.connect(this.dryGain);
        if (p.reverb > 0.01) noteGain.connect(this.wetGain);

        source.start(now);

        // If explicit duration (auto-play), schedule fixed fade
        // Otherwise (user-played), sustain until stopNoteSound is called
        if (duration != null) {
            const speed = this.speedMultiplier;
            const holdTime = Math.max(0.08, Math.min(4, duration / speed));
            const fadeTime = Math.min(0.3, holdTime * 0.3);
            const fadeStart = now + holdTime;
            const fadeEnd   = fadeStart + fadeTime;
            // Loop so short samples sustain for the full note duration
            source.loop = true;
            noteGain.gain.setValueAtTime(baseLevel, fadeStart);
            noteGain.gain.linearRampToValueAtTime(0, fadeEnd);
            source.stop(fadeEnd);
        } else if (this.sustainEnabled) {
            // Sustain mode: natural piano decay — long ring-out
            source.loop = true;
            const decayTime = 5;
            noteGain.gain.setValueAtTime(baseLevel, now);
            noteGain.gain.exponentialRampToValueAtTime(0.001, now + decayTime);
            source.stop(now + decayTime + 0.1);
        } else {
            // No sustain: loop sample and hold until key release (stopNoteSound)
            // Apply gentle piano-like decay so it doesn't sound static
            source.loop = true;
            const decayTime = 8;
            noteGain.gain.setValueAtTime(baseLevel, now);
            noteGain.gain.exponentialRampToValueAtTime(baseLevel * 0.15, now + decayTime);
            noteGain.gain.linearRampToValueAtTime(0, now + decayTime + 0.5);
            source.stop(now + decayTime + 0.5);
        }

        // Track for later stop-on-release
        this.activeNoteSources.set(note, { source, noteGain, velFilter });

        // Disconnect nodes after playback to prevent memory leaks
        source.onended = () => {
            source.disconnect();
            velFilter.disconnect();
            noteGain.disconnect();
            // Clean up tracking if this source is still the active one
            const active = this.activeNoteSources.get(note);
            if (active && active.source === source) {
                this.activeNoteSources.delete(note);
            }
        };

        // Sympathetic resonance — excite harmonically related strings
        if (this.sustainEnabled && !this._sympatheticPlaying) {
            this._triggerSympatheticResonance(note);
        }
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
        this.masterGain.gain.value = this.soundParams.volume;

        // Compressor (always in chain; neutral when disabled)
        this.compressorNode = this.audioContext.createDynamicsCompressor();

        // EQ: low-shelf for warmth, high-shelf for presence
        this.eqLowShelf = this.audioContext.createBiquadFilter();
        this.eqLowShelf.type = 'lowshelf';
        this.eqLowShelf.frequency.value = 250;

        this.eqHighShelf = this.audioContext.createBiquadFilter();
        this.eqHighShelf.type = 'highshelf';
        this.eqHighShelf.frequency.value = 3000;

        // Apply current EQ/compression state (neutral or active)
        this._updateEqCompression();

        // Chain: masterGain → compressor → eqLow → eqHigh → destination
        this.masterGain.connect(this.compressorNode);
        this.compressorNode.connect(this.eqLowShelf);
        this.eqLowShelf.connect(this.eqHighShelf);
        this.eqHighShelf.connect(this.audioContext.destination);

        // Dry path: source → dryGain → masterGain
        this.dryGain = this.audioContext.createGain();
        this.dryGain.gain.value = 1 - this.soundParams.reverb * 0.5;
        this.dryGain.connect(this.masterGain);

        // Wet/reverb path — convolution reverb for realistic room sound
        this.wetGain = this.audioContext.createGain();
        this.wetGain.gain.value = this.soundParams.reverb * 0.5;

        this.convolverNode = this.audioContext.createConvolver();
        this.convolverNode.buffer = this._generateImpulseResponse(2.5, 2.5);

        // Reverb output bus (slightly reduced to blend naturally)
        const reverbBus = this.audioContext.createGain();
        reverbBus.gain.value = 0.45;
        reverbBus.connect(this.masterGain);

        this.wetGain.connect(this.convolverNode);
        this.convolverNode.connect(reverbBus);
    }

    _generateImpulseResponse(duration, decay) {
        const sampleRate = this.audioContext.sampleRate;
        const length = Math.ceil(sampleRate * duration);
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = impulse.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                const t = i / sampleRate;
                // Exponential decay; boost early reflections for realism
                const envelope = Math.exp(-t * decay);
                const earlyBoost = t < 0.08 ? 1.5 : 1;
                data[i] = (Math.random() * 2 - 1) * envelope * earlyBoost;
            }
        }
        return impulse;
    }

    _updateEqCompression() {
        if (!this.compressorNode) return;
        const now = this.audioContext.currentTime;
        if (this.eqCompressionEnabled) {
            // Musical compression: tame peaks, glue the sound
            this.compressorNode.threshold.setValueAtTime(-18, now);
            this.compressorNode.ratio.setValueAtTime(3, now);
            this.compressorNode.knee.setValueAtTime(10, now);
            this.compressorNode.attack.setValueAtTime(0.003, now);
            this.compressorNode.release.setValueAtTime(0.25, now);
            // Warm low-shelf boost
            this.eqLowShelf.gain.setValueAtTime(3, now);
            // Subtle high-shelf presence
            this.eqHighShelf.gain.setValueAtTime(1.5, now);
        } else {
            // Neutral / pass-through
            this.compressorNode.threshold.setValueAtTime(0, now);
            this.compressorNode.ratio.setValueAtTime(1, now);
            this.compressorNode.knee.setValueAtTime(0, now);
            this.compressorNode.attack.setValueAtTime(0.003, now);
            this.compressorNode.release.setValueAtTime(0.25, now);
            this.eqLowShelf.gain.setValueAtTime(0, now);
            this.eqHighShelf.gain.setValueAtTime(0, now);
        }
    }

    _triggerSympatheticResonance(note) {
        if (!this.sympatheticResonanceEnabled || this._sympatheticPlaying) return;
        if (!this.useSalamander || !this.salamanderLoaded) return;

        this._sympatheticPlaying = true;
        const baseMidi = this._gameNoteToMidi(note);
        // Harmonically related intervals: octave, fifth, major third
        const intervals = [12, -12, 7, -7, 4, -4];
        for (const offset of intervals) {
            const sympatheticMidi = baseMidi + offset;
            if (sympatheticMidi < 21 || sympatheticMidi > 108) continue;
            const sympatheticNote = this._midiToGameNote(sympatheticMidi);
            if (sympatheticNote) {
                // Very quiet ghost note (3% volume, short)
                this.playNoteSound(sympatheticNote, 1.5, 0.03, 0.3);
            }
        }
        this._sympatheticPlaying = false;
    }

    _midiToGameNote(midi) {
        const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const octave = Math.floor(midi / 12) - 1;
        const note = names[midi % 12];
        return note + octave;
    }

    releaseKey(key) {
        this.heldKeys.delete(key);
        const keyElement = document.querySelector(`.key[data-key="${key}"]`);
        if (keyElement) {
            keyElement.classList.remove('active');
        }
        const note = this.keyToNote[key];
        if (note) {
            // Always update visual held state on release
            this.heldFallingNotes.delete(note);
            if (this.sustainEnabled) {
                this.sustainedNotes.add(note);
            } else {
                this.stopNoteSound(note);
            }
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
            closestNote.holdStart = (performance.now() - this.startTime) / 1000;
            this.combo++;
            this.hitNotes++;
            
            const accuracy = 1 - (closestDistance / this.hitTolerance);
            const points = Math.floor(100 * accuracy * (1 + this.combo * 0.1));
            this.score += points;
            
            this.updateScore();
            this.showHitFeedback(note, true, accuracy);
            this.heldFallingNotes.set(note, closestNote);
            this._emitHitBurst(note, closestNote.hand || 0);
        } else {
            // Wrong key — show red miss feedback
            this.combo = 0;
            this.updateScore();
            this.showHitFeedback(note, false, 0);
        }
    }
    
    showHitFeedback(note, success, accuracy) {
        // Skip all DOM feedback during autoplay — no one is watching the keys
        if (this.isAutoPlay) return;

        // Cache key element lookups to avoid querySelector per hit
        if (!this._keyElementCache) this._keyElementCache = {};
        let keyElement = this._keyElementCache[note];
        if (keyElement === undefined) {
            keyElement = document.querySelector(`.key[data-note="${note}"]`);
            this._keyElementCache[note] = keyElement || null;
        }
        if (keyElement) {
            const isCoPlayManual = this.gameMode === 'coplay' && this.coPlayManualNotes.has(note);
            const hitClass = (success && isCoPlayManual) ? 'coplay-hit-success' : (success ? 'hit-success' : 'hit-miss');
            keyElement.classList.add(hitClass);
            setTimeout(() => {
                keyElement.classList.remove('hit-success', 'hit-miss', 'coplay-hit-success');
            }, 350);
        }

        // Show timing feedback text (skip in autoplay already handled above)
        if (this.showTimingFeedback) {
            this._showTimingText(note, success, accuracy);
        }
    }

    _getTimingGrade(success, accuracy) {
        if (!success) return { text: 'Miss', cls: 'timing-miss' };
        if (accuracy >= 0.95) return { text: 'Perfect', cls: 'timing-perfect' };
        if (accuracy >= 0.80) return { text: 'Great', cls: 'timing-great' };
        if (accuracy >= 0.60) return { text: 'Good', cls: 'timing-good' };
        return { text: 'OK', cls: 'timing-ok' };
    }

    _showTimingText(note, success, accuracy) {
        const pos = this.keyPositions[note];
        if (!pos) return;

        // Limit concurrent timing elements to avoid DOM thrashing (counter instead of querySelectorAll)
        if (!this._activeTimingCount) this._activeTimingCount = 0;
        if (this._activeTimingCount > 8) return;

        const grade = this._getTimingGrade(success, accuracy);
        const gameArea = this.gameArea || document.getElementById('gameArea');
        if (!gameArea) return;

        const el = this._timingFeedbackPool.pop() || document.createElement('div');
        el.className = 'timing-feedback ' + grade.cls;
        el.textContent = grade.text;

        // Position above the hit zone, centered on the key
        el.style.left = (pos.left + pos.width / 2) + 'px';

        el.style.bottom = (120 + 60) + 'px'; // piano height + offset above keys

        this._activeTimingCount++;
        el.onanimationend = () => {
            if (el.parentNode) el.parentNode.removeChild(el);
            this._activeTimingCount = Math.max(0, (this._activeTimingCount || 1) - 1);
            this._timingFeedbackPool.push(el);
        };
        gameArea.appendChild(el);
    }
    
    updateScore() {
        // Only write to DOM when values actually change
        const score = String(this.score);
        const combo = String(this.combo);
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        const streak = String(this.maxCombo);
        const processedNotes = this.hitNotes + this.missedNotes;
        const accuracy = String(processedNotes > 0 ? Math.floor((this.hitNotes / processedNotes) * 100) : 0);
        if (this.scoreElement.textContent !== score) this.scoreElement.textContent = score;
        if (this.comboElement.textContent !== combo) this.comboElement.textContent = combo;
        if (this.streakElement.textContent !== streak) this.streakElement.textContent = streak;
        if (this.accuracyElement.textContent !== accuracy) this.accuracyElement.textContent = accuracy;
    }

    _formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    updateSongTimeline(currentTimeSec) {
        if (!this.songDuration || this.songDuration <= 0) return;
        // Throttle DOM updates to ~15fps to avoid layout thrashing
        const now = performance.now();
        if (this._lastTimelineUpdate && now - this._lastTimelineUpdate < 66) return;
        this._lastTimelineUpdate = now;
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
            const refTime = this.pauseTime || performance.now();
            this.startTime = refTime - gameClockSec * 1000;
        } else {
            this.startTime = performance.now() - gameClockSec * 1000;
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
        
        const currentTime = (this._frameTime - this.startTime) / 1000;
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
                // Clean up held-note tracking so particles stop
                if (this.heldFallingNotes.get(note.note) === note) {
                    this.heldFallingNotes.delete(note.note);
                }
                // Swap-and-pop: O(1) removal
                const last = this.fallingNotes.length - 1;
                if (i !== last) this.fallingNotes[i] = this.fallingNotes[last];
                this.fallingNotes.pop();
            }
        }
        
        // Check if game is over
        if (this.fallingNotes.length === 0 && this.isPlaying) {
            this.isPlaying = false;
            this.isAutoPlay = this.modeToggleSwitch.checked;
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
            if (this._practiceHighlighted) {
                for (const noteName of this._practiceHighlighted) {
                    const el = this._keyElementCache && this._keyElementCache[noteName];
                    if (el) el.classList.remove('practice-target');
                }
                this._practiceHighlighted = null;
            }
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

        // Highlight expected keys on the piano (diff-based to avoid per-frame DOM thrashing)
        const newTargets = new Set();
        for (const noteName of this.practiceExpectedNotes) {
            if (this.practiceHitNotes.has(noteName)) continue;
            newTargets.add(noteName);
        }
        // Remove highlight from keys no longer targeted
        if (this._practiceHighlighted) {
            for (const noteName of this._practiceHighlighted) {
                if (!newTargets.has(noteName)) {
                    const el = this._keyElementCache && this._keyElementCache[noteName];
                    if (el) el.classList.remove('practice-target');
                }
            }
        }
        // Add highlight to newly targeted keys
        for (const noteName of newTargets) {
            if (!this._practiceHighlighted || !this._practiceHighlighted.has(noteName)) {
                const el = this._keyElementCache && this._keyElementCache[noteName];
                if (el) el.classList.add('practice-target');
            }
        }
        this._practiceHighlighted = newTargets;

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
        this.showHitFeedback(noteName, true, 1);
        this.practiceHitNotes.add(noteName);

        // Remove highlight from this key
        const keyEl = this._keyElementCache && this._keyElementCache[noteName];
        if (keyEl) keyEl.classList.remove('practice-target');

        // If all chord notes are hit, advance
        if (this.practiceHitNotes.size >= this.practiceExpectedNotes.size) {
            this.practiceWaiting = false;
            this.practiceExpectedNotes = new Set();
            this.practiceHitNotes = new Set();
        }
        return true;
    }
    
    _renderFrame(ts) {
        this._frameTime = ts || performance.now();
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

        if (this.glRenderer && this.glRenderer.available) {
            // === PixiJS GPU-accelerated rendering (notes + wave ribbons) ===
            this.glRenderer.renderNotes(this.fallingNotes, this.keyPositions, {
                noteSpeed: this.noteSpeed,
                speedMultiplier: speed,
                noteStyle: this.noteStyle,
                hitZoneY: this.hitZoneY,
                canvasH: canvasH,
                gameMode: this.gameMode,
                practiceWaiting: this.practiceWaiting,
                practiceExpectedNotes: this.practiceExpectedNotes,
                coPlayManualNotes: this.coPlayManualNotes,
                heldFallingNotes: this.heldFallingNotes,
                time: this._frameTime / 1000,
                bgOverlayOpacity: this.laneStyle === 'synthesia' ? this.bgOverlayOpacity : 0,
                waveCount: this.waveEnabled ? (this.waveCount || 6) : 0,
            });

            // No drawImage needed — browser composites the DOM canvases natively

            // Draw note labels on the 2D overlay canvas
            this._drawNoteLabels(ctx, speed, canvasH);
        } else {
            // === Canvas 2D fallback ===
            // Pre-render shared wave overlay once per frame for classic bars
            if (this.noteStyle === 'classic') {
                this._renderWaveOverlay();
            }

            // If neon glow is enabled, draw notes to a glow canvas first for bloom
            if (this.neonGlowEnabled) {
                this._ensureGlowCanvas(w, h);
                const gctx = this._glowCtx;
                gctx.clearRect(0, 0, w, h);
                const origCtx = this.ctx;
                this.ctx = gctx;
                for (let i = 0, len = this.fallingNotes.length; i < len; i++) {
                    const note = this.fallingNotes[i];
                    const dur = note.duration || 0.15;
                    const noteH = Math.max(12, dur * this.noteSpeed * speed);
                    const topEdge = note.y - noteH;
                    if (topEdge < canvasH && note.y > -50) {
                        this.drawNote(note);
                    }
                }
                this.ctx = origCtx;

                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                ctx.filter = 'blur(8px) brightness(1.3)';
                ctx.globalAlpha = 0.4;
                ctx.drawImage(this._glowCanvas, 0, 0);
                ctx.restore();
                ctx.drawImage(this._glowCanvas, 0, 0);
            } else {
                for (let i = 0, len = this.fallingNotes.length; i < len; i++) {
                    const note = this.fallingNotes[i];
                    const dur = note.duration || 0.15;
                    const noteH = Math.max(12, dur * this.noteSpeed * speed);
                    const topEdge = note.y - noteH;
                    if (topEdge < canvasH && note.y > -50) {
                        this.drawNote(note);
                    }
                }
            }
        }

        // Draw animated force field hit bar (drawn each frame, on top of notes)
        if (this.forceFieldEnabled) {
            this._drawForceField(ctx, w);
        }

        // Emit and draw sparkle particles for held notes
        this._emitHeldNoteParticles();
        this._updateAndDrawParticles(ctx);
        
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

        // Draw vertical lanes (style-dependent)
        const style = this.laneStyle;
        if (style === 'synthesia') {
            // Synthesia-inspired: dark background with octave separator lines
            // When PixiJS renderer is active, bg overlay is drawn on GPU canvas instead
            if (!this.glRenderer || !this.glRenderer.available) {
                lctx.fillStyle = `rgba(14, 11, 34, ${this.bgOverlayOpacity})`;
                lctx.fillRect(0, 0, w, h);
            }
            // Draw vertical lines only at octave boundaries (C notes)
            lctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            lctx.lineWidth = 1;
            for (const note of this.allNotes) {
                if (!note.startsWith('C') || note.includes('#')) continue;
                const pos = this.keyPositions[note];
                if (!pos) continue;
                const edge = Math.round(pos.left);
                lctx.beginPath();
                lctx.moveTo(edge + 0.5, 0);
                lctx.lineTo(edge + 0.5, h);
                lctx.stroke();
            }
            // Half-visible lines at E/F boundary (between 2-black and 3-black groups)
            lctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
            lctx.lineWidth = 1;
            for (const note of this.allNotes) {
                if (!note.startsWith('F') || note.includes('#')) continue;
                const pos = this.keyPositions[note];
                if (!pos) continue;
                const edge = Math.round(pos.left);
                lctx.beginPath();
                lctx.moveTo(edge + 0.5, 0);
                lctx.lineTo(edge + 0.5, h);
                lctx.stroke();
            }
        } else if (style !== 'none') {
            for (const note of this.allNotes) {
                const pos = this.keyPositions[note];
                if (!pos) continue;

                const isManual = isCoPlay && this.coPlayManualNotes.has(note);

                // Skip non-black keys in blackonly mode (except manual lanes)
                if (style === 'blackonly' && !pos.isBlack && !isManual) continue;

                const opacityMul = style === 'dim' ? 0.35 : 1.0;

                // Fill
                if (isManual) {
                    lctx.fillStyle = `rgba(255, 165, 0, ${0.18 * opacityMul})`;
                } else {
                    lctx.fillStyle = pos.isBlack ?
                        `rgba(80, 40, 120, ${0.15 * opacityMul})` : `rgba(255, 255, 255, ${0.08 * opacityMul})`;
                }
                lctx.fillRect(pos.left, 0, pos.width, h);

                // Border strokes (skip in fill-only and blackonly modes)
                if (style === 'full' || style === 'dim' || isManual) {
                    lctx.strokeStyle = isManual ? `rgba(255, 165, 0, ${0.4 * opacityMul})` : `rgba(255, 255, 255, ${0.2 * opacityMul})`;
                    lctx.lineWidth = 2;
                    lctx.beginPath();
                    lctx.moveTo(pos.left, 0);
                    lctx.lineTo(pos.left, h);
                    lctx.moveTo(pos.left + pos.width, 0);
                    lctx.lineTo(pos.left + pos.width, h);
                    lctx.stroke();
                }
            }
        }

        // Draw hit zone bar (note-thickness, just above the keyboard)
        // Skip static hit bar if force field is enabled (drawn dynamically each frame)
        const hitBarHeight = 12;
        if (this.forceFieldEnabled) {
            // Force field is animated — skip static bar rendering
        } else if (style === 'synthesia') {
            // Synthesia: golden hit bar with note-letter labels
            lctx.fillStyle = 'rgba(218, 165, 32, 0.7)';
            lctx.fillRect(0, this.hitZoneY - hitBarHeight, w, hitBarHeight);
            // Note letter labels inside the hit bar
            lctx.font = `bold ${Math.max(9, Math.min(11, this.keyWidth * 0.45))}px sans-serif`;
            lctx.textAlign = 'center';
            lctx.textBaseline = 'middle';
            for (const note of this.allNotes) {
                const pos = this.keyPositions[note];
                if (!pos || pos.isBlack) continue;
                const letter = note.charAt(0);
                const cx = pos.left + pos.width / 2;
                lctx.fillStyle = 'rgba(255, 223, 100, 0.8)';
                lctx.fillText(letter, cx, this.hitZoneY - hitBarHeight / 2);
            }
        } else {
            lctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            lctx.fillRect(0, this.hitZoneY - hitBarHeight, w, hitBarHeight);
        }

        // Draw hit zone indicators
        if (style !== 'synthesia' && !this.forceFieldEnabled) {
            for (const [note, pos] of Object.entries(this.keyPositions)) {
                const iw = pos.width * 0.9;
                const ih = hitBarHeight;
                const ix = pos.left + (pos.width - iw) / 2;
                const iy = this.hitZoneY - ih;
                lctx.fillStyle = pos.isBlack ? 
                    'rgba(156, 39, 176, 0.4)' : 'rgba(33, 150, 243, 0.4)';
                lctx.fillRect(ix, iy, iw, ih);
                lctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                lctx.lineWidth = 2;
                lctx.strokeRect(ix, iy, iw, ih);
            }
        }

        this._laneCacheDirty = false;
    }
    
    drawNote(note) {
        if (this.noteStyle === 'classic') return this.drawNoteClassic(note);
        const pos = this.keyPositions[note.note];
        if (!pos) return;
        const ctx = this.ctx;
        
        const noteWidth = pos.width * 0.9;
        const dur = note.duration || 0.15;
        const noteGap = 4;
        const noteHeight = Math.max(12, dur * this.noteSpeed * this.speedMultiplier - noteGap);
        const x = pos.left + (pos.width - noteWidth) / 2;
        const y = note.y - noteHeight;
        
        const isHeld = note.hit && this.heldFallingNotes.get(note.note) === note;
        const isCoPlayManual = this.gameMode === 'coplay' && this.coPlayManualNotes.has(note.note);
        const hand = note.hand || 0;
        const isBlackKey = pos.isBlack;

        let hue, sat, lum, alpha;
        if (note.missed) {
            hue = 0; sat = 85; lum = 55; alpha = 0.9;
        } else if (note.hit && isHeld) {
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 90; lum = 55; alpha = 1.0;
        } else if (note.hit) {
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 60; lum = 40; alpha = 0.35;
        } else if (this.gameMode === 'practice' && this.practiceWaiting && this.practiceExpectedNotes.has(note.note) && !note.hit) {
            hue = 50; sat = 100; lum = 55; alpha = 1.0;
        } else if (isCoPlayManual) {
            hue = 30; sat = 100; lum = 55; alpha = 1.0;
        } else if (this.gameMode === 'coplay') {
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 70; lum = 40; alpha = 0.45;
        } else {
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 80; lum = 45; alpha = 0.9;
        }

        // Beam dimensions
        const centerX = x + noteWidth / 2;
        const beamWidth = noteWidth * 0.35;
        const headHeight = Math.min(14, noteHeight);
        const tailHeight = noteHeight - headHeight;
        const headY = note.y - headHeight;

        // Draw beam tail — outer glow + bright core (just two fillRects, no gradients)
        if (tailHeight > 2) {
            // Outer glow
            const glowW = beamWidth * 1.6;
            ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha * 0.2})`;
            ctx.fillRect(centerX - glowW / 2, y, glowW, tailHeight);

            // Bright core
            const coreW = beamWidth * 0.4;
            ctx.fillStyle = `hsla(${hue}, ${Math.max(30, sat - 20)}%, ${Math.min(lum + 20, 75)}%, ${alpha * 0.8})`;
            ctx.fillRect(centerX - coreW / 2, y, coreW, tailHeight);
        }

        // Draw head — solid rectangle
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha})`;
        ctx.fillRect(x + 2, headY + 1, noteWidth - 4, headHeight - 2);

        // Head highlight strip
        ctx.fillStyle = `hsla(${hue}, 30%, ${Math.min(lum + 25, 75)}%, ${alpha * 0.5})`;
        ctx.fillRect(x + 3, headY + 1, noteWidth - 6, Math.max(3, headHeight * 0.35));

        // Label on head
        if (headHeight >= 12) {
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.strokeText(note.note, pos.x, headY + headHeight / 2);
            ctx.fillStyle = '#fff';
            ctx.fillText(note.note, pos.x, headY + headHeight / 2);
        }
    }

    /** Draw text labels on the 2D canvas for WebGL-rendered notes */
    _drawNoteLabels(ctx, speed, canvasH) {
        if (this.noteStyle === 'classic') return; // classic bars don't have text labels

        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.fillStyle = '#fff';

        for (let i = 0, len = this.fallingNotes.length; i < len; i++) {
            const note = this.fallingNotes[i];
            const pos = this.keyPositions[note.note];
            if (!pos) continue;
            const dur = note.duration || 0.15;
            const noteH = Math.max(12, dur * this.noteSpeed * speed);
            const topEdge = note.y - noteH;
            if (topEdge >= canvasH || note.y <= -50) continue;

            const noteGap = 4;
            const noteHeight = Math.max(12, dur * this.noteSpeed * speed - noteGap);

            // Label on beam head
            const headHeight = Math.min(14, noteHeight);
            const headY = note.y - headHeight;
            if (headHeight >= 12) {
                ctx.strokeText(note.note, pos.x, headY + headHeight / 2);
                ctx.fillText(note.note, pos.x, headY + headHeight / 2);
            }
        }
    }

    /** Render the shared wave animation overlay (called once per frame when classic bars are active) */
    _renderWaveOverlay() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        if (!this._waveCanvas || this._waveCanvas.width !== w || this._waveCanvas.height !== h) {
            this._waveCanvas = document.createElement('canvas');
            this._waveCanvas.width = w;
            this._waveCanvas.height = h;
            this._waveCtx = this._waveCanvas.getContext('2d');
        }
        const wctx = this._waveCtx;
        wctx.clearRect(0, 0, w, h);

        const t = performance.now() / 1000;

        // Smooth flowing ribbon waves (reduced for performance)
        const ribbons = [
            { yBase: 0.25, thickness: 0.20, freq: 0.5, amp: 0.13, speed: 0.4, hue: 170, sat: 50, alpha: 0.25 },
            { yBase: 0.55, thickness: 0.22, freq: 0.6, amp: 0.12, speed: -0.35, hue: 200, sat: 50, alpha: 0.22 },
            { yBase: 0.80, thickness: 0.18, freq: 0.45, amp: 0.10, speed: 0.5, hue: 180, sat: 55, alpha: 0.20 },
        ];

        const segments = 5; // bezier control points across width

        for (const ribbon of ribbons) {
            // Compute top and bottom edges of ribbon using smooth sine curves
            const topPoints = [];
            const botPoints = [];
            for (let i = 0; i <= segments; i++) {
                const frac = i / segments;
                const px = frac * w;
                const phase = frac * Math.PI * 2 * ribbon.freq + t * ribbon.speed;
                const wave = Math.sin(phase) * ribbon.amp * h;
                const wave2 = Math.sin(phase * 1.3 + 1.7) * ribbon.amp * h * 0.3;
                const centerY = ribbon.yBase * h + wave + wave2;
                const halfThick = ribbon.thickness * h * 0.5 * (0.7 + 0.3 * Math.sin(frac * Math.PI));
                topPoints.push({ x: px, y: centerY - halfThick });
                botPoints.push({ x: px, y: centerY + halfThick });
            }

            // Draw ribbon as a filled path using smooth curves
            wctx.beginPath();
            wctx.moveTo(topPoints[0].x, topPoints[0].y);
            // Top edge (left to right) — smooth quadratic through points
            for (let i = 1; i < topPoints.length; i++) {
                const prev = topPoints[i - 1];
                const curr = topPoints[i];
                const cpx = (prev.x + curr.x) / 2;
                const cpy = (prev.y + curr.y) / 2;
                wctx.quadraticCurveTo(prev.x + (curr.x - prev.x) * 0.5, prev.y, cpx, cpy);
            }
            wctx.lineTo(topPoints[topPoints.length - 1].x, topPoints[topPoints.length - 1].y);
            // Bottom edge (right to left)
            wctx.lineTo(botPoints[botPoints.length - 1].x, botPoints[botPoints.length - 1].y);
            for (let i = botPoints.length - 2; i >= 0; i--) {
                const prev = botPoints[i + 1];
                const curr = botPoints[i];
                const cpx = (prev.x + curr.x) / 2;
                const cpy = (prev.y + curr.y) / 2;
                wctx.quadraticCurveTo(prev.x + (curr.x - prev.x) * 0.5, prev.y, cpx, cpy);
            }
            wctx.closePath();

            // Fill with a gradient along the ribbon height
            const midY = ribbon.yBase * h;
            const grad = wctx.createLinearGradient(0, midY - ribbon.thickness * h * 0.5, 0, midY + ribbon.thickness * h * 0.5);
            grad.addColorStop(0, `hsla(${ribbon.hue}, ${ribbon.sat}%, 75%, ${ribbon.alpha * 0.3})`);
            grad.addColorStop(0.3, `hsla(${ribbon.hue}, ${ribbon.sat}%, 85%, ${ribbon.alpha})`);
            grad.addColorStop(0.5, `hsla(${ribbon.hue}, ${ribbon.sat + 10}%, 90%, ${ribbon.alpha * 1.2})`);
            grad.addColorStop(0.7, `hsla(${ribbon.hue}, ${ribbon.sat}%, 85%, ${ribbon.alpha})`);
            grad.addColorStop(1, `hsla(${ribbon.hue}, ${ribbon.sat}%, 75%, ${ribbon.alpha * 0.3})`);
            wctx.fillStyle = grad;
            wctx.fill();
        }
    }

    drawNoteClassic(note) {
        const pos = this.keyPositions[note.note];
        if (!pos) return;
        const ctx = this.ctx;

        const noteWidth = pos.width * 0.85;
        const dur = note.duration || 0.15;
        const noteGap = 4;
        const noteHeight = Math.max(12, dur * this.noteSpeed * this.speedMultiplier - noteGap);
        const x = pos.left + (pos.width - noteWidth) / 2;
        const y = note.y - noteHeight;

        const isHeld = note.hit && this.heldFallingNotes.get(note.note) === note;
        const hand = note.hand || 0;
        const isBlackKey = pos.isBlack;

        let hue, sat, lum, alpha;
        if (note.missed) {
            hue = 0; sat = 70; lum = 45; alpha = 0.85;
        } else if (note.hit && isHeld) {
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 80; lum = 50; alpha = 1.0;
        } else if (note.hit) {
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 50; lum = 35; alpha = 0.3;
        } else {
            hue = hand === 0 ? (isBlackKey ? 160 : 130) : (isBlackKey ? 240 : 210);
            sat = 70; lum = 50; alpha = 0.9;
        }

        // Body fill — single solid color, no gradient
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha * 0.7})`;
        ctx.fillRect(x, y, noteWidth, noteHeight);

        // Glossy top strip
        ctx.fillStyle = `hsla(${hue}, 20%, 90%, ${alpha * 0.25})`;
        ctx.fillRect(x, y, noteWidth, Math.min(noteHeight * 0.25, 12));

        // Border
        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${Math.min(lum + 25, 80)}%, ${alpha * 0.5})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, noteWidth - 1, noteHeight - 1);
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

    _ensureGlowCanvas(w, h) {
        if (!this._glowCanvas || this._glowCanvas.width !== w || this._glowCanvas.height !== h) {
            this._glowCanvas = document.createElement('canvas');
            this._glowCanvas.width = w;
            this._glowCanvas.height = h;
            this._glowCtx = this._glowCanvas.getContext('2d');
        }
    }

    _drawForceField(ctx, canvasWidth) {
        const y = this.hitZoneY;
        const t = performance.now() / 1000;
        const barHeight = 24; // taller than the old 12px static bar
        const barTop = y - barHeight;

        // Spawn force field particles where notes are being held
        for (const [noteName, fallingNote] of this.heldFallingNotes) {
            const pos = this.keyPositions[noteName];
            if (!pos) continue;
            const hand = fallingNote.hand || 0;
            const isBlack = pos.isBlack;
            // Spawn 2-3 energy particles per frame per held note
            const count = 2 + Math.floor(Math.random() * 2);
            for (let i = 0; i < count; i++) {
                const hue = hand === 0 ? (isBlack ? 160 : 130) : (isBlack ? 240 : 210);
                this._forceFieldParticles.push({
                    x: pos.x + (Math.random() - 0.5) * pos.width * 0.8,
                    y: y - Math.random() * barHeight * 0.5,
                    vx: (Math.random() - 0.5) * 3.0,
                    vy: (Math.random() - 0.5) * 0.8,
                    life: 1.0,
                    decay: 0.015 + Math.random() * 0.02,
                    size: 2 + Math.random() * 4,
                    hue: hue + (Math.random() - 0.5) * 20,
                });
            }
        }

        // Always spawn ambient drift particles along the bar
        if (Math.random() < 0.3) {
            this._forceFieldParticles.push({
                x: Math.random() * canvasWidth,
                y: barTop + Math.random() * barHeight,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 0.3,
                life: 1.0,
                decay: 0.008 + Math.random() * 0.01,
                size: 1 + Math.random() * 2,
                hue: 200 + Math.random() * 60,
            });
        }

        ctx.save();

        // Draw base energy bar — animated flowing gradient
        const waveOffset = t * 80;
        const grad = ctx.createLinearGradient(0, barTop, 0, y);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(0.2, 'rgba(100, 180, 255, 0.05)');
        grad.addColorStop(0.5, 'rgba(80, 160, 255, 0.12)');
        grad.addColorStop(0.8, 'rgba(100, 200, 255, 0.08)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, barTop, canvasWidth, barHeight);

        // Draw flowing energy waves (sine-based undulating lines)
        for (let layer = 0; layer < 3; layer++) {
            const freq = 0.015 + layer * 0.008;
            const amp = 3 + layer * 2;
            const speed = (1.5 + layer * 0.7) * (layer % 2 === 0 ? 1 : -1);
            const alpha = 0.15 - layer * 0.03;
            const hue = 200 + layer * 30;
            ctx.beginPath();
            ctx.strokeStyle = `hsla(${hue}, 80%, 65%, ${alpha})`;
            ctx.lineWidth = 1.5 - layer * 0.3;
            ctx.shadowColor = `hsla(${hue}, 80%, 65%, 0.5)`;
            ctx.shadowBlur = 8;
            for (let x = 0; x < canvasWidth; x += 2) {
                const wave = Math.sin(x * freq + t * speed) * amp;
                const py = y - barHeight / 2 + wave;
                if (x === 0) ctx.moveTo(x, py);
                else ctx.lineTo(x, py);
            }
            ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // Draw the bright center line (the actual hit threshold)
        const centerAlpha = 0.3 + 0.15 * Math.sin(t * 3);
        const centerGrad = ctx.createLinearGradient(0, y - 2, 0, y + 2);
        centerGrad.addColorStop(0, `rgba(150, 220, 255, 0)`);
        centerGrad.addColorStop(0.5, `rgba(150, 220, 255, ${centerAlpha})`);
        centerGrad.addColorStop(1, `rgba(150, 220, 255, 0)`);
        ctx.fillStyle = centerGrad;
        ctx.fillRect(0, y - 3, canvasWidth, 6);

        // Update and draw force field particles
        for (let i = this._forceFieldParticles.length - 1; i >= 0; i--) {
            const p = this._forceFieldParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0 || p.x < -20 || p.x > canvasWidth + 20) {
                this._forceFieldParticles.splice(i, 1);
                continue;
            }

            const alpha = p.life * p.life;
            const sz = p.size * p.life;

            // Glow orb
            ctx.globalAlpha = alpha * 0.6;
            ctx.shadowColor = `hsla(${p.hue}, 80%, 60%, 0.8)`;
            ctx.shadowBlur = sz * 3;
            ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
            ctx.fill();

            // Bright core
            ctx.globalAlpha = alpha * 0.9;
            ctx.shadowBlur = 0;
            ctx.fillStyle = `hsla(${p.hue}, 40%, 90%, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, sz * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Cap particle count for performance
        if (this._forceFieldParticles.length > 300) {
            this._forceFieldParticles.splice(0, this._forceFieldParticles.length - 300);
        }

        ctx.restore();
    }

    /** Emit a one-time burst of sparkle particles when a note is hit */
    _emitHitBurst(noteName, hand) {
        if (!this.sparkleEnabled || this.sparkleIntensity <= 0) return;
        const pos = this.keyPositions[noteName];
        if (!pos) return;
        if (!this._particlePool) this._particlePool = [];
        const pool = this._particlePool;
        const isBlackKey = pos.isBlack;
        const burstCount = Math.max(2, Math.round((this.particleStyle === 'splash' ? 8 : 5) * this.sparkleIntensity));
        for (let i = 0; i < burstCount; i++) {
            if (this.particleStyle === 'splash') {
                const isWhite = Math.random() < 0.3;
                let color;
                if (isWhite) {
                    color = `hsla(200, 100%, ${90 + Math.random() * 10}%, 0.95)`;
                } else if (hand === 0) {
                    const hue = isBlackKey ? 160 + Math.random() * 40 : 140 + Math.random() * 40;
                    color = `hsla(${hue}, 80%, ${60 + Math.random() * 20}%, 0.9)`;
                } else {
                    const hue = isBlackKey ? 210 + Math.random() * 40 : 190 + Math.random() * 40;
                    color = `hsla(${hue}, 80%, ${60 + Math.random() * 20}%, 0.9)`;
                }
                const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
                const speed = (3.0 + Math.random() * 4.0) * this.sparkleHeight;
                const spikeLen = (18 + Math.random() * 28) * this.sparkleHeight;
                const p = pool.pop() || {};
                p.x = pos.x + (Math.random() - 0.5) * pos.width * 0.5;
                p.y = this.hitZoneY - 12 - Math.random() * 3;
                p.vx = Math.cos(angle) * speed;
                p.vy = Math.sin(angle) * speed;
                p.life = 1.0;
                p.decay = (0.02 + Math.random() * 0.018) / Math.max(this.sparkleHeight, 0.3);
                p.size = 1.8 + Math.random() * 2.2;
                p.spikeLength = spikeLen;
                p.spikeAngle = angle;
                p.color = color;
                p.type = 'splash';
                this.particles.push(p);
            } else {
                const isWhite = Math.random() < 0.35;
                let color;
                if (isWhite) {
                    color = `hsl(0, 0%, ${85 + Math.random() * 15}%)`;
                } else if (hand === 0) {
                    const baseHue = isBlackKey ? 150 + Math.random() * 30 : 120 + Math.random() * 30;
                    color = `hsl(${baseHue}, 80%, ${50 + Math.random() * 20}%)`;
                } else {
                    const baseHue = isBlackKey ? 230 + Math.random() * 30 : 200 + Math.random() * 30;
                    color = `hsl(${baseHue}, 80%, ${50 + Math.random() * 20}%)`;
                }
                const p = pool.pop() || {};
                p.x = pos.x + (Math.random() - 0.5) * pos.width * 0.8;
                p.y = this.hitZoneY - 12 - Math.random() * 10;
                p.vx = (Math.random() - 0.5) * 2.0;
                p.vy = -(Math.random() * 5 + 3.0) * this.sparkleHeight;
                p.life = 1.0;
                p.decay = (0.02 + Math.random() * 0.018) / Math.max(this.sparkleHeight, 0.3);
                p.size = 2.0 + Math.random() * 2.5;
                p.length = (10 + Math.random() * 16) * this.sparkleHeight;
                p.color = color;
                p.type = 'sparkle';
                this.particles.push(p);
            }
        }
    }

    _emitHeldNoteParticles() {
        if (!this.isPlaying || this.isPaused || this.sparkleIntensity <= 0 || !this.sparkleEnabled) return;
        // Reusable pool to avoid GC pressure
        if (!this._particlePool) this._particlePool = [];
        const pool = this._particlePool;

        for (const [noteName, fallingNote] of this.heldFallingNotes) {
            // Only sparkle while the note body still overlaps the hit zone
            const dur = fallingNote.duration || 0.15;
            const noteH = Math.max(12, dur * this.noteSpeed * (this.speedMultiplier || 1));
            const noteTop = fallingNote.y - noteH;
            if (noteTop > this.hitZoneY) {
                // Note scrolled past — skip sparkle but don't delete held state
                // (cleanup happens in update() when note leaves the screen)
                continue;
            }

            // In manual mode, only sparkle while the key is physically held down
            if (!this.isAutoPlay) {
                const boundKey = this.noteToKey[noteName];
                if (boundKey) {
                    if (!this.heldKeys.has(boundKey)) continue;
                } else {
                    if (!this._keyElementCache) this._keyElementCache = {};
                    let el = this._keyElementCache[noteName];
                    if (el === undefined) {
                        el = document.querySelector(`.key[data-note="${noteName}"]`);
                        this._keyElementCache[noteName] = el || null;
                    }
                    if (!el || !el.classList.contains('active')) continue;
                }
            }

            const pos = this.keyPositions[noteName];
            if (!pos) continue;
            const hand = fallingNote.hand || 0;
            const isBlackKey = pos.isBlack;

            if (this.particleStyle === 'splash') {
                // Splash: sharp spiky bursts radiating outward from hit zone
                const baseCount = Math.random() < 0.4 ? 5 : 4;
                const count = Math.max(1, Math.round(baseCount * this.sparkleIntensity));
                for (let i = 0; i < count; i++) {
                    const isWhite = Math.random() < 0.3;
                    let color;
                    if (isWhite) {
                        color = `hsla(200, 100%, ${90 + Math.random() * 10}%, 0.95)`;
                    } else if (hand === 0) {
                        const hue = isBlackKey ? 160 + Math.random() * 40 : 140 + Math.random() * 40;
                        color = `hsla(${hue}, 80%, ${60 + Math.random() * 20}%, 0.9)`;
                    } else {
                        const hue = isBlackKey ? 210 + Math.random() * 40 : 190 + Math.random() * 40;
                        color = `hsla(${hue}, 80%, ${60 + Math.random() * 20}%, 0.9)`;
                    }
                    // Spread in a fan upward with some randomness
                    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.0;
                    const speed = (2.0 + Math.random() * 3.5) * this.sparkleHeight;
                    const spikeLen = (15 + Math.random() * 25) * this.sparkleHeight;
                    const p = pool.pop() || {};
                    p.x = pos.x + (Math.random() - 0.5) * pos.width * 0.4;
                    p.y = this.hitZoneY - 12 - Math.random() * 2;
                    p.vx = Math.cos(angle) * speed;
                    p.vy = Math.sin(angle) * speed;
                    p.life = 1.0;
                    p.decay = (0.018 + Math.random() * 0.015) / Math.max(this.sparkleHeight, 0.3);
                    p.size = 1.5 + Math.random() * 2.0;
                    p.spikeLength = spikeLen;
                    p.spikeAngle = angle;
                    p.color = color;
                    p.type = 'splash';
                    this.particles.push(p);
                }
            } else {
                // Sparkle (default): beam/streak particles
                const baseCount = Math.random() < 0.5 ? 3 : 2;
                const count = Math.max(1, Math.round(baseCount * this.sparkleIntensity));
                for (let i = 0; i < count; i++) {
                    const isWhite = Math.random() < 0.35;
                    let color;
                    if (isWhite) {
                        color = `hsl(0, 0%, ${85 + Math.random() * 15}%)`;
                    } else if (hand === 0) {
                        const baseHue = isBlackKey ? 150 + Math.random() * 30 : 120 + Math.random() * 30;
                        color = `hsl(${baseHue}, 80%, ${50 + Math.random() * 20}%)`;
                    } else {
                        const baseHue = isBlackKey ? 230 + Math.random() * 30 : 200 + Math.random() * 30;
                        color = `hsl(${baseHue}, 80%, ${50 + Math.random() * 20}%)`;
                    }
                    const p = pool.pop() || {};
                    p.x = pos.x + (Math.random() - 0.5) * pos.width * 0.7;
                    p.y = this.hitZoneY - 12 - Math.random() * 8;
                    p.vx = (Math.random() - 0.5) * 1.5;
                    p.vy = -(Math.random() * 4 + 2.5) * this.sparkleHeight;
                    p.life = 1.0;
                    p.decay = (0.018 + Math.random() * 0.015) / Math.max(this.sparkleHeight, 0.3);
                    p.size = 1.5 + Math.random() * 2.5;
                    p.length = (8 + Math.random() * 14) * this.sparkleHeight;
                    p.color = color;
                    p.type = 'sparkle';
                    this.particles.push(p);
                }
            }
        }
    }

    _updateAndDrawParticles(ctx) {
        const pool = this._particlePool || (this._particlePool = []);
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) {
                const last = this.particles.length - 1;
                if (i !== last) this.particles[i] = this.particles[last];
                this.particles.pop();
                if (pool.length < 500) pool.push(p); // recycle
                continue;
            }

            if (p.type === 'splash') {
                // Splash: sharp spiky spines radiating outward
                p.vy += 0.06;
                p.vx *= 0.98;
                const alpha = p.life * p.life;
                const len = p.spikeLength * p.life;
                const baseW = p.size * p.life;
                const ang = p.spikeAngle;

                // Spike tip position
                const tipX = p.x + Math.cos(ang) * len;
                const tipY = p.y + Math.sin(ang) * len;
                // Perpendicular for base width
                const perpX = -Math.sin(ang) * baseW;
                const perpY = Math.cos(ang) * baseW;

                // Glow
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 12 * this.sparkleIntensity;

                // Draw spike as a sharp triangle
                ctx.globalAlpha = alpha * 0.85;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(p.x + perpX, p.y + perpY);
                ctx.lineTo(p.x - perpX, p.y - perpY);
                ctx.closePath();
                ctx.fill();

                // Bright core line along the spike center
                ctx.globalAlpha = alpha * 0.95;
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.lineWidth = Math.max(0.5, baseW * 0.4);
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(tipX, tipY);
                ctx.stroke();
            } else {
                // Sparkle: beam/streak rendering (original)
                p.vy += 0.03;
                const alpha = p.life * p.life;
                const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                const beamLen = p.length * p.life;
                const nx = speed > 0 ? p.vx / speed : 0;
                const ny = speed > 0 ? p.vy / speed : -1;
                const tailX = p.x - nx * beamLen;
                const tailY = p.y - ny * beamLen;

                ctx.shadowColor = p.color;
                ctx.shadowBlur = 8 * this.sparkleIntensity;

                ctx.globalAlpha = alpha * 0.7;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = p.size * p.life;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(tailX, tailY);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();

                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * p.life * 0.7, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    _drawTimeline() {
        if (!this.isPlaying || this.isPaused) return;
        if (this.laneStyle === 'synthesia') return; // clean look, no timeline grid
        const ctx = this.ctx;
        const speed = this.speedMultiplier;
        const currentTime = (this._frameTime - this.startTime) / 1000;
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

        // Cache measureText results — labels repeat every loop
        if (!this._timelineLabelWidths) this._timelineLabelWidths = {};

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

            // Time label with cached width
            const mins = Math.floor(t / 60);
            const secs = Math.floor(t % 60);
            const label = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
            let lw = this._timelineLabelWidths[label];
            if (lw === undefined) {
                lw = ctx.measureText(label).width;
                this._timelineLabelWidths[label] = lw;
            }
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(2, yy - 8, lw + 6, 16);
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
