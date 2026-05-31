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
        this.multiplierTrackerEl = document.getElementById('multiplierTracker');
        this.multiplierValueEl = document.getElementById('multiplierValue');
        this.multiplierPipsEl = document.getElementById('multiplierPips');
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
        this.perfDebugStatus = document.getElementById('perfDebugStatus');
        
        // Game state
        this.notes = [];
        this.fallingNotes = [];
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        // Guitar-Hero style score multiplier: x1 base, +1 every MULTIPLIER_STEP
        // consecutive hits, capped at MULTIPLIER_MAX. Resets to x1 on any miss.
        this.MULTIPLIER_STEP = 10;
        this.MULTIPLIER_MAX = 4;
        this._lastMultiplier = 1;
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
        this.onlineSeqState = {
            query: '',
            start: 0,
            hasMore: false,
            activeFilter: 'recently_shared',
            cookie: localStorage.getItem('onlineseq_cf_cookie') || '',
        };
        
        // Game settings
        this.noteSpeed = 200; // pixels per second
        this.hitZoneY = this.canvas.height;
        this.hitTolerance = 50; // pixels tolerance for hitting notes
        this.showTimingFeedback = true; // show Perfect/Great/Good/OK/Miss text

        // Performance: cached static layers
        this._laneCanvas = null; // offscreen canvas for lanes + hit zone
        this._laneCacheDirty = true;
        this._boundRender = (ts) => this._renderFrame(ts);
        this._fixedStepSec = 1 / 60;
        this._maxCatchupSteps = 5;
        this._logicAccumulatorSec = 0;
        this._logicClockSec = 0;
        this._logicLastTargetSec = 0;
        this._hasLogicClock = false;
        this.noteLeadInSec = 3;
        this._preRollSec = 0;
        this._perfWorker = null;
        this._perfWorkerReqId = 0;
        this._perfWorkerPending = new Map();
        this._simpleModeCache = null;
        this._durationCache = null;
        this._wasmMath = null;
        this._perfWorkerStatus = 'init';
        this._wasmStatus = 'init';
        this._perfWorkerInUse = false;
        this._wasmInUse = false;
        this._perfPrecomputeMode = '--';
        this._perfPrecomputeMs = null;

        // PixiJS GPU-accelerated note renderer (DOM-composited, no drawImage needed)
        this.pixiCanvas = document.getElementById('pixiCanvas');
        this.noteRenderer = this.pixiCanvas ? new PixiNoteRenderer(this.pixiCanvas) : null;
        if (this.noteRenderer) console.log('[PianoHero] Using PixiJS note renderer');
        else console.log('[PianoHero] PixiJS not available, using Canvas 2D fallback');

        // FX overlay (mist ribbon + liquid trails)
        this.fxCanvas = document.getElementById('fxCanvas');
        this.pianoFx = (this.fxCanvas && window.PianoFX) ? new PianoFX(this.fxCanvas) : null;
        this._lastFxFrame = null;
        if (this.pianoFx && this.pianoFx.ready && typeof this.pianoFx.ready.then === 'function') {
            this.pianoFx.ready.then(() => this._applyPianoFxRuntimeSettings());
        }
        try { window.pianoHero = this; } catch (_) {}

        // Key scale / zoom
        this.keyScale = 1.0;

        // Speed control
        this.speedMultiplier = 1.0;
        this.songBPM = null; // detected from loaded notes

        // Game mode: 'normal', 'simple', 'coplay', 'practice', 'micpractice'
        this.gameMode = 'normal';
        this.originalNotes = []; // unmodified notes from loader
        this.practiceWaiting = false; // true when waiting for player input
        this.practiceExpectedNotes = new Set(); // notes that must be pressed (chord support)
        this.practiceHitNotes = new Set(); // notes already pressed in current chord
        this.practiceExpectedCounts = new Map(); // note name -> required hits for this chord
        this.practiceHitCounts = new Map(); // note name -> completed hits for this chord
        this.practiceChordTime = null;
        this.pitchfinderModule = null;
        this.pitchfinderPromise = null;
        this.pitchDetector = null;
        this.micStream = null;
        this.micSourceNode = null;
        this.micAnalyser = null;
        this.micBuffer = null;
        this.micDetectionFrame = null;
        this.micStartPromise = null;
        this.micDetectedNote = null;
        this.micLastDetectedNote = null;
        this.micLastDetectedAt = 0;
        this.micDetectedNoteHoldMs = 2000;
        this.micCandidateNote = null;
        this.micCandidateSince = 0;

        // Hold-note tracking
        this.heldKeys = new Set();                // keyboard keys currently held down
        this.activeNoteSources = new Map();       // note name → { source, noteGain, fadeStart, fadeEnd }
        this._fxKeyFillTimers = new Map();        // note name -> DOM fill cleanup timer
        this.heldFallingNotes = new Map();        // note name → falling note being held

        this.laneStyle = 'synthesia';
        this.noteStyle = 'classic'; // beam, classic
        this.showNoteNames = false; // overlay note letter labels (works for beam + classic)
        this.ultraPerformance = false; // route everything through Pixi, skip 2D overlay

        // Neon glow effect for falling notes
        this.neonGlowEnabled = false;
        this.hasBgImage = false;
        this.currentBackgroundName = '';
        this.bgOverlayOpacity = 0;
        this._glowCanvas = null;
        this._glowCtx = null;

        // Reuse timing feedback nodes to reduce frequent DOM allocation/removal churn
        this._timingFeedbackPool = [];
        this.timingFeedbackMode = 'individual';
        this._consolidatedFeedbackState = null;
        this._consolidatedFeedbackTimer = null;
        this._timingFeedbackCenterEl = null;

        // Force field hit bar
        this.forceFieldEnabled = false;
        this._forceFieldParticles = [];
        this._forceFieldTime = 0;
        this.graphicsPreset = 'high';
        this.compactGameArea = false;
        this.fxOnlyMode = true;
        this.fxStreamMode = 'off';
        this.fxStreamWidth = 'normal';
        this.fxRibbonMode = 'strong';
        this.fxSplashMode = 'classic';
        this.fxGlowlineHueStart = 0;
        this.fxGlowlineHueEnd = 306;
        this.fxGlowlineSat = 95;
        this.fxGlowlineVal = 100;
        this.fxSmokeHue = 30;
        this.fxSmokeSat = 49;
        this.fxSmokeVal = 55;
        this.fxKeyGlowHue = 200;
        this.fxKeyGlowSat = 70;
        this.fxKeyGlowVal = 100;
        this.keyPressTint = 'off';
        this.keyPressTintHue = 256;
        this.keyPressTintSat = 70;
        this.keyPressTintVal = 100;
        this._fxPaletteDefaults = {
            glowlineHueStart: 0,
            glowlineHueEnd: 306,
            glowlineSat: 95,
            glowlineVal: 100,
            smokeHue: 30,
            smokeSat: 49,
            smokeVal: 55,
            keyGlowHue: 200,
            keyGlowSat: 70,
            keyGlowVal: 100,
            keyPressTintHue: 256,
            keyPressTintSat: 70,
            keyPressTintVal: 100,
        };

        // Visible-note windowing cursors (advance forward only;
        // reset whenever fallingNotes is rebuilt)
        this._firstActiveIdx = 0;
        this._lastVisibleIdx = 0;
        this._noteWindowMargin = 50; // px buffer above/below viewport

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
        this.soundfontDecodePromise = null;
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
        
        this._updatePerfDebugStatus();
        this.init();
        this._initPerformanceWorker();
        this._initWasmMath();
    }

    _updatePerfDebugStatus() {
        const precomputeMs = Number.isFinite(this._perfPrecomputeMs) ? `${this._perfPrecomputeMs.toFixed(1)}ms` : '--';
        const workerStatus = this._perfWorkerStatus === 'ready' && this._perfWorkerInUse
            ? 'active'
            : this._perfWorkerStatus;
        const wasmStatus = this._wasmStatus === 'ready' && this._wasmInUse
            ? 'active'
            : this._wasmStatus;
        const text = `Perf: Worker ${workerStatus} | WASM ${wasmStatus} | Precompute ${this._perfPrecomputeMode} ${precomputeMs}`;
        if (this.perfDebugStatus) this.perfDebugStatus.textContent = text;
    }

    _setPrecomputePerfDebug(mode, elapsedMs, noteCount) {
        this._perfWorkerInUse = mode === 'worker' || mode === 'mixed';
        this._perfPrecomputeMode = mode;
        this._perfPrecomputeMs = elapsedMs;
        this._updatePerfDebugStatus();
        console.info(`[PianoHero] precompute mode=${mode} notes=${noteCount} time=${elapsedMs.toFixed(1)}ms`);
    }

    _initPerformanceWorker() {
        if (typeof Worker !== 'function') {
            this._perfWorkerStatus = 'unsupported';
            this._updatePerfDebugStatus();
            return;
        }
        try {
            this._perfWorker = new Worker('performance-worker.js?v=1');
            this._perfWorkerStatus = 'ready';
            this._updatePerfDebugStatus();
            this._perfWorker.onmessage = (event) => {
                const msg = event.data || {};
                const pending = this._perfWorkerPending.get(msg.id);
                if (!pending) return;
                this._perfWorkerPending.delete(msg.id);
                if (pending.timer) clearTimeout(pending.timer);
                if (msg.ok) pending.resolve(msg.result);
                else pending.reject(new Error(msg.error || 'Performance worker failed'));
            };
            this._perfWorker.onerror = () => {
                this._perfWorker = null;
                this._perfWorkerStatus = 'error';
                this._updatePerfDebugStatus();
                this._perfWorkerPending.forEach(({ reject, timer }) => {
                    if (timer) clearTimeout(timer);
                    reject(new Error('Performance worker crashed'));
                });
                this._perfWorkerPending.clear();
            };
        } catch (_) {
            this._perfWorker = null;
            this._perfWorkerStatus = 'error';
            this._updatePerfDebugStatus();
        }
    }

    _runPerfWorkerTask(task, payload) {
        if (!this._perfWorker) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const id = ++this._perfWorkerReqId;
            const pending = { resolve, reject, timer: null };
            pending.timer = setTimeout(() => {
                if (!this._perfWorkerPending.has(id)) return;
                this._perfWorkerPending.delete(id);
                reject(new Error(`Performance worker timeout for task "${task}"`));
            }, 5000);
            this._perfWorkerPending.set(id, pending);
            try {
                this._perfWorker.postMessage({ id, task, payload });
            } catch (err) {
                if (pending.timer) clearTimeout(pending.timer);
                this._perfWorkerPending.delete(id);
                reject(err);
            }
        });
    }

    async _precomputeSongData(notes) {
        const safeNotes = Array.isArray(notes) ? notes : [];
        const precomputeStart = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
        let usedWorker = false;
        let usedFallback = false;
        this._simpleModeCache = null;
        this._durationCache = null;
        let bpm = null;
        let workerDurationNormal = null;
        let workerDurationSimple = null;

        try {
            const result = await this._runPerfWorkerTask('precompute', { notes: safeNotes });
            if (result) {
                usedWorker = true;
                if (typeof result.bpm === 'number') bpm = result.bpm;
                if (Array.isArray(result.simpleNotes)) this._simpleModeCache = result.simpleNotes;
                if (result.duration && typeof result.duration === 'object') {
                    if (Number.isFinite(result.duration.normal)) workerDurationNormal = result.duration.normal;
                    if (Number.isFinite(result.duration.simple)) workerDurationSimple = result.duration.simple;
                }
                if (workerDurationNormal != null && workerDurationSimple != null) {
                    this._durationCache = {
                        normal: workerDurationNormal,
                        simple: workerDurationSimple,
                    };
                }
            }
        } catch (_) {
            usedFallback = true;
            // Fallback to synchronous path below
        }

        if (!Number.isFinite(bpm)) {
            usedFallback = true;
            bpm = this.estimateBPM(safeNotes);
        }

        if (!this._durationCache) {
            usedFallback = true;
            let normalDuration = 0;
            for (let i = 0; i < safeNotes.length; i++) {
                const n = safeNotes[i];
                const end = n.time + (n.duration || 0.15);
                if (end > normalDuration) normalDuration = end;
            }
            const simpleNotes = this._simpleModeCache || this._simplifyByMerge(safeNotes);
            this._simpleModeCache = simpleNotes;
            let simpleDuration = 0;
            for (let i = 0; i < simpleNotes.length; i++) {
                const n = simpleNotes[i];
                const end = n.time + (n.duration || 0.15);
                if (end > simpleDuration) simpleDuration = end;
            }
            this._durationCache = { normal: normalDuration, simple: simpleDuration };
        }

        this.songBPM = bpm;
        const precomputeEnd = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
        const precomputeMs = precomputeEnd - precomputeStart;
        const precomputeMode = usedWorker ? (usedFallback ? 'mixed' : 'worker') : 'fallback';
        this._setPrecomputePerfDebug(precomputeMode, precomputeMs, safeNotes.length);
    }

    async _initWasmMath() {
        if (typeof WebAssembly === 'undefined') {
            this._wasmStatus = 'unsupported';
            this._updatePerfDebugStatus();
            return;
        }
        try {
            const response = await fetch('note-math.wasm?v=1');
            if (!response.ok) {
                this._wasmStatus = 'fetch-failed';
                this._updatePerfDebugStatus();
                return;
            }
            const bytes = await response.arrayBuffer();
            const { instance } = await WebAssembly.instantiate(bytes);
            if (instance && instance.exports) {
                this._wasmMath = instance.exports;
                this._wasmStatus = 'ready';
                this._updatePerfDebugStatus();
                return;
            }
            this._wasmStatus = 'invalid';
            this._updatePerfDebugStatus();
        } catch (_) {
            this._wasmMath = null;
            this._wasmStatus = 'error';
            this._updatePerfDebugStatus();
        }
    }

    _visibleNoteHeight(duration, speedMultiplier) {
        const dur = duration || 0.15;
        if (this._wasmMath && typeof this._wasmMath.note_visible_height === 'function') {
            if (!this._wasmInUse) {
                this._wasmInUse = true;
                this._updatePerfDebugStatus();
            }
            return this._wasmMath.note_visible_height(dur, this.noteSpeed, 1);
        }
        return Math.max(12, dur * this.noteSpeed);
    }

    _drawNoteHeight(duration, speedMultiplier, noteGap = 4) {
        const dur = duration || 0.15;
        if (this._wasmMath && typeof this._wasmMath.note_draw_height === 'function') {
            if (!this._wasmInUse) {
                this._wasmInUse = true;
                this._updatePerfDebugStatus();
            }
            return this._wasmMath.note_draw_height(dur, this.noteSpeed, 1, noteGap);
        }
        return Math.max(12, dur * this.noteSpeed - noteGap);
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
        this.initOnlineSequencer();
        this.initSoundPanel();
        this.initGameSettings();
        this._loadSettings();
        this._ensureSoundfontLoaded();
        if (this._isMicPracticeMode()) {
            this._setMicPracticeIdleStatus();
            this._syncMicPracticeState();
        }

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
            const settingsPanel = document.getElementById('settingsPanelsBody');
            const settingsBtn = document.getElementById('settingsMenuBtn');
            if (settingsPanel && settingsBtn && !settingsPanel.classList.contains('collapsed') && !settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
                settingsPanel.classList.add('collapsed');
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
                if (!isAuto && mode === 'micpractice' && !this.isPlaying && !this.isPaused) {
                    this.statusMessage.textContent = 'Mic Practice armed: press Play and allow microphone access.';
                }
                // If playing, apply the auto/manual switch
                if (this.isPlaying && !this.isPaused) {
                    if (isAuto) this.startAutoPlay();
                    else this._switchToManual();
                }
                this._syncMicPracticeState();
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

    _isManualPracticeMode() {
        return !this.isAutoPlay && (this.gameMode === 'practice' || this.gameMode === 'micpractice');
    }

    _isMicPracticeMode() {
        return !this.isAutoPlay && this.gameMode === 'micpractice';
    }

    _getModeDisplayName() {
        if (this.gameMode === 'micpractice') return 'Mic Practice';
        if (this.gameMode === 'practice') return 'Practice mode';
        if (this.gameMode === 'coplay') return 'Co-Play';
        if (this.gameMode === 'simple') return 'Simple mode';
        return this.isAutoPlay ? 'Auto Play' : 'Game';
    }

    _getMicPracticeErrorMessage(err) {
        if (!err) return 'Mic Practice unavailable: Unable to access the microphone.';
        if (err.name === 'NotAllowedError' || /permission denied/i.test(err.message || '')) {
            return 'Mic blocked: allow microphone access for this site, then press Play again.';
        }
        if (err.name === 'NotFoundError') {
            return 'Mic unavailable: no microphone was found on this device.';
        }
        return `Mic Practice unavailable: ${err.message || 'Unable to access the microphone.'}`;
    }

    _frequencyToNoteName(frequency) {
        if (!Number.isFinite(frequency) || frequency <= 0) return null;
        const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
        return this._midiToNoteName(midi);
    }

    _incrementCount(map, key) {
        map.set(key, (map.get(key) || 0) + 1);
    }

    _getHitCount(noteName) {
        return this.practiceHitCounts.get(noteName) || 0;
    }

    _getExpectedCount(noteName) {
        return this.practiceExpectedCounts.get(noteName) || 0;
    }

    _hasRemainingPracticeHits(noteName) {
        return this._getHitCount(noteName) < this._getExpectedCount(noteName);
    }

    _clearPracticeState() {
        this.practiceWaiting = false;
        this.practiceExpectedNotes = new Set();
        this.practiceHitNotes = new Set();
        this.practiceExpectedCounts = new Map();
        this.practiceHitCounts = new Map();
        this.practiceChordTime = null;
    }

    _getActivePracticeNotes() {
        const activeNotes = new Set();
        for (const key of this.heldKeys) {
            const note = this.keyToNote[key];
            if (note) activeNotes.add(note);
        }
        document.querySelectorAll('.key.active').forEach((el) => {
            const note = el.dataset.note;
            if (note) activeNotes.add(note);
        });
        return activeNotes;
    }

    _completePracticeChord() {
        if (this.practiceChordTime == null || this.practiceExpectedNotes.size === 0) return false;

        const targets = this.fallingNotes.filter(
            n => !n.hit && !n.missed && this.practiceExpectedNotes.has(n.note) && Math.abs(n.time - this.practiceChordTime) < 0.03
        );
        if (targets.length === 0) return false;

        for (const target of targets) {
            target.hit = true;
            this.combo++;
            this.hitNotes++;
            this.score += Math.floor(100 * this._getMultiplier());
            this.updateScore();
            this.showHitFeedback(target.note, true, 1);
        }

        if (this._practiceHighlighted) {
            for (const noteName of this._practiceHighlighted) {
                const el = this._keyElementCache && this._keyElementCache[noteName];
                if (el) el.classList.remove('practice-target');
            }
            this._practiceHighlighted = null;
        }

        this._clearPracticeState();
        return true;
    }

    _tryResolvePracticeChord() {
        if (this.gameMode !== 'practice' || !this.practiceWaiting || this.practiceExpectedNotes.size === 0) {
            return false;
        }

        const activeNotes = this._getActivePracticeNotes();
        for (const noteName of this.practiceExpectedNotes) {
            if (!activeNotes.has(noteName)) return false;
        }

        return this._completePracticeChord();
    }

    _totalCount(map) {
        let total = 0;
        for (const value of map.values()) total += value;
        return total;
    }

    _countMapsEqual(a, b) {
        if (a.size !== b.size) return false;
        for (const [key, value] of a) {
            if (b.get(key) !== value) return false;
        }
        return true;
    }

    _setMicPracticeStatus(message) {
        if (!this.statusMessage.classList.contains('mic-practice-status')) {
            this.statusMessage.textContent = '';
            this.statusMessage.classList.add('mic-practice-status');

            const leftSpacer = document.createElement('span');
            leftSpacer.className = 'mic-practice-note-spacer';

            const main = document.createElement('span');
            main.className = 'mic-practice-main';

            const note = document.createElement('span');
            note.className = 'mic-practice-note';

            this.statusMessage.append(leftSpacer, main, note);
        }

        const main = this.statusMessage.querySelector('.mic-practice-main');
        const note = this.statusMessage.querySelector('.mic-practice-note');
        if (main) main.textContent = message;
        if (note) {
            note.textContent = this.micDetectedNote ? `mic: ${this.micDetectedNote}` : 'mic: --';
            note.classList.toggle('is-empty', !this.micDetectedNote);
        }
    }

    _setMicPracticeIdleStatus() {
        const message = this.notes.length > 0
            ? 'Mic Practice: press Play when ready'
            : 'Mic Practice: select a song';
        this._setMicPracticeStatus(message);
    }

    _setSongLoadedStatus(message) {
        if (this._isMicPracticeMode()) {
            this._setMicPracticeIdleStatus();
            this._syncMicPracticeState();
        } else {
            this._clearMicPracticeStatusLayout();
            this.statusMessage.textContent = message;
        }
    }

    _clearMicPracticeStatusLayout() {
        this.statusMessage.classList.remove('mic-practice-status');
    }

    async _ensurePitchDetector() {
        if (this.pitchDetector) return this.pitchDetector;
        if (!this.pitchfinderPromise) {
            this.pitchfinderPromise = import('https://cdn.jsdelivr.net/npm/pitchfinder@2.3.2/+esm');
        }
        this.pitchfinderModule = await this.pitchfinderPromise;
        this.pitchDetector = this.pitchfinderModule.YIN({
            sampleRate: this.audioContext.sampleRate,
            threshold: 0.12,
            probabilityThreshold: 0.9,
        });
        return this.pitchDetector;
    }

    async _startMicPracticeDetection() {
        if (this.micDetectionFrame || this.micStartPromise) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Microphone input is not supported in this browser.');
        }

        this._clearMicPracticeStatusLayout();
        this.statusMessage.textContent = 'Mic Practice: requesting microphone access...';

        this.micStartPromise = (async () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.setupAudioGraph();
                if (this.soundfontRawData && !this.soundfontLoaded) {
                    this._decodeSoundfontSamples(this.soundfontRawData);
                }
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            await this._ensurePitchDetector();

            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                }
            });

            this.micSourceNode = this.audioContext.createMediaStreamSource(this.micStream);
            this.micAnalyser = this.audioContext.createAnalyser();
            this.micAnalyser.fftSize = 4096;
            this.micBuffer = new Float32Array(this.micAnalyser.fftSize);
            this.micSourceNode.connect(this.micAnalyser);
            this.micDetectedNote = null;
            this.micLastDetectedNote = null;
            this.micLastDetectedAt = 0;
            this.micCandidateNote = null;
            this.micCandidateSince = 0;
            if (this.isPlaying) {
                this._setMicPracticeStatus('Mic Practice: microphone ready. Play the highlighted notes.');
            } else {
                this._setMicPracticeIdleStatus();
            }
            this._runMicPracticeDetection();
        })();

        try {
            await this.micStartPromise;
        } finally {
            this.micStartPromise = null;
        }
    }

    _stopMicPracticeDetection() {
        if (this.micDetectionFrame) {
            cancelAnimationFrame(this.micDetectionFrame);
            this.micDetectionFrame = null;
        }
        if (this.micSourceNode) {
            try { this.micSourceNode.disconnect(); } catch (e) {}
            this.micSourceNode = null;
        }
        if (this.micAnalyser) {
            try { this.micAnalyser.disconnect(); } catch (e) {}
            this.micAnalyser = null;
        }
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }
        this.micBuffer = null;
        this.micDetectedNote = null;
        this.micLastDetectedNote = null;
        this.micLastDetectedAt = 0;
        this.micCandidateNote = null;
        this.micCandidateSince = 0;
        this._clearMicPracticeStatusLayout();
    }

    _runMicPracticeDetection() {
        if (!this._isMicPracticeMode() || this.isPaused || !this.micAnalyser || !this.micBuffer || !this.pitchDetector) {
            this.micDetectionFrame = null;
            return;
        }

        this.micAnalyser.getFloatTimeDomainData(this.micBuffer);

        let energy = 0;
        for (let i = 0; i < this.micBuffer.length; i++) {
            const sample = this.micBuffer[i];
            energy += sample * sample;
        }
        const rms = Math.sqrt(energy / this.micBuffer.length);
        const frequency = rms > 0.015 ? this.pitchDetector(this.micBuffer) : null;
        const detectedNote = this._frequencyToNoteName(frequency);
        const now = performance.now();

        if (detectedNote) {
            this.micLastDetectedNote = detectedNote;
            this.micLastDetectedAt = now;
        }
        this.micDetectedNote = detectedNote || (
            this.micLastDetectedNote && now - this.micLastDetectedAt <= this.micDetectedNoteHoldMs
                ? this.micLastDetectedNote
                : null
        );

        if (!this.isPlaying) {
            this._setMicPracticeIdleStatus();
        }

        if (this.practiceWaiting && detectedNote && this.practiceExpectedNotes.has(detectedNote) && this._hasRemainingPracticeHits(detectedNote)) {
            if (this.micCandidateNote !== detectedNote) {
                this.micCandidateNote = detectedNote;
                this.micCandidateSince = now;
            } else if (now - this.micCandidateSince >= 90) {
                this._practiceHitNote(detectedNote);
                this.micCandidateNote = null;
                this.micCandidateSince = 0;
            }
        } else if (this.micCandidateNote && this.micCandidateNote !== detectedNote) {
            this.micCandidateNote = null;
            this.micCandidateSince = 0;
        }

        this.micDetectionFrame = requestAnimationFrame(() => this._runMicPracticeDetection());
    }

    _syncMicPracticeState() {
        if (this._isMicPracticeMode() && !this.isPaused) {
            this._startMicPracticeDetection().catch((err) => {
                console.error('[PianoHero] Mic practice failed to start', err);
                this.reset();
                this.statusMessage.textContent = this._getMicPracticeErrorMessage(err);
            });
            if (!this.isPlaying && this.micAnalyser) {
                this._setMicPracticeIdleStatus();
            }
            return;
        }
        this._stopMicPracticeDetection();
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

        this._noteIndexMap = {};
        for (let i = 0; i < this.allNotes.length; i++) {
            this._noteIndexMap[this.allNotes[i]] = i;
        }

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
        const fullHeight = container.clientHeight;
        container.style.width = fullWidth + 'px';
        this.canvas.width = fullWidth;
        this.canvas.height = fullHeight;
        if (this.noteRenderer) {
            // Pixi owns the pixiCanvas backing buffer (its width/height depend on
            // the active resolution). Just hand it the CSS size — do NOT also
            // set pixiCanvas.width/height directly, or we'll clobber the resolution
            // multiplier and desync drawing coords from layout.
            this.noteRenderer.resize(fullWidth, fullHeight);
            // Keep CSS size in sync so the canvas lays out next to the 2D one.
            if (this.pixiCanvas) {
                this.pixiCanvas.style.width = fullWidth + 'px';
                this.pixiCanvas.style.height = fullHeight + 'px';
            }
        } else if (this.pixiCanvas) {
            this.pixiCanvas.width = fullWidth;
            this.pixiCanvas.height = fullHeight;
        }
        if (this.pianoFx && this.fxCanvas) {
            // Extend the FX overlay down to cover the keyboard so effects
            // (sparkles, fog, fire) can render on top of the piano keys.
            const pianoEl = document.querySelector('.piano-keys');
            const pianoH = pianoEl ? pianoEl.offsetHeight : 120;
            const fxHeight = fullHeight + pianoH;
            this.fxCanvas.style.width = fullWidth + 'px';
            this.fxCanvas.style.height = fxHeight + 'px';
            this.pianoFx.resize(fullWidth, fxHeight);
            // Tell pianoFx how far above the canvas bottom the keyboard top
            // sits, so the glow ribbon / hit line stay anchored to the
            // keyboard edge instead of dropping to the window bottom.
            if (typeof this.pianoFx.setKeyboardOffset === 'function') {
                this.pianoFx.setKeyboardOffset(pianoH);
            }
        }
        this.hitZoneY = this.canvas.height;
        this.keyPositions = this.calculateKeyPositions();
        this._laneCacheDirty = true;
    }

    _emitPianoFxForNote(note, velocity = 1, duration = null) {
        if (!this.pianoFx || !this.pianoFx.isReady) return;
        const pos = this.keyPositions && this.keyPositions[note];
        if (!pos) return;
        const noteIdx = (this._noteIndexMap && this._noteIndexMap[note] != null)
            ? this._noteIndexMap[note]
            : 0;
        const totalKeys = this.allNotes && this.allNotes.length > 1 ? this.allNotes.length - 1 : 1;
        const keyIndex = Math.round((noteIdx / totalKeys) * 87);
        const x = pos.left + pos.width / 2;
        const y = this.canvas.height - 10;
        this.pianoFx.onKeyPress(x, y, keyIndex, velocity);
        this._applyFxKeyFill(note, x, velocity, duration);
    }

    _applyFxKeyFill(note, x, velocity = 1, duration = null) {
        if (this.keyPressTint !== 'glow') return;
        const keyElement = document.querySelector(`.key[data-note="${note}"]`);
        if (!keyElement || !this.canvas || !this.canvas.width) return;
        const t = Math.max(0, Math.min(1, x / this.canvas.width));
        const start = Number.isFinite(this.fxGlowlineHueStart) ? this.fxGlowlineHueStart : 0;
        const end = Number.isFinite(this.fxGlowlineHueEnd) ? this.fxGlowlineHueEnd : start;
        const hue = (start + (end - start) * t + 360) % 360;
        const sat = Number.isFinite(this.fxKeyGlowSat) ? this.fxKeyGlowSat : 70;
        const val = Number.isFinite(this.fxKeyGlowVal) ? this.fxKeyGlowVal : 100;
        const [r, g, b] = this._hsvToRgb255(hue, sat, val);
        const bottom = this._hsvToRgb255(hue, sat, Math.max(0, val - 14));
        const alpha = Math.min(0.46, 0.24 + Math.max(0, Math.min(1, velocity)) * 0.18);
        keyElement.style.setProperty('--fx-key-fill-top', `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`);
        keyElement.style.setProperty('--fx-key-fill-bottom', `rgba(${bottom[0]}, ${bottom[1]}, ${bottom[2]}, ${(alpha * 0.72).toFixed(2)})`);
        keyElement.style.setProperty('--fx-key-glow-shadow', `rgba(${r}, ${g}, ${b}, ${(alpha * 0.9).toFixed(2)})`);
        keyElement.classList.add('fx-key-glow-fill');

        const existingTimer = this._fxKeyFillTimers.get(note);
        if (existingTimer) clearTimeout(existingTimer);
        if (duration != null) {
            const flashMs = 240;
            this._fxKeyFillTimers.set(note, setTimeout(() => this._clearFxKeyFill(note), flashMs));
        } else {
            this._fxKeyFillTimers.delete(note);
        }
    }

    _clearFxKeyFill(note) {
        const existingTimer = this._fxKeyFillTimers.get(note);
        if (existingTimer) clearTimeout(existingTimer);
        this._fxKeyFillTimers.delete(note);
        const keyElement = document.querySelector(`.key[data-note="${note}"]`);
        if (!keyElement) return;
        keyElement.classList.remove('fx-key-glow-fill');
        keyElement.style.removeProperty('--fx-key-fill-top');
        keyElement.style.removeProperty('--fx-key-fill-bottom');
        keyElement.style.removeProperty('--fx-key-glow-shadow');
    }

    _cleanupFxKeyFills() {
        document.querySelectorAll('.key.fx-key-glow-fill').forEach(keyElement => {
            const note = keyElement.dataset.note;
            if (!note) return;
            if (this._fxKeyFillTimers.has(note)) return;
            if (keyElement.classList.contains('active')) return;
            if (this.activeNoteSources.has(note)) return;
            this._clearFxKeyFill(note);
        });
    }

    _clearAllFxKeyFills() {
        for (const note of Array.from(this._fxKeyFillTimers.keys())) {
            this._clearFxKeyFill(note);
        }
        document.querySelectorAll('.key.fx-key-glow-fill').forEach(keyElement => {
            const note = keyElement.dataset.note;
            if (note) this._clearFxKeyFill(note);
        });
    }

    _syncPianoFxKeyCenters() {
        if (!this.pianoFx || typeof this.pianoFx.setKeyCenters !== 'function' || !this.keyPositions) return;
        const width = this.canvas && this.canvas.width ? this.canvas.width : 1;
        const centers = new Array(88);
        const count = Math.max(1, (this.allNotes && this.allNotes.length) || 1);
        for (let i = 0; i < 88; i++) {
            const noteIndex = Math.round((i / 87) * (count - 1));
            const note = this.allNotes[noteIndex];
            const pos = this.keyPositions[note];
            centers[i] = pos ? (pos.left + pos.width / 2) / width : (i + 0.5) / 88;
        }
        this.pianoFx.setKeyCenters(centers);
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

        requestAnimationFrame(() => this._syncPianoFxKeyCenters());
        
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

                if (btn.dataset.tab === 'onlineseq') {
                    const resultBox = document.getElementById('onlineseqResults');
                    if (resultBox && !resultBox.childElementCount) {
                        this.searchOnlineSequencer({ resetStart: true });
                    }
                }
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
            await this._precomputeSongData(data.notes);
            this.updateBPMDisplay();
            this.applyGameMode();
            // Fully reset playback state so the new song starts from t=0 instead of
            // inheriting fallingNotes / startTime from the previously played song.
            this.reset();
            this.updateProgress(100);
            this._setSongLoadedStatus(`Loaded "${data.filename}" — ${data.noteCount} notes. Press Play!`);
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

    initOnlineSequencer() {
        const searchBtn = document.getElementById('onlineseqSearchBtn');
        const queryInput = document.getElementById('onlineseqQuery');
        const cookieStatus = document.getElementById('onlineseqCookieStatus');

        if (cookieStatus) cookieStatus.textContent = 'Waiting for you to click the bookmark on an Online Sequencer page\u2026';

        const openSearch = () => {
            const q = (queryInput && queryInput.value.trim()) || '';
            const url = q
                ? `https://onlinesequencer.net/sequences?search=${encodeURIComponent(q)}`
                : 'https://onlinesequencer.net/sequences';
            window.open(url, '_blank', 'noopener,noreferrer');
        };
        if (searchBtn) searchBtn.addEventListener('click', openSearch);
        if (queryInput) queryInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') openSearch(); });

        this._startUploadPoll();
        this._installBookmarklet();
    }

    _installBookmarklet() {
        const link = document.getElementById('onlineseqBookmarklet');
        if (!link) return;
        // Bookmarklet source. Runs in user's browser on onlinesequencer.net.
        // The site generates the MIDI client-side via window.exportMidi(), then
        // triggers a browser download. We monkey-patch URL.createObjectURL and
        // anchor.click so we capture the Blob before the download fires, then
        // POST it to http://localhost:5000/api/onlineseq/upload_midi.
        const src = function () {
            var m = location.pathname.match(/^\/(\d+)/);
            if (!m) { alert('Open an Online Sequencer sequence page first (URL like onlinesequencer.net/123456).'); return; }
            var id = m[1];
            var title = (document.title || '').replace(/\s*[\-\u2013|]\s*Online Sequencer.*$/i, '').trim() || ('Sequence ' + id);
            function toast(msg, bg) {
                var b = document.createElement('div');
                b.style.cssText = 'position:fixed;top:20px;right:20px;background:' + bg + ';color:white;padding:10px 16px;border-radius:6px;font:bold 13px sans-serif;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,.5);max-width:420px;white-space:pre-wrap';
                b.textContent = msg;
                document.body.appendChild(b);
                setTimeout(function () { b.remove(); }, 7000);
            }
            function send(blob) {
                if (!blob || blob.size < 14) { toast('\u2717 Captured blob was empty or too small (' + (blob ? blob.size : 0) + ' bytes)', '#dc2626'); return; }
                blob.slice(0, 4).arrayBuffer().then(function (buf) {
                    var b = new Uint8Array(buf);
                    if (!(b[0] === 0x4D && b[1] === 0x54 && b[2] === 0x68 && b[3] === 0x64)) {
                        toast('\u2717 Captured blob is not a MIDI file (first bytes: ' + b[0].toString(16) + ' ' + b[1].toString(16) + ' ' + b[2].toString(16) + ' ' + b[3].toString(16) + ')', '#dc2626');
                        return;
                    }
                    var fd = new FormData();
                    fd.append('midi', blob, id + '.mid');
                    fd.append('sequenceId', id);
                    fd.append('name', title);
                    fetch('http://localhost:5000/api/onlineseq/upload_midi', { method: 'POST', body: fd })
                        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
                        .then(function (x) {
                            if (x.ok && x.d.ok) toast('\u2713 Sent to Piano Hero: ' + x.d.savedAs, '#22c55e');
                            else toast('\u2717 Piano Hero rejected: ' + (x.d.error || JSON.stringify(x.d)), '#dc2626');
                        })
                        .catch(function (e) { toast('\u2717 Could not reach Piano Hero (is the server running?): ' + e.message, '#dc2626'); });
                });
            }
            // Try direct function call first
            var fn = window.exportMidi || (window.app && window.app.exportMidi);
            if (typeof fn !== 'function') {
                toast('\u2717 exportMidi() not found on this page. Make sure the sequence is fully loaded (click anywhere on it first).', '#dc2626');
                return;
            }
            // Monkey-patch capture. Hook three places because we don't know
            // exactly how the site delivers the blob:
            //   1) Blob constructor — fires whenever site builds the binary
            //   2) URL.createObjectURL — fires if site converts blob -> url
            //   3) anchor.click — fires if site triggers a download <a>
            var captured = false;
            function tryCapture(blob, source) {
                if (captured || !(blob instanceof Blob) || blob.size < 14) return;
                blob.slice(0, 4).arrayBuffer().then(function (buf) {
                    var b = new Uint8Array(buf);
                    if (b[0] === 0x4D && b[1] === 0x54 && b[2] === 0x68 && b[3] === 0x64) {
                        captured = true;
                        console.log('[PianoHero] captured MIDI blob via', source, 'size=', blob.size);
                        send(blob);
                    }
                }).catch(function () { /* ignore */ });
            }
            var OrigBlob = window.Blob;
            var PatchedBlob = function (parts, opts) {
                var b = new OrigBlob(parts || [], opts || {});
                tryCapture(b, 'Blob()');
                return b;
            };
            PatchedBlob.prototype = OrigBlob.prototype;
            window.Blob = PatchedBlob;
            var origCreate = URL.createObjectURL;
            URL.createObjectURL = function (obj) {
                tryCapture(obj, 'createObjectURL');
                return origCreate.call(URL, obj);
            };
            var origClick = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function () {
                if (!captured && this.href && this.href.indexOf('data:') === 0) {
                    fetch(this.href).then(function (r) { return r.blob(); }).then(function (b) { tryCapture(b, 'anchor data-url'); }).catch(function () { });
                }
                return origClick.call(this);
            };
            toast('Calling exportMidi()\u2026', '#0ea5e9');
            try { fn(); } catch (e) {
                window.Blob = OrigBlob;
                URL.createObjectURL = origCreate;
                HTMLAnchorElement.prototype.click = origClick;
                toast('\u2717 exportMidi() threw: ' + e.message, '#dc2626');
                return;
            }
            // Restore patches after a delay (whether or not we captured)
            setTimeout(function () {
                window.Blob = OrigBlob;
                URL.createObjectURL = origCreate;
                HTMLAnchorElement.prototype.click = origClick;
                if (!captured) toast('\u2717 exportMidi() ran but no MIDI Blob was captured.\nCheck DevTools console — was a Blob created at all?', '#dc2626');
            }, 4000);
        };
        // Serialize: IIFE wrapper + javascript: scheme. URL-encode so that '#'
        // characters (CSS color literals) and other URL-special chars don't
        // get truncated by the browser when stored as a bookmark.
        const body = '(' + src.toString() + ')();';
        link.href = 'javascript:' + encodeURI(body).replace(/#/g, '%23');
        // Prevent navigation when user accidentally clicks it inside Piano Hero
        link.addEventListener('click', (e) => {
            e.preventDefault();
            alert('Drag this link to your browser bookmarks bar, then click it from any Online Sequencer sequence page.');
        });
    }

    _startUploadPoll() {
        if (this._uploadStream) return;
        // Subscribe to the server's Server-Sent Events stream. The server
        // pushes a message whenever the bookmarklet uploads a new MIDI —
        // no polling required.
        try {
            const es = new EventSource('/api/onlineseq/upload_stream');
            this._uploadStream = es;
            es.onmessage = async (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    if (data && data.success && data.notes) {
                        await this._applyUploadedSong(data);
                    }
                } catch (_) { /* ignore malformed payload */ }
            };
            es.onerror = () => {
                // Browser will auto-reconnect; nothing to do here.
            };
        } catch (_) { /* EventSource unavailable */ }
    }

    async _applyUploadedSong(data) {
        try {
            this.stopPreview && this.stopPreview();
        } catch (_) {}
        const dropdown = document.getElementById('songBrowserDropdown');
        if (dropdown) dropdown.classList.add('hidden');

        const displayName = (data.savedAs || `Sequence ${data.sequenceId}`).replace(/\.mid$/i, '');
        const songNameEl = document.getElementById('midiListHeaderText');
        if (songNameEl) { songNameEl.textContent = displayName; songNameEl.title = displayName; }

        this.originalNotes = data.notes;
        await this._precomputeSongData(data.notes);
        this.updateBPMDisplay();
        this.applyGameMode();
        this.reset();

        this._setSongLoadedStatus(`Loaded "${displayName}" from bookmarklet \u2014 ${data.noteCount} notes. Press Play!`);
        const cookieStatus = document.getElementById('onlineseqCookieStatus');
        const spinner = document.getElementById('onlineseqStatusSpinner');
        if (cookieStatus) cookieStatus.textContent = `\u2713 Loaded "${displayName}" \u2014 click your bookmark again for the next song.`;
        if (spinner) spinner.textContent = '\u2713';
        // Revert to waiting state after a few seconds
        setTimeout(() => {
            if (cookieStatus) cookieStatus.textContent = 'Waiting for you to click the bookmark on an Online Sequencer page\u2026';
            if (spinner) spinner.textContent = '\u23F2';
        }, 5000);
        this._updateControlButtons && this._updateControlButtons();
        this.refreshMidiFileList && this.refreshMidiFileList();
    }

    _buildOnlineSeqBrowseUrl() {
        const queryInput = document.getElementById('onlineseqQuery');
        const query = queryInput ? queryInput.value.trim() : this.onlineSeqState.query;
        const params = new URLSearchParams();

        if (query) params.set('search', query);
        if (this.onlineSeqState.start > 0) params.set('start', String(this.onlineSeqState.start));

        const filterParams = this._onlineSeqFilterToParams(this.onlineSeqState.activeFilter);
        Object.entries(filterParams).forEach(([k, v]) => params.set(k, v));

        const qs = params.toString();
        return `https://onlinesequencer.net/sequences${qs ? `?${qs}` : ''}`;
    }

    _onlineSeqFilterToParams(filterKey) {
        const map = {
            recently_shared: { sort: 'recently' },
            oldest: { sort: 'oldest' },
            popular: { sort: 'popular' },
            most_notes: { sort: 'notes' },
            longest: { sort: 'longest' },
            today: { time: 'today' },
            this_week: { time: 'week' },
            this_month: { time: 'month' },
            all_time: { time: 'all' },
            featured: { featured: '1' },
            registered_only: { registered: '1' },
        };
        return map[filterKey] || {};
    }

    _updateOnlineSeqPager() {
        const prevBtn = document.getElementById('onlineseqPrevBtn');
        const nextBtn = document.getElementById('onlineseqNextBtn');
        const pageInfo = document.getElementById('onlineseqPageInfo');
        if (!prevBtn || !nextBtn || !pageInfo) return;

        prevBtn.disabled = this.onlineSeqState.start <= 0;
        nextBtn.disabled = !this.onlineSeqState.hasMore;
        pageInfo.textContent = `Start: ${this.onlineSeqState.start}`;
    }

    async searchOnlineSequencer({ resetStart = false, deltaStart = 0 } = {}) {
        const queryInput = document.getElementById('onlineseqQuery');
        const container = document.getElementById('onlineseqResults');
        if (!queryInput || !container) return;

        const query = queryInput.value.trim();
        this.onlineSeqState.query = query;

        if (resetStart) this.onlineSeqState.start = 0;
        if (deltaStart !== 0) this.onlineSeqState.start = Math.max(0, this.onlineSeqState.start + deltaStart);

        const params = new URLSearchParams({ start: String(this.onlineSeqState.start) });
        if (query) params.set('q', query);
        if (this.onlineSeqState.cookie) params.set('cookie', this.onlineSeqState.cookie);

        const filterParams = this._onlineSeqFilterToParams(this.onlineSeqState.activeFilter);
        Object.entries(filterParams).forEach(([k, v]) => params.set(k, v));

        container.innerHTML = '<p class="bitmidi-loading">Searching Online Sequencer…</p>';

        try {
            const resp = await fetch(`${this.apiBaseUrl}/api/onlineseq/search?${params.toString()}`);
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Search failed');

            const results = Array.isArray(data.results) ? data.results : [];
            this.onlineSeqState.start = Number.isInteger(data.start) ? data.start : this.onlineSeqState.start;
            this.onlineSeqState.hasMore = Boolean(data.hasMore);
            this._updateOnlineSeqPager();

            if (!results.length) {
                container.innerHTML = '<p class="bitmidi-empty">No results found.</p>';
                return;
            }

            container.innerHTML = '';
            results.forEach(item => {
                const row = document.createElement('div');
                row.className = 'bitmidi-item onlineseq-item';
                const noteLabel = item.notesLabel ? `<span class="onlineseq-notes">${this.escapeHtml(item.notesLabel)}</span>` : '';
                row.innerHTML = `
                    <span class="bitmidi-name" title="${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)} ${noteLabel}</span>
                    <a class="onlineseq-open-btn" href="https://onlinesequencer.net/${encodeURIComponent(item.sequenceId)}" target="_blank" rel="noopener noreferrer" title="Open on Online Sequencer">Open</a>
                    <button class="bitmidi-load-btn">Load</button>
                `;

                row.querySelector('.bitmidi-load-btn').addEventListener('click', () => {
                    this.loadOnlineSequencer(item.sequenceId, item.name);
                });
                container.appendChild(row);
            });
        } catch (err) {
            container.innerHTML = `<p class="bitmidi-empty">Error: ${this.escapeHtml(err.message)}</p>`;
            this.onlineSeqState.hasMore = false;
            this._updateOnlineSeqPager();
        }
    }

    async loadOnlineSequencer(sequenceId, name) {
        this.stopPreview();
        document.getElementById('songBrowserDropdown').classList.add('hidden');

        const songNameEl = document.getElementById('midiListHeaderText');
        songNameEl.textContent = name;
        songNameEl.title = name;

        this.statusMessage.textContent = `Loading "${name}" from Online Sequencer…`;
        this.progressBar.classList.add('visible');
        this.updateProgress(20);

        try {
            const resp = await fetch(`${this.apiBaseUrl}/api/onlineseq/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sequenceId, name, cookie: this.onlineSeqState.cookie || undefined })
            });

            this.updateProgress(70);

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error || 'Failed to load sequence');
            }

            const data = await resp.json();
            this.originalNotes = data.notes;
            this.songBPM = this.estimateBPM(data.notes);
            this.updateBPMDisplay();
            this.applyGameMode();
            this.reset();
            this.updateProgress(100);

            const savedName = data.savedAs ? ` (saved as "${data.savedAs}")` : '';
            this._setSongLoadedStatus(`Loaded "${name}"${savedName} — ${data.noteCount} notes. Press Play!`);
            this._updateControlButtons();
            this.refreshMidiFileList();
        } catch (err) {
            console.error('Online Sequencer load error:', err);
            this.statusMessage.textContent = 'Error: ' + err.message;
        } finally {
            setTimeout(() => this.progressBar.classList.remove('visible'), 1000);
        }
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
            this.reset();
            this.updateProgress(100);
            const savedName = data.savedAs ? ` (saved as "${data.savedAs}")` : '';
            this._setSongLoadedStatus(`Loaded "${name}"${savedName} — ${data.noteCount} notes. Press Play!`);
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
        document.getElementById('settingsMenuBtn').addEventListener('click', (e) => {
            e.stopPropagation();
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
                this._syncSoundBankInstrumentState();
                if (this.currentSampleBank !== 'Salamander') this.loadSalamander();
            } else {
                this.useSalamander = false;
                this._syncSoundBankInstrumentState();
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

        const timingFeedbackModeSelect = document.getElementById('timingFeedbackModeSelect');
        if (timingFeedbackModeSelect) {
            timingFeedbackModeSelect.addEventListener('change', () => {
                const mode = timingFeedbackModeSelect.value;
                this.showTimingFeedback = mode !== 'none';
                this.timingFeedbackMode = this.showTimingFeedback ? mode : 'individual';
                if (!this.showTimingFeedback && this._timingFeedbackCenterEl) {
                    this._timingFeedbackCenterEl.classList.remove('visible');
                }
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
        this._syncSoundBankInstrumentState();
        this._soundInitDeferred = true;
    }

    _syncSoundBankInstrumentState() {
        const soundBankSelect = document.getElementById('soundBankSelect');
        const presetSelect = document.getElementById('soundPreset');
        if (!soundBankSelect || !presetSelect) return;
        const salamanderActive = soundBankSelect.value === 'Salamander';
        presetSelect.disabled = salamanderActive;
        const instrumentRow = presetSelect.closest('.sound-row');
        if (instrumentRow) instrumentRow.classList.toggle('is-disabled', salamanderActive);
    }

    // Called after _loadSettings to ensure a soundfont is loaded if settings didn't trigger one
    _ensureSoundfontLoaded() {
        if (!this.soundfontLoading && !this.soundfontLoaded && !this.salamanderLoaded &&
            Object.keys(this.soundfontBuffers).length === 0 &&
            Object.keys(this.salamanderBuffers).length === 0) {
            const currentBank = document.getElementById('soundBankSelect').value;
            if (currentBank === 'Salamander') {
                this.useSalamander = true;
                this._syncSoundBankInstrumentState();
                this.loadSalamander();
            } else {
                this._syncSoundBankInstrumentState();
                this.loadSoundfont(this.currentInstrument);
            }
        }
    }

    initGameSettings() {
        const graphicsPresetSelect = document.getElementById('graphicsPresetSelect');
        if (graphicsPresetSelect) {
            graphicsPresetSelect.addEventListener('change', () => {
                const preset = graphicsPresetSelect.value;
                if (preset === 'custom') {
                    this._setGraphicsPresetValue('custom');
                    this._saveSettings();
                    return;
                }
                this._applyGraphicsPreset(preset);
            });
        }

        const fxStreamSelect = document.getElementById('fxStreamSelect');
        if (fxStreamSelect) {
            fxStreamSelect.addEventListener('change', () => {
                this._applyFxStreamMode(fxStreamSelect.value);
            });
        }

        const fxStreamWidthSelect = document.getElementById('fxStreamWidthSelect');
        if (fxStreamWidthSelect) {
            fxStreamWidthSelect.addEventListener('change', () => {
                this._applyFxStreamWidth(fxStreamWidthSelect.value);
            });
        }

        const fxRibbonSelect = document.getElementById('fxRibbonSelect');
        if (fxRibbonSelect) {
            fxRibbonSelect.addEventListener('change', () => {
                this._applyFxRibbonMode(fxRibbonSelect.value);
            });
        }

        const fxSplashSelect = document.getElementById('fxSplashSelect');
        if (fxSplashSelect) {
            fxSplashSelect.addEventListener('change', () => {
                this._applyFxSplashMode(fxSplashSelect.value);
            });
        }

        const fxGlowSpreadSelect = document.getElementById('fxGlowSpreadSelect');
        if (fxGlowSpreadSelect) {
            fxGlowSpreadSelect.addEventListener('change', () => {
                this._applyFxGlowSpread(fxGlowSpreadSelect.value);
            });
        }

        const keyPressTintSelect = document.getElementById('keyPressTintSelect');
        if (keyPressTintSelect) {
            keyPressTintSelect.addEventListener('change', () => {
                this._applyKeyPressTint(keyPressTintSelect.value);
            });
            this._applyKeyPressTint(keyPressTintSelect.value, { skipSave: true });
        }

        const laneStyleSelect = document.getElementById('laneStyleSelect');
        if (laneStyleSelect) {
            laneStyleSelect.addEventListener('change', () => {
                this.laneStyle = laneStyleSelect.value;
                this._laneCacheDirty = true;
                this._saveSettings();
            });
        }

        const bindFxSlider = (id, valueId, suffix, setter) => {
            const slider = document.getElementById(id);
            const valueEl = document.getElementById(valueId);
            if (!slider || !valueEl) return;
            const update = (shouldSave) => {
                const v = parseInt(slider.value, 10) || 0;
                valueEl.textContent = v + suffix;
                setter(v);
                this._applyFxPalette({ skipSave: !shouldSave });
            };
            slider.addEventListener('input', () => update(true));
            update(false);
        };

        bindFxSlider('fxGlowHueStart', 'fxGlowHueStartVal', '°', (v) => { this.fxGlowlineHueStart = v; });
        bindFxSlider('fxGlowHueEnd', 'fxGlowHueEndVal', '°', (v) => { this.fxGlowlineHueEnd = v; });
        bindFxSlider('fxGlowSat', 'fxGlowSatVal', '%', (v) => { this.fxGlowlineSat = v; });
        bindFxSlider('fxGlowVal', 'fxGlowValVal', '%', (v) => { this.fxGlowlineVal = v; });
        bindFxSlider('fxSmokeHue', 'fxSmokeHueVal', '°', (v) => { this.fxSmokeHue = v; });
        bindFxSlider('fxSmokeSat', 'fxSmokeSatVal', '%', (v) => { this.fxSmokeSat = v; });
        bindFxSlider('fxSmokeVal', 'fxSmokeValVal', '%', (v) => { this.fxSmokeVal = v; });
        bindFxSlider('fxKeyGlowHue', 'fxKeyGlowHueVal', '°', (v) => { this.fxKeyGlowHue = v; });
        bindFxSlider('fxKeyGlowSat', 'fxKeyGlowSatVal', '%', (v) => { this.fxKeyGlowSat = v; });
        bindFxSlider('fxKeyGlowVal', 'fxKeyGlowValVal', '%', (v) => { this.fxKeyGlowVal = v; });
        bindFxSlider('keyPressTintHue', 'keyPressTintHueVal', '°', (v) => { this.keyPressTintHue = v; this._applyKeyPressTintColor(); });
        bindFxSlider('keyPressTintSat', 'keyPressTintSatVal', '%', (v) => { this.keyPressTintSat = v; this._applyKeyPressTintColor(); });
        bindFxSlider('keyPressTintVal', 'keyPressTintValVal', '%', (v) => { this.keyPressTintVal = v; this._applyKeyPressTintColor(); });

        const fxPaletteResetBtn = document.getElementById('fxPaletteResetBtn');
        if (fxPaletteResetBtn) {
            fxPaletteResetBtn.addEventListener('click', () => {
                this._resetFxPaletteToDefaults();
            });
        }

        const allSettingsResetBtn = document.getElementById('allSettingsResetBtn');
        if (allSettingsResetBtn) {
            allSettingsResetBtn.addEventListener('click', () => {
                this._resetAllSettingsToDefaults();
            });
        }

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
        const headerSpeedScrubber = document.getElementById('headerSpeedScrubber');
        const headerSpeedValue = document.getElementById('headerSpeedValue');
        const headerSpeedDialProgress = document.getElementById('headerSpeedDialProgress');
        const headerSpeedDialThumb = document.getElementById('headerSpeedDialThumb');
        const SPEED_MIN = 25;
        const SPEED_MAX = 150;
        const dialSweep = Math.PI * 1.5;
        const dialStart = Math.PI * 0.75;
        const dialCircumference = 2 * Math.PI * 16;
        const dialArcLength = dialCircumference * 0.75;

        const syncSpeedUi = (pct) => {
            speedSlider.value = pct;
            speedInput.value = pct;
            if (headerSpeedValue) headerSpeedValue.textContent = `${pct}`;
            if (headerSpeedScrubber) {
                headerSpeedScrubber.setAttribute('aria-valuenow', String(pct));
                headerSpeedScrubber.setAttribute('aria-valuetext', `${pct}% speed`);
            }
            const normalized = (pct - SPEED_MIN) / (SPEED_MAX - SPEED_MIN);
            if (headerSpeedDialProgress) {
                headerSpeedDialProgress.style.strokeDasharray = `${dialArcLength} ${dialCircumference}`;
                headerSpeedDialProgress.style.strokeDashoffset = String(dialArcLength * (1 - normalized));
            }
            if (headerSpeedDialThumb) {
                const theta = dialStart + (normalized * dialSweep);
                const thumbX = 20 + (16 * Math.cos(theta));
                const thumbY = 20 + (16 * Math.sin(theta));
                headerSpeedDialThumb.setAttribute('cx', thumbX.toFixed(2));
                headerSpeedDialThumb.setAttribute('cy', thumbY.toFixed(2));
            }
        };

        const applySpeed = (val) => {
            const pct = Math.max(SPEED_MIN, Math.min(SPEED_MAX, parseInt(val) || 100));
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
                this._hasLogicClock = false;
                this._logicAccumulatorSec = 0;
            }

            this.speedMultiplier = newSpeed;
            syncSpeedUi(pct);
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

        if (headerSpeedScrubber) {
            let dragState = null;
            const commitHeaderSpeed = () => {
                if (!dragState || !dragState.changed) return;
                this._saveSettings();
            };

            headerSpeedScrubber.addEventListener('pointerdown', (event) => {
                dragState = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    startPct: parseInt(speedSlider.value, 10) || 100,
                    axis: null,
                    changed: false,
                };
                headerSpeedScrubber.classList.add('dragging');
                headerSpeedScrubber.setPointerCapture(event.pointerId);
                event.preventDefault();
            });

            headerSpeedScrubber.addEventListener('pointermove', (event) => {
                if (!dragState || event.pointerId !== dragState.pointerId) return;
                const dx = event.clientX - dragState.startX;
                const dy = event.clientY - dragState.startY;
                if (!dragState.axis) {
                    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                    dragState.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
                }
                const primaryDelta = dragState.axis === 'x' ? dx : -dy;
                const deltaPct = Math.round(primaryDelta / 10) * 5;
                const clampedPct = Math.max(SPEED_MIN, Math.min(SPEED_MAX, dragState.startPct + deltaPct));
                if (clampedPct === (parseInt(speedSlider.value, 10) || 100)) return;
                dragState.changed = true;
                applySpeed(clampedPct);
            });

            const finishHeaderDrag = (event) => {
                if (!dragState || event.pointerId !== dragState.pointerId) return;
                headerSpeedScrubber.classList.remove('dragging');
                commitHeaderSpeed();
                if (headerSpeedScrubber.hasPointerCapture(event.pointerId)) {
                    headerSpeedScrubber.releasePointerCapture(event.pointerId);
                }
                dragState = null;
            };

            headerSpeedScrubber.addEventListener('pointerup', finishHeaderDrag);
            headerSpeedScrubber.addEventListener('pointercancel', finishHeaderDrag);

            headerSpeedScrubber.addEventListener('keydown', (event) => {
                let delta = 0;
                if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -5;
                else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = 5;
                else if (event.key === 'Home') delta = SPEED_MIN - (parseInt(speedSlider.value, 10) || 100);
                else if (event.key === 'End') delta = SPEED_MAX - (parseInt(speedSlider.value, 10) || 100);
                else return;
                event.preventDefault();
                applySpeed((parseInt(speedSlider.value, 10) || 100) + delta);
                this._saveSettings();
            });

            headerSpeedScrubber.addEventListener('wheel', (event) => {
                event.preventDefault();
                const direction = event.deltaY > 0 ? -5 : 5;
                applySpeed((parseInt(speedSlider.value, 10) || 100) + direction);
                this._saveSettings();
            }, { passive: false });
        }

        // ── Note Style ──
        const noteStyleSelect = document.getElementById('noteStyleSelect');
        if (noteStyleSelect) {
            noteStyleSelect.addEventListener('change', () => {
                this.noteStyle = noteStyleSelect.value;
                this._saveSettings();
            });
        }

        // ── Show Note Names ──
        const showNoteNamesToggle = document.getElementById('showNoteNamesToggle');
        if (showNoteNamesToggle) {
            showNoteNamesToggle.checked = this.showNoteNames;
            showNoteNamesToggle.addEventListener('change', () => {
                this.showNoteNames = showNoteNamesToggle.checked;
                this._saveSettings();
            });
        }

        // ── Neon Glow ──
        const neonGlowToggle = document.getElementById('neonGlowToggle');
        if (neonGlowToggle) {
            neonGlowToggle.addEventListener('change', () => {
                this.neonGlowEnabled = neonGlowToggle.checked;
                this._applyNeonGlowCSS();
                this._markGraphicsPresetCustom();
                this._saveSettings();
            });
        }
        // Apply initial state for the GL canvas filter
        this._applyNeonGlowCSS();

        // ── Force Field Bar ──
        const forceFieldToggle = document.getElementById('forceFieldToggle');
        if (forceFieldToggle) {
            forceFieldToggle.addEventListener('change', () => {
                this.forceFieldEnabled = forceFieldToggle.checked;
                this._laneCacheDirty = true;
                this._markGraphicsPresetCustom();
                this._saveSettings();
            });
        }

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
                this._setBackgroundImage(e.target.result, file.name);
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
        if (bgOpacitySlider && bgOpacityVal) {
            bgOpacitySlider.addEventListener('input', () => {
                const val = parseInt(bgOpacitySlider.value);
                bgOpacityVal.textContent = val + '%';
                this.bgOverlayOpacity = val / 100;
                this._applyOverlayOpacity();
                this._laneCacheDirty = true;
                this._saveSettings();
            });
        }

        // Restore saved background
        const savedBg = localStorage.getItem('pianoHeroBgImage');
        const savedBgName = localStorage.getItem('pianoHeroBgImageName');
        if (savedBg) {
            this._setBackgroundImage(savedBg, savedBgName || 'Custom image');
            bgImageClearBtn.disabled = false;
        } else {
            this._updateBackgroundLabel('None');
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
            timingFeedback: document.getElementById('timingFeedbackModeSelect').value !== 'none',
            timingFeedbackMode: document.getElementById('timingFeedbackModeSelect').value,
            coplayAutoVolume: document.getElementById('coplayAutoVolume').value,
            autoPlay: document.getElementById('modeToggleSwitch').checked,
            eqCompression: document.getElementById('eqCompressionToggle').checked,
            sympatheticResonance: document.getElementById('sympatheticResonanceToggle').checked,
            noteStyle: (document.getElementById('noteStyleSelect') || {}).value || this.noteStyle,
            showNoteNames: this.showNoteNames,
            graphicsPreset: 'custom',
            compactGameArea: this.compactGameArea,
            neonGlow: (document.getElementById('neonGlowToggle') || {}).checked || false,
            forceField: false,
            bgOverlayOpacity: 0,
            fxOnlyMode: true,
            laneStyle: document.getElementById('laneStyleSelect').value,
            keyPressTint: document.getElementById('keyPressTintSelect').value,
            keyPressTintHue: document.getElementById('keyPressTintHue').value,
            keyPressTintSat: document.getElementById('keyPressTintSat').value,
            keyPressTintVal: document.getElementById('keyPressTintVal').value,
            fxStreamMode: document.getElementById('fxStreamSelect').value,
            fxStreamWidth: document.getElementById('fxStreamWidthSelect').value,
            fxRibbonMode: document.getElementById('fxRibbonSelect').value,
            fxSplashMode: document.getElementById('fxSplashSelect').value,
            fxGlowSpread: (document.getElementById('fxGlowSpreadSelect') || {}).value || 'narrow',
            fxGlowlineHueStart: document.getElementById('fxGlowHueStart').value,
            fxGlowlineHueEnd: document.getElementById('fxGlowHueEnd').value,
            fxGlowlineSat: document.getElementById('fxGlowSat').value,
            fxGlowlineVal: document.getElementById('fxGlowVal').value,
            fxSmokeHue: document.getElementById('fxSmokeHue').value,
            fxSmokeSat: document.getElementById('fxSmokeSat').value,
            fxSmokeVal: document.getElementById('fxSmokeVal').value,
            fxKeyGlowHue: document.getElementById('fxKeyGlowHue').value,
            fxKeyGlowSat: document.getElementById('fxKeyGlowSat').value,
            fxKeyGlowVal: document.getElementById('fxKeyGlowVal').value,
        };
        try { localStorage.setItem('pianoHeroSettings', JSON.stringify(settings)); } catch(e) {}
    }

    _updateBackgroundLabel(name) {
        const label = document.getElementById('currentBackgroundLabel');
        if (label) label.textContent = name || 'None';
    }

    _setBackgroundImage(dataUrl, name = 'Custom image') {
        document.body.style.backgroundImage = `url(${dataUrl})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        this.hasBgImage = true;
        this.currentBackgroundName = name;
        this._updateBackgroundLabel(name);
        this._applyOverlayOpacity();
        this._laneCacheDirty = true;
        try { localStorage.setItem('pianoHeroBgImage', dataUrl); } catch(e) {}
        try { localStorage.setItem('pianoHeroBgImageName', name); } catch(e) {}
    }

    _clearBackgroundImage() {
        document.body.style.backgroundImage = '';
        document.body.style.backgroundSize = '';
        document.body.style.backgroundPosition = '';
        this.hasBgImage = false;
        this.currentBackgroundName = '';
        this._updateBackgroundLabel('None');
        this._applyOverlayOpacity();
        this._laneCacheDirty = true;
        try { localStorage.removeItem('pianoHeroBgImage'); } catch(e) {}
        try { localStorage.removeItem('pianoHeroBgImageName'); } catch(e) {}
    }

    _applyOverlayOpacity() {
        const o = this.bgOverlayOpacity;
        document.getElementById('gameArea').style.background = `rgba(14, 11, 34, ${o})`;
        document.getElementById('gameCanvas').style.background = `rgba(14, 11, 34, ${o * 0.4})`;
    }

    _applyFxOnlyMode(_enabled = true, { skipSave = false } = {}) {
        this.fxOnlyMode = true;

        const prevLoading = this._loading;
        this._loading = true;

        const fxStreamSelect = document.getElementById('fxStreamSelect');
        const fxStreamWidthSelect = document.getElementById('fxStreamWidthSelect');
        const fxRibbonSelect = document.getElementById('fxRibbonSelect');
        if (fxStreamSelect) fxStreamSelect.disabled = false;
        if (fxStreamWidthSelect) fxStreamWidthSelect.disabled = false;
        if (fxRibbonSelect) fxRibbonSelect.disabled = false;

        this.forceFieldEnabled = false;
        this.bgOverlayOpacity = 0;
        const bgOpacitySlider = document.getElementById('bgOpacitySlider');
        const bgOpacityVal = document.getElementById('bgOpacityVal');
        if (bgOpacitySlider) bgOpacitySlider.value = 0;
        if (bgOpacityVal) bgOpacityVal.textContent = '0%';
        this._applyOverlayOpacity();
        this._laneCacheDirty = true;

        if (fxStreamSelect) this._applyFxStreamMode(fxStreamSelect.value, { skipSave: true });
        if (fxStreamWidthSelect) this._applyFxStreamWidth(fxStreamWidthSelect.value, { skipSave: true });
        if (fxRibbonSelect) this._applyFxRibbonMode(fxRibbonSelect.value, { skipSave: true });

        this._loading = prevLoading;
        if (!skipSave) this._saveSettings();
    }

    _applyFxStreamMode(mode, { skipSave = false } = {}) {
        const m = (mode === 'cinematic' || mode === 'subtle') ? mode : 'off';
        const select = document.getElementById('fxStreamSelect');
        if (select) select.value = m;
        this.fxStreamMode = m;
        const widthRow = document.getElementById('fxStreamWidthRow');
        const widthSelect = document.getElementById('fxStreamWidthSelect');
        if (widthRow) widthRow.style.display = m === 'off' ? 'none' : '';
        if (widthSelect) widthSelect.disabled = m === 'off';
        if (this.pianoFx && typeof this.pianoFx.setStreamMode === 'function') {
            this.pianoFx.setStreamMode(m);
        }
        if (!skipSave) this._saveSettings();
    }

    _applyFxStreamWidth(mode, { skipSave = false } = {}) {
        const m = (mode === 'narrow' || mode === 'wide') ? mode : 'normal';
        const select = document.getElementById('fxStreamWidthSelect');
        if (select) select.value = m;
        this.fxStreamWidth = m;
        if (this.pianoFx && typeof this.pianoFx.setStreamWidth === 'function') {
            this.pianoFx.setStreamWidth(m);
        }
        if (!skipSave) this._saveSettings();
    }

    _applyFxRibbonMode(mode, { skipSave = false } = {}) {
        const m = (mode === 'off' || mode === 'hitbar' || mode === 'subtle' || mode === 'cinematic') ? mode : 'strong';
        const select = document.getElementById('fxRibbonSelect');
        if (select) select.value = m;
        this.fxRibbonMode = m;
        this._laneCacheDirty = true;
        this._updateKeyboardTopColorControls();
        if (this.pianoFx && typeof this.pianoFx.setRibbonMode === 'function') {
            this.pianoFx.setRibbonMode(m);
        }
        if (!skipSave) this._saveSettings();
    }

    _updateKeyboardTopColorControls() {
        const disabled = this.fxRibbonMode === 'off' || this.fxRibbonMode === 'hitbar';
        document.querySelectorAll('.keyboard-top-color-control').forEach((row) => {
            row.style.opacity = disabled ? '0.45' : '';
            row.querySelectorAll('input, select, button').forEach((control) => {
                control.disabled = disabled;
            });
        });
    }

    _applyFxVisualizerMode(mode, { skipSave = false } = {}) {
        const legacy = mode || 'ribbon';
        const streamMode = legacy === 'ribbon' ? 'off' : legacy;
        const ribbonMode = legacy === 'ribbon' ? 'strong' : legacy;
        this._applyFxStreamMode(streamMode, { skipSave: true });
        this._applyFxRibbonMode(ribbonMode, { skipSave: true });
        const select = document.getElementById('fxVisualizerSelect');
        if (select) select.value = mode;
        if (!skipSave) this._saveSettings();
    }

    _applyFxSplashMode(mode, { skipSave = false } = {}) {
        const select = document.getElementById('fxSplashSelect');
        if (select) select.value = mode;
        this.fxSplashMode = mode;
        if (this.pianoFx && typeof this.pianoFx.setSplashMode === 'function') {
            this.pianoFx.setSplashMode(mode);
        }
        if (!skipSave) this._saveSettings();
    }

    _applyFxGlowSpread(mode, { skipSave = false } = {}) {
        const m = (mode === 'none' || mode === 'wide') ? mode : 'narrow';
        const select = document.getElementById('fxGlowSpreadSelect');
        if (select) select.value = m;
        this.fxGlowSpread = m;
        this._updateStrokeGlowColorControls();
        if (this.pianoFx && typeof this.pianoFx.setGlowSpread === 'function') {
            this.pianoFx.setGlowSpread(m);
        }
        if (!skipSave) this._saveSettings();
    }

    _applyPianoFxRuntimeSettings() {
        this._applyFxStreamMode(this.fxStreamMode || 'off', { skipSave: true });
        this._applyFxStreamWidth(this.fxStreamWidth || 'normal', { skipSave: true });
        this._applyFxRibbonMode(this.fxRibbonMode || 'strong', { skipSave: true });
        this._applyFxSplashMode(this.fxSplashMode || 'classic', { skipSave: true });
        this._applyFxGlowSpread(this.fxGlowSpread || 'narrow', { skipSave: true });
        this._applyFxPalette({ skipSave: true });
        this._syncPianoFxKeyCenters();
    }

    _applyKeyPressTint(mode, { skipSave = false } = {}) {
        const m = (mode === 'on' || mode === 'purple' || mode === 'solid') ? 'solid' : (mode === 'glow' ? 'glow' : 'off');
        const select = document.getElementById('keyPressTintSelect');
        if (select) select.value = m;
        this.keyPressTint = m;
        document.body.classList.toggle('no-key-press-tint', m !== 'solid');
        if (m !== 'glow') this._clearAllFxKeyFills();
        this._updateKeyPressTintColorControls();
        this._applyKeyPressTintColor();
        if (!skipSave) this._saveSettings();
    }

    _hsvToRgb255(h, s, v) {
        const hue = (((h % 360) + 360) % 360) / 60;
        const sat = Math.max(0, Math.min(100, s)) / 100;
        const val = Math.max(0, Math.min(100, v)) / 100;
        const c = val * sat;
        const x = c * (1 - Math.abs((hue % 2) - 1));
        const m = val - c;
        let r = 0, g = 0, b = 0;
        if (hue < 1) [r, g, b] = [c, x, 0];
        else if (hue < 2) [r, g, b] = [x, c, 0];
        else if (hue < 3) [r, g, b] = [0, c, x];
        else if (hue < 4) [r, g, b] = [0, x, c];
        else if (hue < 5) [r, g, b] = [x, 0, c];
        else [r, g, b] = [c, 0, x];
        return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    }

    _applyKeyPressTintColor() {
        const hue = this.keyPressTintHue ?? 256;
        const sat = this.keyPressTintSat ?? 70;
        const val = this.keyPressTintVal ?? 100;
        if (hue === 256 && sat === 70 && val === 100) {
            document.body.style.setProperty('--key-press-tint-top', '#7c4dff');
            document.body.style.setProperty('--key-press-tint-bottom', '#6a3de8');
            return;
        }
        const [r, g, b] = this._hsvToRgb255(hue, sat, val);
        const bottom = this._hsvToRgb255(hue, sat, Math.max(0, val - 12));
        document.body.style.setProperty('--key-press-tint-top', `rgb(${r}, ${g}, ${b})`);
        document.body.style.setProperty('--key-press-tint-bottom', `rgb(${bottom[0]}, ${bottom[1]}, ${bottom[2]})`);
    }

    _updateKeyPressTintColorControls() {
        const disabled = this.keyPressTint !== 'solid';
        ['keyPressTintHue', 'keyPressTintSat', 'keyPressTintVal'].forEach((id) => {
            const input = document.getElementById(id);
            if (!input) return;
            input.disabled = disabled;
            const row = input.closest('.setting-row');
            if (row) row.style.opacity = disabled ? '0.45' : '';
        });
    }

    _updateStrokeGlowColorControls() {
        const disabled = this.fxGlowSpread === 'none';
        ['fxKeyGlowHue', 'fxKeyGlowSat', 'fxKeyGlowVal'].forEach((id) => {
            const input = document.getElementById(id);
            if (!input) return;
            input.disabled = disabled;
            const row = input.closest('.setting-row');
            if (row) row.style.opacity = disabled ? '0.45' : '';
        });
    }

    _applyFxPalette({ skipSave = false } = {}) {
        if (this.pianoFx && typeof this.pianoFx.setFxPalette === 'function') {
            const colorSat = (v) => {
                const s = Math.max(0, Math.min(1, (v || 0) / 100));
                return 1 - Math.pow(1 - s, 1.8);
            };
            const glowHueStart = this.fxGlowlineHueStart || 0;
            const glowHueEnd = this.fxGlowlineHueEnd || 0;
            const strokeGlowHue = ((glowHueStart + glowHueEnd) * 0.5) % 360;
            this.pianoFx.setFxPalette({
                glowlineHueStart: glowHueStart / 360,
                glowlineHueEnd: glowHueEnd / 360,
                glowlineSat: colorSat(this.fxGlowlineSat),
                glowlineVal: (this.fxGlowlineVal || 0) / 100,
                ribbonHue: glowHueStart / 360,
                ribbonSat: colorSat(this.fxSmokeSat),
                ribbonVal: (this.fxSmokeVal || 0) / 100,
                keyGlowHue: strokeGlowHue / 360,
                keyGlowSat: (this.fxKeyGlowSat || 0) / 100,
                keyGlowVal: (this.fxKeyGlowVal || 0) / 100,
            });
        }
        if (!skipSave) this._saveSettings();
    }

    _resetFxPaletteToDefaults() {
        const d = this._fxPaletteDefaults || {};
        const setSlider = (id, value, suffix, setter) => {
            const slider = document.getElementById(id);
            const valueEl = document.getElementById(id + 'Val');
            if (!slider || !valueEl) return;
            slider.value = value;
            valueEl.textContent = value + suffix;
            setter(value);
        };

        setSlider('fxGlowHueStart', d.glowlineHueStart ?? 0, '°', (v) => { this.fxGlowlineHueStart = v; });
        setSlider('fxGlowHueEnd', d.glowlineHueEnd ?? 306, '°', (v) => { this.fxGlowlineHueEnd = v; });
        setSlider('fxGlowSat', d.glowlineSat || 95, '%', (v) => { this.fxGlowlineSat = v; });
        setSlider('fxGlowVal', d.glowlineVal || 100, '%', (v) => { this.fxGlowlineVal = v; });
        setSlider('fxSmokeHue', d.smokeHue || 30, '°', (v) => { this.fxSmokeHue = v; });
        setSlider('fxSmokeSat', d.smokeSat ?? 49, '%', (v) => { this.fxSmokeSat = v; });
        setSlider('fxSmokeVal', d.smokeVal ?? 55, '%', (v) => { this.fxSmokeVal = v; });
        setSlider('fxKeyGlowHue', d.keyGlowHue || 200, '°', (v) => { this.fxKeyGlowHue = v; });
        setSlider('fxKeyGlowSat', d.keyGlowSat || 70, '%', (v) => { this.fxKeyGlowSat = v; });
        setSlider('fxKeyGlowVal', d.keyGlowVal || 100, '%', (v) => { this.fxKeyGlowVal = v; });
        setSlider('keyPressTintHue', d.keyPressTintHue || 256, '°', (v) => { this.keyPressTintHue = v; this._applyKeyPressTintColor(); });
        setSlider('keyPressTintSat', d.keyPressTintSat || 70, '%', (v) => { this.keyPressTintSat = v; this._applyKeyPressTintColor(); });
        setSlider('keyPressTintVal', d.keyPressTintVal || 100, '%', (v) => { this.keyPressTintVal = v; this._applyKeyPressTintColor(); });

        this._applyFxPalette();
    }

    _resetAllSettingsToDefaults() {
        try { localStorage.removeItem('pianoHeroSettings'); } catch (e) {}
        try { localStorage.removeItem('pianoHeroBgImage'); } catch (e) {}
        try { localStorage.removeItem('pianoHeroBgImageName'); } catch (e) {}
        window.location.reload();
    }

    _getGraphicsPresetConfig(preset) {
        switch (preset) {
            case 'ultra':
                // Ultra-performance: route everything through Pixi, disable Canvas 2D overlay.
                // No particles, no lane cache draw, no timeline, no labels, no force field.
                return {
                    neonGlow: false,
                    forceField: false,
                    compactGameArea: true,
                    ultra: true,
                };
            case 'low':
                // Performance default: turn off every scenic extra so update/render
                // stay close to what OnlinePianist does on its compact player.
                return {
                    neonGlow: false,
                    forceField: false,
                    compactGameArea: true,
                };
            case 'medium':
                return {
                    neonGlow: false,
                    forceField: false,
                    compactGameArea: false,
                };
            case 'high':
            default:
                return {
                    neonGlow: true,
                    forceField: true,
                    compactGameArea: false,
                };
        }
    }

    _setGraphicsPresetValue(preset) {
        this.graphicsPreset = preset;
        const select = document.getElementById('graphicsPresetSelect');
        if (select) select.value = preset;
    }

    /**
     * Ensure CSS filters are cleared; neon glow is now rendered per-note.
     */
    _applyNeonGlowCSS() {
        const pixiC = document.getElementById('pixiCanvas');
        const notesC = document.getElementById('notesCanvas');
        if (pixiC) pixiC.style.filter = '';
        if (notesC) notesC.style.filter = '';
    }

    _markGraphicsPresetCustom() {
        if (this._loading || this._applyingGraphicsPreset) return;
        this._setGraphicsPresetValue('custom');
    }

    _applyGraphicsPreset(preset, options = {}) {
        const { skipSave = false } = options;
        const config = this._getGraphicsPresetConfig(preset);
        this._applyingGraphicsPreset = true;

        const neonGlowToggle = document.getElementById('neonGlowToggle');
        const forceFieldToggle = document.getElementById('forceFieldToggle');

        this.neonGlowEnabled = config.neonGlow;
        if (neonGlowToggle) neonGlowToggle.checked = config.neonGlow;
        this._applyNeonGlowCSS();

        this.forceFieldEnabled = config.forceField;
        if (forceFieldToggle) forceFieldToggle.checked = config.forceField;
        this._laneCacheDirty = true;

        this._applyCompactGameArea(config.compactGameArea);
        this._applyUltraPerformance(!!config.ultra);
        this._applyPixiQuality(preset);

        this._setGraphicsPresetValue(preset);
        this._applyingGraphicsPreset = false;
        if (!skipSave) this._saveSettings();
    }

    _applyCompactGameArea(enabled) {
        this.compactGameArea = !!enabled;
        document.body.classList.toggle('compact-game', this.compactGameArea);
        // The canvas size depends on container height, so re-measure now that
        // the CSS class changed the layout.
        if (typeof this.resizeCanvas === 'function') {
            // Defer to next frame so the layout reflow lands first.
            requestAnimationFrame(() => this.resizeCanvas());
        }
    }

    /**
     * Map graphics preset → Pixi backing-buffer resolution.
     *   ultra  → 1   (cheapest fill cost, Pixi-only)
     *   low    → 1   (cheapest fill cost)
     *   medium → min(DPR, 1.5)
     *   high   → min(DPR, 2)   (crisp on retina)
     * custom keeps whatever was last applied.
     */
    _applyPixiQuality(preset) {
        if (!this.noteRenderer || typeof this.noteRenderer.setQuality !== 'function') return;
        const dpr = window.devicePixelRatio || 1;
        let resolution;
        switch (preset) {
            case 'ultra':  resolution = 1; break;
            case 'low':    resolution = 1; break;
            case 'high':   resolution = Math.min(dpr, 2); break;
            case 'medium': resolution = Math.min(dpr, 1.5); break;
            default: return; // 'custom' — leave as-is
        }
        this.noteRenderer.setQuality({ resolution });
    }

    /** Toggle ultra-performance: hide #notesCanvas (2D overlay) and force beam style. */
    _applyUltraPerformance(enabled) {
        this.ultraPerformance = !!enabled;
        if (this.canvas) this.canvas.style.display = enabled ? 'none' : '';
        if (enabled) {
            // Classic bars require Canvas 2D — force beam path so Pixi can render notes.
            const sel = document.getElementById('noteStyleSelect');
            if (sel && this.noteStyle !== 'beam') {
                this._prevNoteStyleBeforeUltra = this.noteStyle;
                this.noteStyle = 'beam';
                sel.value = 'beam';
            }
        } else if (this._prevNoteStyleBeforeUltra) {
            const sel = document.getElementById('noteStyleSelect');
            this.noteStyle = this._prevNoteStyleBeforeUltra;
            if (sel) sel.value = this.noteStyle;
            this._prevNoteStyleBeforeUltra = null;
        }
    }

    /**
     * Visible-note windowing helpers.
     * fallingNotes is kept sorted by `time`; the two cursors mark the slice
     * `[_firstActiveIdx, _lastVisibleIdx)` that update/render need to touch.
     * Cursors only advance forward; rebuilds call _resetNoteWindow().
     */
    _resetNoteWindow() {
        if (this.fallingNotes && this.fallingNotes.length > 1) {
            this.fallingNotes.sort((a, b) => a.time - b.time);
        }
        this._firstActiveIdx = 0;
        this._lastVisibleIdx = 0;
    }

    _advanceVisibleWindow(referenceTime, speed) {
        // referenceTime is the game clock in seconds (already in playback time —
        // not multiplied by speed). Position formula:
        //   y = hitZoneY - ((note.time / speed) - referenceTime) * noteSpeed * speed
        // Note enters viewport when y >= -margin →
        //   note.time <= (referenceTime + (hitZoneY + margin) / (noteSpeed * speed)) * speed
        const margin = this._noteWindowMargin;
        const enterCutoffSec = (referenceTime + (this.hitZoneY + margin) / (this.noteSpeed * speed)) * speed;
        const notes = this.fallingNotes;
        const len = notes.length;
        while (this._lastVisibleIdx < len && notes[this._lastVisibleIdx].time <= enterCutoffSec) {
            this._lastVisibleIdx++;
        }
    }

    _retireScrolledNotes(speed) {
        // Advance _firstActiveIdx past any notes whose drawn region is fully
        // below the canvas. Cursor advancement also cleans up held-note refs.
        const canvasBottom = this.canvas.height + 50;
        while (this._firstActiveIdx < this._lastVisibleIdx) {
            const note = this.fallingNotes[this._firstActiveIdx];
            const noteH = this._visibleNoteHeight(note.duration || 0.15, speed);
            if ((note.y - noteH) <= canvasBottom) break;
            if (this.heldFallingNotes.get(note.note) === note) {
                this.heldFallingNotes.delete(note.note);
            }
            this._firstActiveIdx++;
        }
    }

    _loadSettings() {
        let settings;
        try { settings = JSON.parse(localStorage.getItem('pianoHeroSettings')); } catch(e) {}
        if (!settings) return;
        this._loading = true;

        if (settings.graphicsPreset) {
            this._setGraphicsPresetValue(settings.graphicsPreset);
        }

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
                this._syncSoundBankInstrumentState();
                if (this.currentSampleBank !== 'Salamander') this.loadSalamander();
            } else {
                this.useSalamander = false;
                this._syncSoundBankInstrumentState();
                this.soundfontBaseUrl = `https://gleitz.github.io/midi-js-soundfonts/${settings.soundBank}/`;
                this.loadSoundfont(settings.instrument || this.currentInstrument);
            }
        } else {
            this._syncSoundBankInstrumentState();
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
        if (settings.timingFeedbackMode || settings.timingFeedback != null) {
            const sel = document.getElementById('timingFeedbackModeSelect');
            const savedMode = settings.timingFeedbackMode || 'individual';
            const mode = settings.timingFeedback === false ? 'none' : savedMode;
            sel.value = mode;
            this.showTimingFeedback = mode !== 'none';
            this.timingFeedbackMode = this.showTimingFeedback ? mode : 'individual';
        }
        if (settings.laneStyle) {
            const sel = document.getElementById('laneStyleSelect');
            if (sel) sel.value = settings.laneStyle;
            this.laneStyle = settings.laneStyle;
            this._laneCacheDirty = true;
        }
        this._applyKeyPressTint(settings.keyPressTint || 'off', { skipSave: true });
        if (settings.keyPressTintHue != null) {
            const s = document.getElementById('keyPressTintHue');
            s.value = settings.keyPressTintHue;
            document.getElementById('keyPressTintHueVal').textContent = s.value + '°';
            this.keyPressTintHue = parseInt(s.value, 10) || 0;
        }
        if (settings.keyPressTintSat != null) {
            const s = document.getElementById('keyPressTintSat');
            s.value = settings.keyPressTintSat;
            document.getElementById('keyPressTintSatVal').textContent = s.value + '%';
            this.keyPressTintSat = parseInt(s.value, 10) || 0;
        }
        if (settings.keyPressTintVal != null) {
            const s = document.getElementById('keyPressTintVal');
            s.value = settings.keyPressTintVal;
            document.getElementById('keyPressTintValVal').textContent = s.value + '%';
            this.keyPressTintVal = parseInt(s.value, 10) || 0;
        }
        this._applyKeyPressTintColor();
        this._updateKeyPressTintColorControls();
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
            if (sel) sel.value = settings.noteStyle;
            this.noteStyle = settings.noteStyle;
        }
        if (settings.showNoteNames != null) {
            this.showNoteNames = !!settings.showNoteNames;
            const cb = document.getElementById('showNoteNamesToggle');
            if (cb) cb.checked = this.showNoteNames;
        }
        if (settings.neonGlow != null) {
            const cb = document.getElementById('neonGlowToggle');
            if (cb) cb.checked = settings.neonGlow;
            this.neonGlowEnabled = settings.neonGlow;
            this._applyNeonGlowCSS();
        }
        if (settings.forceField != null) {
            const cb = document.getElementById('forceFieldToggle');
            if (cb) cb.checked = settings.forceField;
            this.forceFieldEnabled = settings.forceField;
            this._laneCacheDirty = true;
        }
        if (settings.bgOverlayOpacity != null) {
            const s = document.getElementById('bgOpacitySlider');
            if (s) s.value = settings.bgOverlayOpacity;
            const val = document.getElementById('bgOpacityVal');
            if (val) val.textContent = settings.bgOverlayOpacity + '%';
            this.bgOverlayOpacity = parseInt(settings.bgOverlayOpacity) / 100;
            this._applyOverlayOpacity();
            this._laneCacheDirty = true;
        }

        this._applyFxOnlyMode(true, { skipSave: true });

        if (settings.fxStreamMode || settings.fxRibbonMode) {
            this._applyFxStreamMode(settings.fxStreamMode || 'off', { skipSave: true });
            this._applyFxStreamWidth(settings.fxStreamWidth || 'normal', { skipSave: true });
            this._applyFxRibbonMode(settings.fxRibbonMode || 'strong', { skipSave: true });
        } else if (settings.fxVisualizerMode) {
            this._applyFxVisualizerMode(settings.fxVisualizerMode, { skipSave: true });
            this._applyFxStreamWidth(settings.fxStreamWidth || 'normal', { skipSave: true });
        } else {
            this._applyFxStreamMode('off', { skipSave: true });
            this._applyFxStreamWidth('normal', { skipSave: true });
            this._applyFxRibbonMode('strong', { skipSave: true });
        }

        if (settings.fxSplashMode) {
            this._applyFxSplashMode(settings.fxSplashMode, { skipSave: true });
        }

        this._applyFxGlowSpread(settings.fxGlowSpread || 'narrow', { skipSave: true });

        if (settings.fxGlowlineHueStart != null) {
            const s = document.getElementById('fxGlowHueStart');
            s.value = settings.fxGlowlineHueStart;
            document.getElementById('fxGlowHueStartVal').textContent = s.value + '°';
            this.fxGlowlineHueStart = parseInt(s.value, 10) || 0;
        }
        if (settings.fxGlowlineHueEnd != null) {
            const s = document.getElementById('fxGlowHueEnd');
            s.value = settings.fxGlowlineHueEnd;
            document.getElementById('fxGlowHueEndVal').textContent = s.value + '°';
            this.fxGlowlineHueEnd = parseInt(s.value, 10) || 0;
        }
        if (settings.fxGlowlineSat != null) {
            const s = document.getElementById('fxGlowSat');
            s.value = settings.fxGlowlineSat;
            document.getElementById('fxGlowSatVal').textContent = s.value + '%';
            this.fxGlowlineSat = parseInt(s.value, 10) || 0;
        }
        if (settings.fxGlowlineVal != null) {
            const s = document.getElementById('fxGlowVal');
            s.value = settings.fxGlowlineVal;
            document.getElementById('fxGlowValVal').textContent = s.value + '%';
            this.fxGlowlineVal = parseInt(s.value, 10) || 0;
        }
        if (settings.fxSmokeHue != null) {
            const s = document.getElementById('fxSmokeHue');
            s.value = settings.fxSmokeHue;
            document.getElementById('fxSmokeHueVal').textContent = s.value + '°';
            this.fxSmokeHue = parseInt(s.value, 10) || 0;
        }
        if (settings.fxSmokeSat != null) {
            const s = document.getElementById('fxSmokeSat');
            s.value = settings.fxSmokeSat;
            document.getElementById('fxSmokeSatVal').textContent = s.value + '%';
            this.fxSmokeSat = parseInt(s.value, 10) || 0;
        }
        if (settings.fxSmokeVal != null) {
            const s = document.getElementById('fxSmokeVal');
            s.value = settings.fxSmokeVal;
            document.getElementById('fxSmokeValVal').textContent = s.value + '%';
            this.fxSmokeVal = parseInt(s.value, 10) || 0;
        }
        if (settings.fxKeyGlowHue != null) {
            const s = document.getElementById('fxKeyGlowHue');
            s.value = settings.fxKeyGlowHue;
            document.getElementById('fxKeyGlowHueVal').textContent = s.value + '°';
            this.fxKeyGlowHue = parseInt(s.value, 10) || 0;
        }
        if (settings.fxKeyGlowSat != null) {
            const s = document.getElementById('fxKeyGlowSat');
            s.value = settings.fxKeyGlowSat;
            document.getElementById('fxKeyGlowSatVal').textContent = s.value + '%';
            this.fxKeyGlowSat = parseInt(s.value, 10) || 0;
        }
        if (settings.fxKeyGlowVal != null) {
            const s = document.getElementById('fxKeyGlowVal');
            s.value = settings.fxKeyGlowVal;
            document.getElementById('fxKeyGlowValVal').textContent = s.value + '%';
            this.fxKeyGlowVal = parseInt(s.value, 10) || 0;
        }

        this._applyFxPalette({ skipSave: true });

        if (settings.graphicsPreset && settings.graphicsPreset !== 'custom') {
            this._applyGraphicsPreset(settings.graphicsPreset, { skipSave: true });
        } else if (!settings.graphicsPreset) {
            this._setGraphicsPresetValue('custom');
        }

        // Compact-mode override (applied after preset so custom users keep choice)
        if (settings.compactGameArea != null) {
            this._applyCompactGameArea(settings.compactGameArea);
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
            if (this._simpleModeCache) {
                this.notes = this._simpleModeCache.map(n => ({ ...n }));
            } else {
                this.notes = this._simplifyByMerge(this.originalNotes);
            }
        } else {
            // Normal, coplay, practice — use original notes
            this.notes = this.originalNotes.map(n => ({ ...n }));
        }
        // Compute song duration from the latest note end time
        if (this._durationCache) {
            this.songDuration = this.gameMode === 'simple' ? this._durationCache.simple : this._durationCache.normal;
        } else {
            this.songDuration = this.notes.reduce((max, n) => Math.max(max, n.time + (n.duration || 0.15)), 0);
        }
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
        this._clearAllFxKeyFills();
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
        this._resetNoteWindow();

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
        if (this.soundfontDecodePromise) return this.soundfontDecodePromise;
        const entries = Object.entries(noteData);
        const buffers = {};
        const decodePromise = Promise.all(entries.map(async ([noteName, dataUri]) => {
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
        })).then(() => {
            this.soundfontBuffers = buffers;
            this.soundfontLoaded = true;
        }).finally(() => {
            this.soundfontDecodePromise = null;
        });

        this.soundfontDecodePromise = decodePromise;
        await decodePromise;
    }

    async _ensurePlaybackReady() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.setupAudioGraph();
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        if (this.useSalamander) {
            if (!this.salamanderLoaded && Object.keys(this.salamanderBuffers).length === 0 && !this.soundfontLoading) {
                await this.loadSalamander();
            }
            return this.salamanderLoaded || Object.keys(this.salamanderBuffers).length > 0;
        }

        if (!this.soundfontRawData && Object.keys(this.soundfontBuffers).length === 0 && !this.soundfontLoading) {
            await this.loadSoundfont(this.currentInstrument);
        }

        if (this.soundfontRawData && !this.soundfontLoaded) {
            await this._decodeSoundfontSamples(this.soundfontRawData);
        }

        return this.soundfontLoaded || Object.keys(this.soundfontBuffers).length > 0;
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
    
    async startGame() {
        if (this.notes.length === 0) {
            alert('Please load a MIDI file first');
            return;
        }

        // If already playing/paused, switch from auto-play to manual
        if (this.isPlaying || this.isPaused) {
            this._switchToManual();
            return;
        }

        const playbackReady = await this._ensurePlaybackReady();
        if (!playbackReady) {
            this.statusMessage.textContent = 'Audio is still loading. Try Play again in a moment.';
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
            this._preRollSec = this.noteLeadInSec;
            this.startTime = performance.now();

            this.fallingNotes = this.notes.map(note => ({
                ...note,
                y: -50,
                hit: false,
                missed: false
            }));
            this._resetNoteWindow();
        } else {
            // Shift startTime so the game clock picks up from the pre-seeked position
            const refTime = this.pauseTime || performance.now();
            const gameClockSec = (refTime - this.startTime) / 1000;
            this.startTime = performance.now() - gameClockSec * 1000;
            this._preRollSec = 0;
        }
        this._hasLogicClock = false;
        this._logicAccumulatorSec = 0;

        this._updateControlButtons();

        // Practice mode setup
        this._clearPracticeState();
        this.practicePauseOffset = 0;

        const modeLabel = this._getModeDisplayName();
        if (this._isMicPracticeMode()) {
            this._setMicPracticeStatus('Mic Practice: listening for highlighted notes.');
        } else {
            this._clearMicPracticeStatusLayout();
            this.statusMessage.textContent = `${modeLabel} in progress...`;
        }
        
        this.totalNotes = this.fallingNotes.length;
        
        // Co-Play: auto-start auto-play for non-manual lanes
        if (this.gameMode === 'coplay' && this.coPlayManualNotes.size > 0) {
            this.isAutoPlay = true;
            this._scheduleAutoPlayNotes();
        }

        this._syncMicPracticeState();
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
        const modeLabel = this.gameMode === 'normal' ? 'Manual play' : this._getModeDisplayName();
        this.statusMessage.textContent = `${modeLabel} — continuing from current position!`;
        this._syncMicPracticeState();
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
            closestNote.holdStart = this._getGameClockSec();
            this.combo++;
            this.hitNotes++;
            const accuracy = 1 - (closestDistance / this.hitTolerance);
            const points = Math.floor(100 * accuracy * this._getMultiplier());
            this.score += points;
            this.updateScore();
            this.showHitFeedback(note, true, accuracy);
            this.heldFallingNotes.set(note, closestNote);
        } else {
            // Wrong key — show red miss feedback
            this.combo = 0;
            this.updateScore();
            this.showHitFeedback(note, false, 0);
        }
    }

    async startAutoPlay() {
        // If already playing/paused, switch to auto-play from current position
        const continuing = this.isPlaying || this.isPaused;

        if (!continuing) {
            await this.startGame();
            if (!this.isPlaying) return;
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
            this._clearPracticeState();
            document.querySelectorAll('.key.practice-target').forEach(k => k.classList.remove('practice-target'));

            // Unpause if paused
            if (this.isPaused) {
                this.isPaused = false;
                const pauseDuration = performance.now() - this.pauseTime;
                this.startTime += pauseDuration;
            }
        }

        this.isAutoPlay = true;
        this._syncMicPracticeState();
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
        this._syncMicPracticeState();
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
            this._logicAccumulatorSec = 0;
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
            this._hasLogicClock = false;
            this._logicAccumulatorSec = 0;
            if (this.isAutoPlay) {
                this._scheduleAutoPlayNotes();
                this.statusMessage.textContent = 'Auto Play in progress...';
            } else if (this._isMicPracticeMode()) {
                this._setMicPracticeStatus('Mic Practice: listening for highlighted notes.');
            } else {
                this._clearMicPracticeStatusLayout();
                this.statusMessage.textContent = `${this._getModeDisplayName()} in progress...`;
            }
        }
        this._syncMicPracticeState();
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

        const modeNames = { normal: 'Normal', simple: 'Simple', coplay: 'Co-play', practice: 'Practice', micpractice: 'Mic Practice' };
        modeSubLabel.textContent = modeNames[this.gameMode] || 'Normal';

        // Update active state in dropdown
        document.querySelectorAll('.mode-option').forEach(opt => {
            const isAuto = opt.dataset.auto === 'true';
            const mode = opt.dataset.mode;
            opt.classList.toggle('active', isAuto === this.isAutoPlay && mode === this.gameMode);
        });
    }

    _getGameClockSec(referenceTime = performance.now()) {
        return ((referenceTime - this.startTime) / 1000) - this._preRollSec;
    }

    _scheduleAutoPlayNotes() {
        // Lookahead scheduler: a single setInterval ticks every 50 ms and
        // schedules any note whose game-time is within the next 200 ms.
        // This replaces the previous O(N) fan-out of setTimeout calls and
        // bounds timer drift / GC pressure independent of song length.

        // Reset prior scheduler state so this method stays idempotent.
        this._stopAutoPlayScheduler();
        for (const note of this.fallingNotes) {
            if (note._autoScheduled) note._autoScheduled = false;
        }

        const LOOKAHEAD_SEC = 0.2;
        const TICK_MS = 50;
        const isCoPlay = this.gameMode === 'coplay';

        const fireNote = (note) => {
            if (!this.isPlaying || this.isPaused) return;
            if (note.hit || note.missed) return;
            if (!note.hit && !note.missed) {
                note.hit = true;
                note.holdStart = this._getGameClockSec();
                this.combo++;
                this.hitNotes++;
                this.score += Math.floor(100 * this._getMultiplier());
                this.updateScore();
                this.showHitFeedback(note.note, true, 1);
                this.heldFallingNotes.set(note.note, note);
            }
            if (!this._keyElementCache) this._keyElementCache = {};
            let keyElement = this._keyElementCache[note.note];
            if (keyElement === undefined) {
                keyElement = document.querySelector(`.key[data-note="${note.note}"]`);
                this._keyElementCache[note.note] = keyElement || null;
            }
            if (keyElement) keyElement.classList.add('active');
            const autoVol = isCoPlay ? this.coPlayAutoVolume : undefined;
            this.playNoteSound(note.note, note.duration, autoVol);

            const speed = this.speedMultiplier;
            const holdMs = Math.max(80, ((note.duration || 0.15) / speed) * 1000);
            const releaseTid = setTimeout(() => {
                if (keyElement) keyElement.classList.remove('active');
                this.heldFallingNotes.delete(note.note);
            }, holdMs);
            this.autoPlayTimeouts.push(releaseTid);
        };

        const tick = () => {
            if (!this.isPlaying || this.isPaused) return;
            const currentTime = this._getGameClockSec();
            const speed = this.speedMultiplier;
            const horizon = currentTime + LOOKAHEAD_SEC;
            // fallingNotes is time-sorted; iterate from cursor and break early.
            const notes = this.fallingNotes;
            for (let i = 0; i < notes.length; i++) {
                const note = notes[i];
                if (note._autoScheduled || note.hit || note.missed) continue;
                if (isCoPlay && this.coPlayManualNotes.has(note.note)) continue;
                const noteTime = note.time / speed;
                if (noteTime > horizon) break; // future, beyond lookahead
                note._autoScheduled = true;
                const delayMs = Math.max(0, (noteTime - currentTime) * 1000);
                if (delayMs <= 1) {
                    fireNote(note);
                } else {
                    const tid = setTimeout(() => fireNote(note), delayMs);
                    this.autoPlayTimeouts.push(tid);
                }
            }
        };

        // Run one immediate tick so notes near the playhead don't wait 50ms.
        tick();
        this._autoPlaySchedulerId = setInterval(tick, TICK_MS);
    }

    _stopAutoPlayScheduler() {
        if (this._autoPlaySchedulerId != null) {
            clearInterval(this._autoPlaySchedulerId);
            this._autoPlaySchedulerId = null;
        }
    }
    
    // togglePause is now handled by togglePlayPause()
    
    reset() {
        this.isPlaying = false;
        this.isPaused = false;
        this.isAutoPlay = this.modeToggleSwitch.checked;
        this._stopMicPracticeDetection();
        this._stopAutoPlayScheduler();
        this.autoPlayTimeouts.forEach(t => clearTimeout(t));
        this.autoPlayTimeouts = [];
        this.fallingNotes = [];
        // Reset visible-window cursors so the renderer doesn't index past the
        // now-empty fallingNotes array (which previously killed the rAF chain
        // with "Cannot read properties of undefined (reading 'note')").
        this._firstActiveIdx = 0;
        this._lastVisibleIdx = 0;
        this._hasLogicClock = false;
        this._logicAccumulatorSec = 0;
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
        this._clearPracticeState();
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
                        this._tryResolvePracticeChord();
                    } else if (this.gameMode === 'micpractice' && this.practiceWaiting) {
                        return;
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
                this._clearFxKeyFill(note);
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
        const fxVelocity = Math.max(0, Math.min(1, velocity));
        this._emitPianoFxForNote(note, fxVelocity, duration);

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
        this._clearFxKeyFill(note);
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
            this._clearFxKeyFill(note);
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
            this._tryResolvePracticeChord();
            return; // In practice mode, only expected notes count
        }

        if (this.gameMode === 'micpractice' && this.practiceWaiting) {
            return;
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
            closestNote.holdStart = this._getGameClockSec();
            this.combo++;
            this.hitNotes++;
            
            const accuracy = 1 - (closestDistance / this.hitTolerance);
            const points = Math.floor(100 * accuracy * this._getMultiplier());
            this.score += points;
            
            this.updateScore();
            this.showHitFeedback(note, true, accuracy);
            this.heldFallingNotes.set(note, closestNote);
        } else {
            // Wrong key — show red miss feedback
            this.combo = 0;
            this.updateScore();
            this.showHitFeedback(note, false, 0);
        }
    }
    
    showHitFeedback(note, success, accuracy) {
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

        // Show timing feedback text
        if (this.showTimingFeedback) {
            if (this.timingFeedbackMode === 'consolidated') {
                this._showTimingTextConsolidated(success, accuracy);
            } else {
                this._showTimingText(note, success, accuracy);
            }
        }
    }

    _getTimingGradeRank(gradeText) {
        switch (gradeText) {
            case 'Miss': return 4;
            case 'OK': return 3;
            case 'Good': return 2;
            case 'Great': return 1;
            case 'Perfect': return 0;
            default: return 5;
        }
    }

    _showTimingTextConsolidated(success, accuracy) {
        if (!this._timingFeedbackCenterEl) {
            this._timingFeedbackCenterEl = document.getElementById('timingFeedbackCenter');
        }
        const el = this._timingFeedbackCenterEl;
        if (!el) return;

        const grade = this._getTimingGrade(success, accuracy);
        const now = performance.now();
        const state = this._consolidatedFeedbackState;
        const isMiss = !success;

        // A streak continues only while consecutive hits share the same grade
        // (and aren't broken by a miss). Any miss resets to a one-off "Miss".
        if (!state || isMiss || state.grade.text !== grade.text) {
            this._consolidatedFeedbackState = {
                count: 1,
                grade,
                lastTime: now,
            };
        } else {
            state.count += 1;
            state.lastTime = now;
        }

        const active = this._consolidatedFeedbackState;
        const suffix = active.count > 1 ? ` x${active.count}` : '';
        el.className = `timing-feedback timing-feedback-center ${active.grade.cls}`;
        el.textContent = `${active.grade.text}${suffix}`;
        el.classList.add('visible');

        // Restart the float animation each update so the label re-pops.
        el.style.animation = 'none';
        void el.offsetHeight;
        el.style.animation = '';

        if (this._consolidatedFeedbackTimer) {
            clearTimeout(this._consolidatedFeedbackTimer);
        }
        this._consolidatedFeedbackTimer = setTimeout(() => {
            el.classList.remove('visible');
            // Hiding the label also ends the visible streak — next hit starts fresh.
            this._consolidatedFeedbackState = null;
        }, 1200);
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
        const pianoKeys = document.querySelector('.piano-keys');
        if (!pianoKeys) return;

        const el = this._timingFeedbackPool.pop() || document.createElement('div');
        el.className = 'timing-feedback ' + grade.cls;
        el.textContent = grade.text;

        // Position directly above the struck key in the piano layer.
        el.style.left = (pos.left + pos.width / 2) + 'px';
        el.style.bottom = 'calc(100% + 20px)';

        this._activeTimingCount++;
        el.onanimationend = () => {
            if (el.parentNode) el.parentNode.removeChild(el);
            this._activeTimingCount = Math.max(0, (this._activeTimingCount || 1) - 1);
            this._timingFeedbackPool.push(el);
        };
        pianoKeys.appendChild(el);
    }
    
    updateScore() {
        // Only write to DOM when values actually change
        const score = String(this.score);
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        const streak = String(this.maxCombo);
        const processedNotes = this.hitNotes + this.missedNotes;
        const accuracy = String(processedNotes > 0 ? Math.floor((this.hitNotes / processedNotes) * 100) : 0);
        if (this.scoreElement.textContent !== score) this.scoreElement.textContent = score;
        if (this.streakElement.textContent !== streak) this.streakElement.textContent = streak;
        if (this.accuracyElement.textContent !== accuracy) this.accuracyElement.textContent = accuracy;
        this._updateMultiplierUI();
    }

    /**
     * Guitar-Hero style multiplier: base x1, +1 every MULTIPLIER_STEP
     * consecutive hits, capped at MULTIPLIER_MAX. Resets on miss (combo=0 → x1).
     */
    _getMultiplier() {
        const tier = 1 + Math.floor(this.combo / this.MULTIPLIER_STEP);
        return Math.min(this.MULTIPLIER_MAX, tier);
    }

    /** Notes accumulated toward the next multiplier tier (0..STEP-1, or STEP when capped). */
    _getMultiplierProgress() {
        if (this._getMultiplier() >= this.MULTIPLIER_MAX) return this.MULTIPLIER_STEP;
        return this.combo % this.MULTIPLIER_STEP;
    }

    _updateMultiplierUI() {
        const tracker = this.multiplierTrackerEl;
        const valueEl = this.multiplierValueEl;
        const pipsEl = this.multiplierPipsEl;
        if (!tracker || !valueEl || !pipsEl) return;

        const mult = this._getMultiplier();
        const progress = this._getMultiplierProgress();
        const step = this.MULTIPLIER_STEP;

        // Build pip elements once, then just toggle .lit class
        if (pipsEl.childElementCount !== step) {
            pipsEl.innerHTML = '';
            const radius = 19; // px from center, inside the 46px circle
            for (let i = 0; i < step; i++) {
                const pip = document.createElement('div');
                pip.className = 'multiplier-pip';
                // Distribute around the circle starting at 12 o'clock, clockwise
                const angle = (-Math.PI / 2) + (i / step) * Math.PI * 2;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                pip.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
                pipsEl.appendChild(pip);
            }
        }
        for (let i = 0; i < step; i++) {
            const pip = pipsEl.children[i];
            if (!pip) continue;
            const lit = i < progress;
            if (lit) pip.classList.add('lit');
            else pip.classList.remove('lit');
        }

        const valueStr = String(mult);
        if (valueEl.textContent !== valueStr) valueEl.textContent = valueStr;

        // Tier color class
        const tierClass = `tier-${mult}`;
        if (!tracker.classList.contains(tierClass)) {
            tracker.classList.remove('tier-1', 'tier-2', 'tier-3', 'tier-4');
            tracker.classList.add(tierClass);
        }

        // Pop animation when tier increases
        if (mult > this._lastMultiplier) {
            tracker.classList.remove('tier-up');
            // Force reflow so the animation restarts
            void tracker.offsetWidth;
            tracker.classList.add('tier-up');
        }
        this._lastMultiplier = mult;
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
        this._hasLogicClock = false;
        this._logicAccumulatorSec = 0;

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
        this._resetNoteWindow();

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
        this._advanceVisibleWindow(gameClockSec, speed);
        const notes = this.fallingNotes;
        for (let i = this._firstActiveIdx; i < this._lastVisibleIdx; i++) {
            const note = notes[i];
            const scaledNoteTime = note.time / speed;
            const timeUntilHit = scaledNoteTime - gameClockSec;
            note.y = this.hitZoneY - (timeUntilHit * this.noteSpeed * speed);
        }
        this._renderFrame(this.startTime + (gameClockSec * 1000), false);
    }
    
    update(currentTimeOverride) {
        if (!this.isPlaying || this.isPaused) return;

        // ── Practice mode: freeze time until correct note is played ──
        if (this._isManualPracticeMode()) {
            return this.updatePracticeMode();
        }
        
        const currentTime = typeof currentTimeOverride === 'number'
            ? currentTimeOverride
            : this._getGameClockSec(this._frameTime);
        const speed = this.speedMultiplier;

        // Update song progress timeline
        this.updateSongTimeline(currentTime * speed);

        // Expand the visible window forward as new notes enter the viewport,
        // then update positions only for notes inside [_firstActiveIdx, _lastVisibleIdx).
        this._advanceVisibleWindow(currentTime, speed);
        const hitZoneY = this.hitZoneY;
        const noteSpeed = this.noteSpeed;
        const hitTolerance = this.hitTolerance;
        const notes = this.fallingNotes;
        for (let i = this._firstActiveIdx; i < this._lastVisibleIdx; i++) {
            const note = notes[i];

            // Always update Y so notes keep scrolling (even after hit/missed)
            const scaledNoteTime = note.time / speed;
            const timeUntilHit = scaledNoteTime - currentTime;
            note.y = hitZoneY - (timeUntilHit * noteSpeed * speed);

            if (!note.hit && !note.missed) {
                if (note.y > hitZoneY + hitTolerance) {
                    note.missed = true;
                    this.missedNotes++;
                    this.combo = 0;
                    this.updateScore();
                }
            }
        }

        // Retire any notes whose drawn region has fully scrolled off the bottom.
        this._retireScrolledNotes(speed);

        // Check if game is over (every note has either scrolled off the bottom
        // or, for very long notes, all of them are past their hit zone).
        if (this._firstActiveIdx >= notes.length && this.isPlaying) {
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
            const modeName = this.gameMode === 'micpractice' ? 'Mic Practice' : 'Practice';
            this._clearMicPracticeStatusLayout();
            this.statusMessage.textContent = 
                `${modeName} complete! Score: ${this.score} | Accuracy: ${this.accuracyElement.textContent}%`;
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

        // Keep the render window in sync with the frozen practice clock.
        // Practice positions use noteSpeed without the speed multiplier, so we
        // pass speed=1 and reference = virtualTime (already in scaled form).
        this._advanceVisibleWindow(virtualTime, 1);

        // Build the set of expected notes for this chord
        const expectedSet = new Set(chordNotes.map(n => n.note));
        const expectedCounts = new Map();
        for (const chordNote of chordNotes) {
            this._incrementCount(expectedCounts, chordNote.note);
        }

        // Only reset tracking if the chord changed
        if (!this.practiceWaiting || !this._countMapsEqual(expectedCounts, this.practiceExpectedCounts)) {
            this.practiceExpectedNotes = expectedSet;
            this.practiceExpectedCounts = expectedCounts;
            this.practiceHitNotes = new Set();
            this.practiceHitCounts = new Map();
            this.practiceChordTime = virtualTime;
        }

        this.practiceWaiting = true;

        if (this._tryResolvePracticeChord()) {
            return;
        }

        // Highlight expected keys on the piano (diff-based to avoid per-frame DOM thrashing)
        const newTargets = new Set();
        for (const noteName of this.practiceExpectedNotes) {
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

        const remaining = [...this.practiceExpectedNotes];
        const instruction = remaining.length > 0 ? remaining.join(' + ') : 'hold the highlighted chord';
        if (this.gameMode === 'micpractice') {
            this._setMicPracticeStatus(`Mic Practice: play ${instruction}`);
        } else {
            this._clearMicPracticeStatusLayout();
            this.statusMessage.textContent = `Practice: play ${instruction}`;
        }
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
        this._incrementCount(this.practiceHitCounts, noteName);
        if (!this._hasRemainingPracticeHits(noteName)) {
            this.practiceHitNotes.add(noteName);
        }

        // Remove highlight from this key
        const keyEl = this._keyElementCache && this._keyElementCache[noteName];
        if (keyEl) keyEl.classList.remove('practice-target');

        // If all chord notes are hit, advance
        if (this._totalCount(this.practiceHitCounts) >= this._totalCount(this.practiceExpectedCounts)) {
            this._clearPracticeState();
        }
        return true;
    }
    
    _renderFrame(ts, scheduleNext = true) {
        this._frameTime = ts || performance.now();
        if (this.isPlaying && !this.isPaused) {
            const targetTimeSec = this._getGameClockSec(this._frameTime);
            if (!this._hasLogicClock) {
                this._logicClockSec = targetTimeSec;
                this._logicLastTargetSec = targetTimeSec;
                this._logicAccumulatorSec = 0;
                this._hasLogicClock = true;
            }
            let deltaToTarget = targetTimeSec - this._logicLastTargetSec;
            this._logicLastTargetSec = targetTimeSec;
            if (deltaToTarget < 0) {
                this._logicClockSec = targetTimeSec;
                this._logicLastTargetSec = targetTimeSec;
                this._logicAccumulatorSec = 0;
                deltaToTarget = 0;
            }
            const maxBacklog = this._fixedStepSec * this._maxCatchupSteps;
            this._logicAccumulatorSec = Math.min(this._logicAccumulatorSec + deltaToTarget, maxBacklog);

            let steps = 0;
            while (this._logicAccumulatorSec >= this._fixedStepSec && steps < this._maxCatchupSteps) {
                this._logicClockSec += this._fixedStepSec;
                this.update(this._logicClockSec);
                this._logicAccumulatorSec -= this._fixedStepSec;
                steps++;
            }

            if (steps === this._maxCatchupSteps) {
                this._logicClockSec = targetTimeSec;
                this._logicLastTargetSec = targetTimeSec;
                this._logicAccumulatorSec = 0;
                this.update(this._logicClockSec);
            } else if (steps === 0) {
                this.update(this._logicClockSec);
            }
        } else {
            this._logicAccumulatorSec = 0;
            this._hasLogicClock = false;
            this.update();
        }
        
        const w = this.canvas.width, h = this.canvas.height;
        const ctx = this.ctx;

        // ── Ultra-performance: skip the entire Canvas 2D pipeline ──
        if (this.ultraPerformance && this.noteRenderer && this.noteRenderer.available) {
            const canvasH = h + 50;
            const speed = this.speedMultiplier;
            this.noteRenderer.renderNotes(this.fallingNotes, this.keyPositions, {
                noteSpeed: this.noteSpeed,
                speedMultiplier: speed,
                noteStyle: 'beam',
                hitZoneY: this.hitZoneY,
                canvasH: canvasH,
                gameMode: this.gameMode,
                practiceWaiting: this.practiceWaiting,
                practiceExpectedNotes: this.practiceExpectedNotes,
                coPlayManualNotes: this.coPlayManualNotes,
                heldFallingNotes: this.heldFallingNotes,
                time: this._frameTime / 1000,
                neonGlow: this.neonGlowEnabled,
                bgOverlayOpacity: this.laneStyle === 'synthesia' ? this.bgOverlayOpacity : 0,
                renderStartIdx: this._firstActiveIdx,
                renderEndIdx: this._lastVisibleIdx,
            });
            if (scheduleNext) requestAnimationFrame(this._boundRender);
            return;
        }

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
        if (!this.fxOnlyMode) {
            this._drawTimeline();
        }

        // Draw falling notes (including hit notes — they stay visible until scrolled off)
        const canvasH = h + 50;
        const speed = this.speedMultiplier;

        if (this.noteRenderer && this.noteRenderer.available) {
            // === PixiJS GPU-accelerated note rendering ===
            this.noteRenderer.renderNotes(this.fallingNotes, this.keyPositions, {
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
                neonGlow: this.neonGlowEnabled,
                bgOverlayOpacity: this.laneStyle === 'synthesia' ? this.bgOverlayOpacity : 0,
                renderStartIdx: this._firstActiveIdx,
                renderEndIdx: this._lastVisibleIdx,
            });

            // No drawImage needed — browser composites the DOM canvases natively

            // Draw note labels on the 2D overlay canvas
            this._drawNoteLabels(ctx, speed, canvasH);
        } else {
            // === Canvas 2D fallback ===
            // If neon glow is enabled, draw notes to a glow canvas first for bloom
            if (this.neonGlowEnabled) {
                this._ensureGlowCanvas(w, h);
                const gctx = this._glowCtx;
                gctx.clearRect(0, 0, w, h);
                const origCtx = this.ctx;
                this.ctx = gctx;
                for (let i = this._firstActiveIdx; i < this._lastVisibleIdx; i++) {
                    const note = this.fallingNotes[i];
                    const dur = note.duration || 0.15;
                    const noteH = this._visibleNoteHeight(dur, speed);
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
                for (let i = this._firstActiveIdx; i < this._lastVisibleIdx; i++) {
                    const note = this.fallingNotes[i];
                    const dur = note.duration || 0.15;
                    const noteH = this._visibleNoteHeight(dur, speed);
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

        if (this.pianoFx) {
            const delta = (this._frameTime - (this._lastFxFrame || this._frameTime)) / 16.6667;
            this._lastFxFrame = this._frameTime;
            this.pianoFx.update(delta || 1);
        }
        this._cleanupFxKeyFills();
        
        if (scheduleNext) requestAnimationFrame(this._boundRender);
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
            if (!this.noteRenderer || !this.noteRenderer.available) {
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

        if (this.fxRibbonMode === 'hitbar') {
            const hitBarHeight = 12;
            lctx.fillStyle = 'rgba(218, 165, 32, 0.7)';
            lctx.fillRect(0, this.hitZoneY - hitBarHeight, w, hitBarHeight);
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
        const noteHeight = this._drawNoteHeight(dur, this.speedMultiplier, noteGap);
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
        } else if (this._isManualPracticeMode() && this.practiceWaiting && this.practiceExpectedNotes.has(note.note) && !note.hit) {
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
        if (this.showNoteNames && headHeight >= 12) {
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

    /** Draw text labels on the 2D canvas for WebGL-rendered notes (both beam and classic) */
    _drawNoteLabels(ctx, speed, canvasH) {
        if (!this.showNoteNames) return;

        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.fillStyle = '#fff';

        const isClassic = this.noteStyle === 'classic';

        for (let i = this._firstActiveIdx; i < this._lastVisibleIdx; i++) {
            const note = this.fallingNotes[i];
            const pos = this.keyPositions[note.note];
            if (!pos) continue;
            const dur = note.duration || 0.15;
            const noteH = this._visibleNoteHeight(dur, speed);
            const topEdge = note.y - noteH;
            if (topEdge >= canvasH || note.y <= -50) continue;

            const noteGap = 4;
            const noteHeight = this._drawNoteHeight(dur, speed, noteGap);

            let labelY;
            if (isClassic) {
                const bodyTop = note.y - noteHeight;
                const labelH = Math.min(14, noteHeight);
                if (labelH < 10) continue;
                labelY = bodyTop + labelH / 2 + 1;
            } else {
                const headHeight = Math.min(14, noteHeight);
                if (headHeight < 12) continue;
                labelY = note.y - headHeight + headHeight / 2;
            }
            ctx.strokeText(note.note, pos.x, labelY);
            ctx.fillText(note.note, pos.x, labelY);
        }
    }

    drawNoteClassic(note) {
        const pos = this.keyPositions[note.note];
        if (!pos) return;
        const ctx = this.ctx;

        const noteWidth = pos.width * 0.85;
        const dur = note.duration || 0.15;
        const noteGap = 4;
        const noteHeight = this._drawNoteHeight(dur, this.speedMultiplier, noteGap);
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

        // Optional note-name label near top of bar
        if (this.showNoteNames && noteHeight >= 10) {
            const labelH = Math.min(14, noteHeight);
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            const ly = y + labelH / 2 + 1;
            ctx.strokeText(note.note, pos.x, ly);
            ctx.fillStyle = '#fff';
            ctx.fillText(note.note, pos.x, ly);
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

    _drawTimeline() {
        if (!this.isPlaying || this.isPaused) return;
        if (this.laneStyle === 'synthesia') return; // clean look, no timeline grid
        const ctx = this.ctx;
        const speed = this.speedMultiplier;
        const currentTime = this._getGameClockSec(this._frameTime);
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
