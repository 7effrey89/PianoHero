# FFmpeg Usage in PianoHero

## Overview

FFmpeg is a critical dependency in the PianoHero project that enables audio extraction from YouTube videos. It works in conjunction with yt-dlp (a YouTube video downloader) to process video content into audio files that can be analyzed for MIDI conversion.

## Primary Use Case: Audio Extraction

### Where It's Used

FFmpeg is configured and used in the `server.py` file within the `download_youtube_audio()` function (lines 56-79).

### Specific Functionality

**Location**: `server.py`, lines 62-66

```python
ydl_opts = {
    'format': 'bestaudio/best',
    'postprocessors': [{
        'key': 'FFmpegExtractAudio',
        'preferredcodec': 'mp3',
        'preferredquality': '192',
    }],
    ...
}
```

### What FFmpeg Does

1. **Audio Stream Extraction**: FFmpeg extracts the audio stream from YouTube videos downloaded by yt-dlp
2. **Format Conversion**: Converts the audio to MP3 format with 192 kbps quality
3. **Codec Processing**: Uses the FFmpegExtractAudio post-processor to handle audio extraction and codec conversion

## Technical Details

### Integration with yt-dlp

FFmpeg is not called directly in the Python code. Instead, it's used as a backend by yt-dlp through the `FFmpegExtractAudio` post-processor:

- yt-dlp downloads the video
- yt-dlp invokes FFmpeg through its post-processor framework
- FFmpeg extracts and converts the audio to MP3
- The resulting audio file is saved for MIDI conversion

### Configuration Parameters

- **preferredcodec**: `mp3` - Audio is converted to MP3 format
- **preferredquality**: `192` - Audio bitrate is set to 192 kbps
- **format**: `bestaudio/best` - yt-dlp selects the best available audio stream

## Installation Requirements

FFmpeg must be installed on the system before running PianoHero. The README.md provides installation instructions:

### Linux (Ubuntu/Debian)
```bash
sudo apt-get install ffmpeg
```

### macOS
```bash
brew install ffmpeg
```

### Windows
Download from https://ffmpeg.org/download.html

## Workflow

The complete audio processing workflow is:

1. User submits a YouTube URL through the web interface
2. Python backend extracts the video ID
3. `download_youtube_audio()` is called with the video ID
4. yt-dlp downloads the best audio stream
5. **FFmpeg extracts and converts the audio to MP3** ← This is where FFmpeg is used
6. The audio file is saved to a temporary directory
7. Audio file is processed for MIDI note generation
8. Results are cached and returned to the frontend

## Why FFmpeg is Essential

Without FFmpeg, the application cannot:
- Extract audio from downloaded YouTube videos
- Convert audio to a consistent format (MP3)
- Process audio for MIDI conversion

The application will fail at the audio extraction stage if FFmpeg is not installed.

## Supported Audio Formats

After FFmpeg processing, the application looks for these audio file extensions:

```python
AUDIO_FILE_EXTENSIONS = ['.mp3', '.m4a', '.webm', '.opus', '.wav']
```

While FFmpeg specifically converts to MP3 in the current configuration, the code is flexible enough to handle other formats that yt-dlp might produce.

## Error Handling

If FFmpeg is not installed or fails during audio extraction:
- The `download_youtube_audio()` function returns `False`
- The conversion process stops
- The API returns a 500 error: "Failed to convert video"

## Summary

**FFmpeg is used for audio extraction and format conversion in PianoHero**. It serves as the audio processing backend for yt-dlp, enabling the extraction of audio streams from YouTube videos and their conversion to MP3 format at 192 kbps quality. This audio file is then used for MIDI note generation to create the gameplay experience.
