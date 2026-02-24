# Guau.eus Audio URL Analysis

## Discovered MP3 URL
```
https://cdn.primeran.eus/media/audios/23lufs_Euskadi Irratia_2002758_9883363_Joseina E_-2026-02-20-15-01-28.mp3
```

## How the URL is Retrieved

### 1. **API Endpoint**
The application makes an API call to retrieve media metadata:
```
GET https://guau.eus/api/v1/media/{slug}
```

For our specific episode:
```
GET https://guau.eus/api/v1/media/euskadi-irratia-kantu-kontari-20260220-1505
```

### 2. **API Response Structure**
The API returns a JSON object with the following structure:

```json
{
  "id": 136841,
  "slug": "euskadi-irratia-kantu-kontari-20260220-1505",
  "title": "Joseina Etxeberria",
  "duration": 3214,
  "access_restriction": "registration_required",
  "manifests": [
    {
      "manifestURL": "https://cdn.primeran.eus/media/audios/23lufs_Euskadi Irratia_2002758_9883363_Joseina E_-2026-02-20-15-01-28.mp3",
      "type": "mp3"
    }
  ]
}
```

### 3. **URL Extraction Path**
```javascript
// JavaScript path to extract the MP3 URL:
const apiResponse = await fetch(`https://guau.eus/api/v1/media/${slug}`);
const data = await apiResponse.json();
const mp3Url = data.manifests[0].manifestURL;
```

### 4. **URL Pattern Analysis**

The MP3 URL follows a consistent pattern:
```
https://cdn.primeran.eus/media/audios/{normalization}_{station}_{external_id}_{dalet_id}_{title_partial}_-{timestamp}.mp3
```

Components:
- **normalization**: `23lufs` (23 LUFS audio normalization standard)
- **station**: `Euskadi Irratia` (radio station name)
- **external_id**: `2002758` (program identifier)
- **dalet_id**: `9883363` (episode ID from Dalet broadcast system)
- **title_partial**: `Joseina E` (truncated presenter name)
- **timestamp**: `2026-02-20-15-01-28` (broadcast date-time)

### 5. **Application Configuration**

From `script.js`, the base configuration is:
```javascript
window.config = {
  WEB_URL: 'http://guau.eus',
  BASE_API_URL: 'https://primeran.eus',
  NODE_ENV: 'production',
  REMOTE_API_URL: 'https://primeran.eus',
  APP_NAME: 'guau',
  SSO_ENABLED: true
}
```

### 6. **Data Flow**

```
1. Page Load
   └──> URL slug extracted: "euskadi-irratia-kantu-kontari-20260220-1505"
   
2. API Request
   └──> GET https://guau.eus/api/v1/media/euskadi-irratia-kantu-kontari-20260220-1505
   
3. API Response
   └──> JSON with manifests array
   
4. URL Extraction
   └──> manifests[0].manifestURL
   
5. Audio Player
   └──> Loads MP3 from CDN: cdn.primeran.eus
```

### 7. **Access Control**

The API response indicates:
```json
"access_restriction": "registration_required"
```

This means:
- Anonymous users can fetch the metadata
- The MP3 URL is exposed in the API response
- **However**, the CDN likely checks authentication/session tokens when the MP3 is actually requested
- Users must be logged in (SSO via Gigya) to stream the audio

### 8. **Code Location in Downloaded Files**

**JavaScript files analyzed:**
- `web/guau_files/script.js` - Contains configuration only (BASE_API_URL)
- `web/guau_files/index-5ba4ee86.js` - Main application logic (75 KB, minified)
  - Contains HTTP request functionality (fetch/XMLHttpRequest)
  - **Does NOT** contain hardcoded API paths
  - Likely constructs API URLs dynamically from config
  
**Key findings:**
- The API path `/api/v1/media/` is NOT present in client-side JavaScript
- This suggests the API calls are constructed using:
  ```javascript
  `${window.config.BASE_API_URL}/api/v1/media/${slug}`
  ```
- The slug is extracted from the URL path (router-based)

### 9. **Technical Stack**

Based on file analysis:
- **Frontend Framework**: Likely SolidJS (evidence: `window._$HY` hydration object)
- **Build Tool**: Vite (file naming: `vite/index-*.js`)
- **SSO Provider**: Gigya (`gigya.js`)
- **API**: REST API at `guau.eus/api/v1/`
- **CDN**: `cdn.primeran.eus` for media delivery

### 10. **Reproduction Steps**

To programmatically extract the MP3 URL:

```powershell
# PowerShell
$slug = "euskadi-irratia-kantu-kontari-20260220-1505"
$apiUrl = "https://guau.eus/api/v1/media/$slug"
$response = Invoke-RestMethod -Uri $apiUrl
$mp3Url = $response.manifests[0].manifestURL
Write-Host "MP3 URL: $mp3Url"
```

```python
# Python
import requests

slug = "euskadi-irratia-kantu-kontari-20260220-1505"
api_url = f"https://guau.eus/api/v1/media/{slug}"
response = requests.get(api_url)
data = response.json()
mp3_url = data['manifests'][0]['manifestURL']
print(f"MP3 URL: {mp3_url}")
```

```javascript
// JavaScript/Node.js
const slug = "euskadi-irratia-kantu-kontari-20260220-1505";
const apiUrl = `https://guau.eus/api/v1/media/${slug}`;
const response = await fetch(apiUrl);
const data = await response.json();
const mp3Url = data.manifests[0].manifestURL;
console.log(`MP3 URL: ${mp3Url}`);
```

## Conclusion

The MP3 URL is **not hardcoded** in the HTML or JavaScript files. Instead, it is:

1. **Retrieved dynamically** from the REST API
2. **Stored** in the `manifests` array of the API response
3. **Extracted** by the player component from `manifests[0].manifestURL`
4. **Protected** by authentication requirements (registration_required)

The client-side code likely:
- Parses the URL slug from the browser location
- Makes an authenticated API request using the session token
- Receives the manifest data
- Passes the `manifestURL` to an HTML5 `<audio>` element or media player library
