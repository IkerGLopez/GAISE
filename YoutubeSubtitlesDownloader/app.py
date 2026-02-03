from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import yt_dlp
import tempfile
import os
import re
import io
from datetime import datetime

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

def extract_video_id(url):
    """Extract YouTube video ID from URL"""
    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',
        r'(?:embed\/)([0-9A-Za-z_-]{11})',
        r'^([0-9A-Za-z_-]{11})$'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def format_time(seconds):
    """Convert seconds to SRT time format"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def create_srt(transcript):
    """Convert transcript to SRT format"""
    srt_content = []
    for i, entry in enumerate(transcript, 1):
        start_time = format_time(entry['start'])
        end_time = format_time(entry['start'] + entry['duration'])
        text = entry['text']
        
        srt_content.append(f"{i}")
        srt_content.append(f"{start_time} --> {end_time}")
        srt_content.append(text)
        srt_content.append("")
    
    return "\n".join(srt_content)

@app.route('/')
def index():
    """Serve the main page"""
    return app.send_static_file('index.html')

@app.route('/api/subtitles', methods=['POST'])
def get_subtitles():
    """Fetch subtitles for a YouTube video using yt-dlp"""
    try:
        data = request.get_json()
        url = data.get('url', '')
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        video_id = extract_video_id(url)
        if not video_id:
            return jsonify({'error': 'Invalid YouTube URL'}), 400

        # yt-dlp options for extracting subtitles only
        ydl_opts = {
            'skip_download': True,
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitlesformat': 'srt',
            'subtitleslangs': ['en', 'en-US', 'en-GB', 'all'],
            'quiet': True,
            'outtmpl': {'default': '%(id)s.%(ext)s'},
        }
        # Use cookies.txt for authentication if available
        cookies_path = os.path.join(os.path.dirname(__file__), 'cookies.txt')
        if os.path.exists(cookies_path):
            ydl_opts['cookiefile'] = cookies_path
        transcript = None
        subtitle_lang = None
        srt_path = None
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            # Find available subtitles
            subs = info.get('subtitles') or {}
            auto_subs = info.get('automatic_captions') or {}
            # Prefer English, fallback to any
            lang_priority = ['en', 'en-US', 'en-GB'] + list(subs.keys()) + list(auto_subs.keys())
            found = False
            for lang in lang_priority:
                if lang in subs:
                    subtitle_lang = lang
                    found = True
                    break
                elif lang in auto_subs:
                    subtitle_lang = lang
                    found = True
                    break
            if not found:
                return jsonify({'error': 'No subtitles found for this video'}), 404

            # Download the subtitle file to a temp directory
            with tempfile.TemporaryDirectory() as tmpdir:
                ydl_opts_dl = ydl_opts.copy()
                ydl_opts_dl['outtmpl'] = {'default': os.path.join(tmpdir, '%(id)s.%(ext)s')}
                ydl_opts_dl['skip_download'] = True
                ydl_opts_dl['writesubtitles'] = True
                ydl_opts_dl['writeautomaticsub'] = True
                ydl_opts_dl['subtitleslangs'] = [subtitle_lang]
                ydl_opts_dl['quiet'] = True
                with yt_dlp.YoutubeDL(ydl_opts_dl) as ydl_dl:
                    ydl_dl.download([url])
                # Find the SRT file
                for ext in ['srt', 'vtt']:
                    candidate = os.path.join(tmpdir, f'{video_id}.{ext}')
                    if os.path.exists(candidate):
                        srt_path = candidate
                        break
                if not srt_path:
                    return jsonify({'error': 'Failed to download subtitles'}), 500
                # If VTT, convert to SRT
                if srt_path.endswith('.vtt'):
                    with open(srt_path, 'r', encoding='utf-8') as f:
                        vtt_data = f.read()
                    srt_data = vtt_to_srt(vtt_data)
                else:
                    with open(srt_path, 'r', encoding='utf-8') as f:
                        srt_data = f.read()
                # Parse SRT to transcript list
                transcript = parse_srt_to_transcript(srt_data)

        if not transcript:
            return jsonify({'error': 'No subtitles found for this video'}), 404

        return jsonify({
            'success': True,
            'video_id': video_id,
            'subtitles': transcript
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Helper: Convert VTT to SRT
def vtt_to_srt(vtt_data):
    srt = []
    counter = 1
    for line in vtt_data.splitlines():
        if '-->' in line:
            line = line.replace('.', ',')
            srt.append(str(counter))
            counter += 1
        srt.append(line)
    return '\n'.join(srt)

# Helper: Parse SRT to transcript list
def parse_srt_to_transcript(srt_data):
    transcript = []
    entries = srt_data.strip().split('\n\n')
    for entry in entries:
        lines = entry.strip().split('\n')
        if len(lines) >= 3:
            # SRT: idx, time, text
            time_line = lines[1]
            text = ' '.join(lines[2:])
            start_str, end_str = time_line.split(' --> ')
            start = srt_time_to_seconds(start_str)
            end = srt_time_to_seconds(end_str)
            transcript.append({
                'start': start,
                'duration': end - start,
                'text': text
            })
    return transcript

# Helper: SRT time to seconds
def srt_time_to_seconds(timestr):
    h, m, s_ms = timestr.split(':')
    s, ms = s_ms.split(',')
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0

@app.route('/api/download', methods=['POST'])
def download_subtitles():
    """Download subtitles as SRT file"""
    try:
        data = request.get_json()
        transcript = data.get('subtitles', [])
        video_id = data.get('video_id', 'subtitles')
        
        if not transcript:
            return jsonify({'error': 'No subtitles provided'}), 400
        
        # Create SRT content
        srt_content = create_srt(transcript)
        
        # Create file in memory
        file_stream = io.BytesIO(srt_content.encode('utf-8'))
        file_stream.seek(0)
        
        # Generate filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{video_id}_{timestamp}.srt"
        
        return send_file(
            file_stream,
            as_attachment=True,
            download_name=filename,
            mimetype='text/plain'
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
