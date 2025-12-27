const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - Configure CORS for production
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000'
        : '*',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(__dirname));

// Create midi_cache directory if it doesn't exist
const midiCacheDir = path.join(__dirname, 'midi_cache');
if (!fs.existsSync(midiCacheDir)) {
    fs.mkdirSync(midiCacheDir);
}

// Validate YouTube video ID format
function isValidVideoId(videoId) {
    return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

// Endpoint to convert YouTube to MIDI
app.post('/api/convert', async (req, res) => {
    const { youtubeUrl } = req.body;
    
    if (!youtubeUrl) {
        return res.status(400).json({ error: 'YouTube URL is required' });
    }
    
    try {
        // Extract video ID
        const videoId = extractVideoId(youtubeUrl);
        if (!videoId || !isValidVideoId(videoId)) {
            return res.status(400).json({ error: 'Invalid YouTube URL or video ID' });
        }
        
        // Check if MIDI file already exists in cache
        const midiFilePath = path.join(midiCacheDir, `${videoId}.json`);
        
        if (fs.existsSync(midiFilePath)) {
            const midiData = JSON.parse(fs.readFileSync(midiFilePath, 'utf8'));
            return res.json({ success: true, notes: midiData.notes, cached: true });
        }
        
        // For now, return demo notes since youtube2midi requires complex setup
        // In production, you would use actual MIDI conversion here
        const demoNotes = generateDemoNotes();
        
        // Cache the notes
        fs.writeFileSync(midiFilePath, JSON.stringify({ notes: demoNotes }));
        
        res.json({ success: true, notes: demoNotes, cached: false });
        
    } catch (error) {
        console.error('Conversion error:', error);
        res.status(500).json({ error: 'Failed to convert YouTube video' });
    }
});

// Serve cached MIDI files
app.get('/api/midi/:videoId', (req, res) => {
    const { videoId } = req.params;
    
    // Validate video ID to prevent path traversal
    if (!isValidVideoId(videoId)) {
        return res.status(400).json({ error: 'Invalid video ID format' });
    }
    
    const midiFilePath = path.join(midiCacheDir, `${videoId}.json`);
    
    if (fs.existsSync(midiFilePath)) {
        const midiData = JSON.parse(fs.readFileSync(midiFilePath, 'utf8'));
        res.json(midiData);
    } else {
        res.status(404).json({ error: 'MIDI file not found' });
    }
});

function extractVideoId(url) {
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

function generateDemoNotes() {
    // Generate a more realistic note pattern
    const notes = [];
    const patterns = [
        ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
        ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'],
        ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'C4'],
        ['F4', 'A4', 'C5', 'A4', 'F4', 'D4', 'F4']
    ];
    
    let time = 2;
    patterns.forEach(pattern => {
        pattern.forEach(note => {
            notes.push({
                note: note,
                time: time,
                duration: 0.4
            });
            time += 0.5;
        });
        time += 1;
    });
    
    return notes;
}

app.listen(PORT, () => {
    console.log(`Piano Hero server running on http://localhost:${PORT}`);
    console.log(`MIDI cache directory: ${midiCacheDir}`);
});
