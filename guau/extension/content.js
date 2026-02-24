// content script for guau MP3 downloader
// runs on matching /m/euskadi-irratia-kantu-kontari-* pages

async function fetchMp3Url(slug) {
    try {
        const api = `https://guau.eus/api/v1/media/${encodeURIComponent(slug)}`;
        const res = await fetch(api);
        if (!res.ok) return null;
        const json = await res.json();
        return json?.manifests?.[0]?.manifestURL || null;
    } catch (e) {
        console.error('fetchMp3Url error', e);
        return null;
    }
}

function createButton(mp3) {
    const btn = document.createElement('a');
    btn.href = mp3;
    btn.download = '';
    btn.textContent = 'Download MP3';
    btn.className = 'copilot-download-button';
    btn.style.cssText = `
        display:inline-block;
        margin-left:0.5em;
        padding:0.3em 0.6em;
        background:#14BED6;
        color:#fff;
        font-size:0.9rem;
        border-radius:3px;
        text-decoration:none;
    `;
    return btn;
}

let mp3ButtonInserted = false;
async function ensureButton() {
    // avoid adding more than one button anywhere on the page
    if (mp3ButtonInserted || document.querySelector('.copilot-download-button')) {
        return true;
    }
    // set flag immediately to prevent race conditions during async fetch
    mp3ButtonInserted = true;

    // Target ONLY the main episode's share button, not the ones in the episode list.
    // The main share button is NOT inside a listitem, while list buttons are.
    // We also check it's not inside the episode list container (tabpanel).
    const allShareButtons = document.querySelectorAll('div.o-shareButton, div.m-shareButton');
    let share = null;
    for (const btn of allShareButtons) {
        // Skip if inside a listitem (episode list)
        if (btn.closest('listitem, [role="listitem"], li')) continue;
        // Skip if inside episode list tabpanel
        if (btn.closest('tabpanel, [role="tabpanel"]')) continue;
        // This should be the main episode share button
        share = btn;
        break;
    }
    
    let container = share ? share.parentElement : null;
    // fallback: previous selector if we couldn't locate the share wrapper
    if (!container) container = document.querySelector('div.o-player__play');
    if (!container) {
        mp3ButtonInserted = false; // reset flag if we couldn't find container
        return false;
    }

    const parts = location.pathname.split('/').filter(Boolean);
    const slug = parts.pop();
    if (!slug) return true;

    const mp3 = await fetchMp3Url(slug);
    if (!mp3) return true;

    const btn = createButton(mp3);
    container.appendChild(btn);
    return true;
}

// try immediately and also observe DOM for later insertion
(async () => {
    const found = await ensureButton();
    if (!found) {
        const observer = new MutationObserver(() => {
            ensureButton().then(done => {
                if (done) observer.disconnect();
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
})();
