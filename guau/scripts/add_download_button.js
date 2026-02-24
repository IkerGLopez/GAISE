// Inserts a download button into the player container (`div.o-player__play`).
// Requires the detect_mp3 helpers to be loaded first (detect_mp3.js).
// The player element is created dynamically; if it isn't present when the
// script runs we attach a MutationObserver and wait for it.
(function () {
    async function install() {
        const container = document.querySelector('div.o-player__play');
        if (!container) return false;

        // obtain URL using our helper routines
        let mp3 = null;
        if (typeof detectMp3FromPage === 'function') {
            mp3 = await detectMp3FromPage();
        }
        if (!mp3 && typeof detectMp3Simple === 'function') {
            const slug = location.pathname.split('/').filter(Boolean).pop();
            if (slug) mp3 = await detectMp3Simple(slug);
        }
        if (!mp3) {
            console.warn('could not determine mp3 URL');
            return true; // container found, nothing left to do
        }

        if (container.querySelector('.copilot-download-button')) return true;

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
        container.appendChild(btn);
        return true;
    }

    // try immediately, otherwise observe
    install().then(found => {
        if (!found) {
            const mo = new MutationObserver(() => {
                install().then(success => {
                    if (success) mo.disconnect();
                });
            });
            mo.observe(document.body, { childList: true, subtree: true });
        }
    });
})();