from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound, VideoUnavailable
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
    """Fetch subtitles for a YouTube video"""
    try:
        data = request.get_json()
        url = data.get('url', '')
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        video_id = extract_video_id(url)
        
        if not video_id:
            return jsonify({'error': 'Invalid YouTube URL'}), 400
        
        try:
            # Try to get transcript (prioritize English, then any available language)
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            
            # Try to get English transcript first
            try:
                transcript = transcript_list.find_transcript(['en']).fetch()
            except:
                # Get any available transcript
                transcript = transcript_list.find_generated_transcript(
                    transcript_list._manually_created_transcripts.keys() or 
                    transcript_list._generated_transcripts.keys()
                ).fetch()
            
            return jsonify({
                'success': True,
                'video_id': video_id,
                'subtitles': transcript
            })
            
        except TranscriptsDisabled:
            return jsonify({'error': 'Subtitles are disabled for this video'}), 404
        except NoTranscriptFound:
            return jsonify({'error': 'No subtitles found for this video'}), 404
        except VideoUnavailable:
            return jsonify({'error': 'Video not found or unavailable'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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
