# MyOwnMCP ✅

A small MCP (Model Context Protocol) helper that provides a tool to download YouTube videos and a resource to list already-downloaded videos.

---

## ⚙️ What it does

- **Downloads Videos**: Provides a tool `download_video` that downloads YouTube videos into the `videos/` folder.
- **Supports Playlists**: Can download multiple videos from a playlist URL (with a configurable limit).
- **Audio Only Mode**: Can extract just the audio (MP3/M4A) for podcasts or music.
- **Lists Content**: Provides a resource `videos://list` that returns the list of downloaded files.
- Uses `yt-dlp` for downloading (a reliable alternative to `pytube`).

---

## 🚀 Quick start

1. Create a Python environment (recommended):

```bash
python -m venv .venv
.\.venv\Scripts\activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. (Optional) Test the CLI downloader:

```bash
python download_cli.py "https://www.youtube.com/watch?v=VIDEO_ID"
```

This downloads the requested video into the `videos/` folder.

4. Run the MCP server:

```bash
python server.py
```

The server uses FastMCP and runs as a stdio MCP server — connect with your favorite MCP client or IDE integration that supports MCP.

---

## 🧩 Using the MCP tools

- Tool: `download_video`
  - Parameter: `url` (string) — a YouTube video URL or Playlist URL
  - Parameter: `audio_only` (boolean, optional, default: false) — If true, downloads only the audio.
  - Parameter: `max_playlist_items` (integer, optional, default: 5) — Max videos to download if URL is a playlist.
  - Returns: a short success or error message

- Resource: `videos://list`
  - Returns a newline-separated list of video filenames contained in `videos/`.

Example (conceptual):

```json
# Call the tool (single video)
{ "tool": "download_video", "args": { "url": "https://www.youtube.com/watch?v=VIDEO_ID" } }

# Call the tool (playlist, first 3 videos, audio only)
{ "tool": "download_video", "args": { 
    "url": "https://www.youtube.com/playlist?list=PLAYLIST_ID",
    "audio_only": true,
    "max_playlist_items": 3
  } 
}

# Ask for the list
{ "resource": "videos://list" }
```

(How you call tools/resources depends on your MCP client.)

---

## 📁 Files of interest

- `server.py` — FastMCP server with the `download_video` tool and `videos://list` resource
- `download_cli.py` — simple CLI helper to test downloads without MCP
- `videos/` — where downloaded videos are stored
- `requirements.txt` — project dependencies (`fastmcp`, `yt-dlp`)

---

## ⚠️ Notes & troubleshooting

- `yt-dlp` may warn about missing JS runtimes (e.g. Node/Deno) for some sites; installing Node or Deno will remove the warning and enable full extraction.
- If downloads fail, try updating `yt-dlp`:

```bash
python -m pip install -U yt-dlp
```

- This project intentionally uses `yt-dlp` instead of `pytube` due to compatibility and reliability.

---

If you want, I can add a simple example MCP client or make the server run as an HTTP API — tell me which you prefer. ✨
