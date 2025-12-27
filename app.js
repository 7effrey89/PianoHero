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
        
        // Game settings
        this.noteSpeed = 200; // pixels per second
        this.hitZoneY = this.canvas.height - 80;
        this.hitTolerance = 50; // pixels tolerance for hitting notes
        
        // API configuration
        this.apiBaseUrl = window.location.origin; // Use same origin as the page
        
        // Note to key mapping
        this.noteToKey = {
            'C4': 'A', 'C#4': 'W', 'D4': 'S', 'D#4': 'E',
            'E4': 'D', 'F4': 'F', 'F#4': 'T', 'G4': 'G',
            'G#4': 'Y', 'A4': 'H', 'A#4': 'U', 'B4': 'J', 'C5': 'K'
        };
        
        this.keyToNote = Object.fromEntries(
            Object.entries(this.noteToKey).map(([note, key]) => [key, note])
        );
        
        // Piano key positions (for rendering)
        this.keyPositions = this.calculateKeyPositions();
        
        // Audio synthesis for piano sounds (lazy initialization)
        this.audioContext = null;
        this.noteFrequencies = {
            'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13,
            'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00,
            'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88, 'C5': 523.25
        };
        
        this.init();
    }
    
    init() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Event listeners
        this.loadBtn.addEventListener('click', () => this.loadYouTubeAudio());
        this.startBtn.addEventListener('click', () => this.startGame());
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
    
    resizeCanvas() {
        const container = document.getElementById('gameCanvas');
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.hitZoneY = this.canvas.height - 20; // Hit zone at bottom, just above piano keys
        this.keyPositions = this.calculateKeyPositions();
    }
    
    calculateKeyPositions() {
        const positions = {};
        const allNotes = ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5'];
        
        // Get actual DOM positions of piano keys
        allNotes.forEach(note => {
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
            
            // Call backend API to convert YouTube to MIDI
            const response = await fetch(`${this.apiBaseUrl}/api/convert`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ youtubeUrl: url })
            });
            
            if (!response.ok) {
                throw new Error('Failed to convert YouTube video');
            }
            
            const data = await response.json();
            
            this.statusMessage.textContent = 'Analyzing notes...';
            this.updateProgress(70);
            
            // Use notes from backend
            this.notes = data.notes;
            
            this.statusMessage.textContent = `Analysis complete! Found ${this.notes.length} notes. ${data.cached ? '(Loaded from cache)' : ''} Click Start Game to play!`;
            this.updateProgress(100);
            this.startBtn.disabled = false;
            
        } catch (error) {
            console.error('Error loading YouTube audio:', error);
            this.statusMessage.textContent = 'Error: Could not connect to backend server. Make sure the server is running (npm start).';
            
            // Fallback to demo notes if server is not available
            this.statusMessage.textContent += ' Using demo notes instead.';
            this.notes = this.generateDemoNotes();
            this.startBtn.disabled = false;
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
        this.pressKey(key);
    }
    
    handlePianoKeyRelease(keyElement) {
        const key = keyElement.dataset.key;
        this.releaseKey(key);
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
        // Create audio context if not exists
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const frequency = this.noteFrequencies[note];
        if (!frequency) return;
        
        // Create oscillator for the note
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Set frequency and wave type
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        // Envelope for natural piano-like sound
        const now = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        
        // Play the note
        oscillator.start(now);
        oscillator.stop(now + 0.5);
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
            this.statusMessage.textContent = 
                `Game Over! Final Score: ${this.score} | Accuracy: ${this.accuracyElement.textContent}%`;
            this.startBtn.disabled = false;
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
        const allNotes = ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5'];
        
        allNotes.forEach(note => {
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
        this.ctx.font = 'bold 12px Arial';
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
