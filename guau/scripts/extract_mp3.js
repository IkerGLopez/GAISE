// optimized extractor – relies on the helper functions in detect_mp3.js
// load detect_mp3.js first (e.g. paste it into the console or import it via a
// bookmarklet).  Once the helpers are available you can simply run this script
// to grab the MP3 URL for the current page, copy it to the clipboard and open
// a player.

(async () => {
    if (typeof detectMp3FromPage === 'function') {
        // use the convenience routine which reads the slug from the URL
        await detectMp3FromPage({ openInNewTab: true });
    } else if (typeof detectMp3Simple === 'function') {
        // fallback: manually supply the slug
        const slug = location.pathname.split('/').filter(Boolean).pop();
        if (slug) await detectMp3Simple(slug, { openInNewTab: true });
        else console.warn('No slug found in location.pathname');
    } else {
        console.warn('detect_mp3 utilities not available; copy detect_mp3.js first');
    }
})();
