import sys
import os
import yt_dlp

def download_video(url, output_folder="videos"):
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
    
    ydl_opts = {
        'outtmpl': os.path.join(output_folder, '%(title)s.%(ext)s'),
        'format': 'best',
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        print(f"Downloaded: {info['title']}")
        return info['title']

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python download_cli.py <youtube_url>")
        sys.exit(1)
    
    url = sys.argv[1]
    try:
        download_video(url)
    except Exception as e:
        print(f"Error: {e}")
