// Extrae la URL MP3 preferente (manifests[0].manifestURL) o, si no existe, busca la primera .mp3 en la respuesta.
// Uso: detectMp3Simple('euskadi-irratia-kantu-kontari-20260206-1505')
//       detectMp3FromPage()  // usa slug de la URL actual
async function detectMp3Simple(slugOrId, { openInNewTab = false } = {}) {
  try {
    const res = await fetch(`/api/v1/media/${encodeURIComponent(String(slugOrId))}`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // Preferencia: manifests[0].manifestURL
    let mp3 = json?.manifests?.[0]?.manifestURL ?? null;

    // Fallback: primera URL *.mp3 encontrada en el JSON
    if (!mp3) {
      const match = JSON.stringify(json).match(/https?:\/\/[^"']+\.mp3[^\s"']*/i);
      mp3 = match ? match[0] : null;
    }

    if (!mp3) { console.warn('No se encontró URL .mp3 en la respuesta'); return null; }
    mp3 = mp3.trim();
    console.log('MP3 encontrada:', mp3);

    try { await navigator.clipboard.writeText(mp3); console.log('Copiada al portapapeles ✅'); } catch (e) { console.warn('No se pudo copiar al portapapeles:', e); }

    if (openInNewTab) window.open(mp3, '_blank');
    return mp3;
  } catch (err) {
    console.error('Error detectMp3Simple:', err);
    return null;
  }
}

async function detectMp3FromPage(opts){ 
  const slug = location.pathname.split('/').filter(Boolean).pop(); 
  return slug ? detectMp3Simple(slug, opts) : (console.warn('No slug en la URL'), null);
}