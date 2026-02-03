// API base URL
const API_URL = window.location.origin;

// Store current subtitles data
let currentSubtitles = null;
let currentVideoId = null;

// DOM elements
const urlForm = document.getElementById('urlForm');
const videoUrlInput = document.getElementById('videoUrl');
const fetchBtn = document.getElementById('fetchBtn');
const btnText = fetchBtn.querySelector('.btn-text');
const spinner = fetchBtn.querySelector('.spinner');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const subtitlesSection = document.getElementById('subtitlesSection');
const subtitlesContent = document.getElementById('subtitlesContent');
const downloadBtn = document.getElementById('downloadBtn');

// Utility functions
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    successMessage.classList.add('hidden');
    setTimeout(() => {
        errorMessage.classList.add('hidden');
    }, 5000);
}

function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.classList.remove('hidden');
    errorMessage.classList.add('hidden');
    setTimeout(() => {
        successMessage.classList.add('hidden');
    }, 3000);
}

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function setLoading(isLoading) {
    fetchBtn.disabled = isLoading;
    if (isLoading) {
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');
    } else {
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
}

function displaySubtitles(subtitles) {
    subtitlesContent.innerHTML = '';
    
    subtitles.forEach((entry, index) => {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'subtitle-entry';
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'subtitle-time';
        timeDiv.textContent = `[${formatTime(entry.start)}]`;
        
        const textDiv = document.createElement('div');
        textDiv.className = 'subtitle-text';
        textDiv.textContent = entry.text;
        
        entryDiv.appendChild(timeDiv);
        entryDiv.appendChild(textDiv);
        subtitlesContent.appendChild(entryDiv);
    });
    
    subtitlesSection.classList.remove('hidden');
}

// Event handlers
urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const url = videoUrlInput.value.trim();
    
    if (!url) {
        showError('Please enter a YouTube URL');
        return;
    }
    
    setLoading(true);
    errorMessage.classList.add('hidden');
    subtitlesSection.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_URL}/api/subtitles`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch subtitles');
        }
        
        if (data.success && data.subtitles) {
            currentSubtitles = data.subtitles;
            currentVideoId = data.video_id;
            displaySubtitles(data.subtitles);
            showSuccess('Subtitles loaded successfully!');
        } else {
            throw new Error('No subtitles data received');
        }
        
    } catch (error) {
        showError(error.message);
        currentSubtitles = null;
        currentVideoId = null;
    } finally {
        setLoading(false);
    }
});

downloadBtn.addEventListener('click', async () => {
    if (!currentSubtitles || !currentVideoId) {
        showError('No subtitles to download');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                subtitles: currentSubtitles,
                video_id: currentVideoId,
            }),
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to download subtitles');
        }
        
        // Get the filename from the Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'subtitles.srt';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }
        
        // Download the file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showSuccess('Subtitles downloaded successfully!');
        
    } catch (error) {
        showError(error.message);
    }
});

// Clear error message when user starts typing
videoUrlInput.addEventListener('input', () => {
    errorMessage.classList.add('hidden');
});
