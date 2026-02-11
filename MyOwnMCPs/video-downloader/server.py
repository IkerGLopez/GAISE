from fastmcp import FastMCP
import yt_dlp
import os

# Create the FastMCP server
mcp = FastMCP("MyVideoDownloader")

@mcp.tool()
def download_video(url: str, audio_only: bool = False, max_playlist_items: int = 5) -> str:
    """Downloads a YouTube video given its URL.
    
    Args:
        url: The URL of the YouTube video to download.
        audio_only: Download only audio (mp3/m4a) instead of video. Defaults to False.
        max_playlist_items: If URL is a playlist, limit the number of videos to download. Defaults to 5.
    """
    output_folder = "videos"
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
    
    # Configure yt-dlp options
    ydl_opts = {
        'outtmpl': os.path.join(output_folder, '%(title)s.%(ext)s'),
        'format': 'bestaudio/best' if audio_only else 'best',
        'quiet': True,
        'no_warnings': True,
        'playlistend': max_playlist_items
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            
            if 'entries' in info:
                # Playlist or multiple items
                # entries is a lazy generator, but extract_info(download=True) typically exhausts it or returns a list if flat_playlist is not used
                # We can't easily count without iterating, but extract_info returns a dict with 'entries' which might be a list
                title = info.get('title', 'Playlist')
                return f"Successfully processed playlist: {title} (limit: {max_playlist_items})"
            else:
                return f"Successfully downloaded: {info['title']}"
    except Exception as e:
        return f"Error downloading video: {str(e)}"

@mcp.resource("videos://list")
def list_videos() -> str:
    """Lists all downloaded videos in the videos folder."""
    output_folder = "videos"
    if not os.path.exists(output_folder):
        return "No videos have been downloaded yet."
    
    files = [f for f in os.listdir(output_folder) if os.path.isfile(os.path.join(output_folder, f))]
    
    if not files:
        return "No videos found."
        
    return "\n".join(files)

if __name__ == "__main__":
    mcp.run()
