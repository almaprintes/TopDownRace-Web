(() => {
  'use strict';
  const root = document.getElementById('records');
  if (!root) return;
  // Visitors only read GitHub's shared static copy. Never query Supabase here.
  const URL = 'https://raw.githubusercontent.com/almaprintes/TopDownRace-Web/rankings-data/leaderboards.json';
  const REFRESH_MS = 300000;
  const STALE_MS = 20 * 60000;
  const select = document.getElementById('rankingTrack');
  const body = document.getElementById('rankingRows');
  const status = document.getElementById('rankingStatus');
  const empty = document.getElementById('rankingEmpty');
  const table = document.getElementById('rankingTable');
  const names = {'circuito-atlantico':'Circuito Atlántico','karting-canarias':'Karting Canarias','karting-tenerife':'Karting Tenerife','santa-cruz':'Santa Cruz'};
  const messages = {
    es: {loading:'Cargando los tiempos…',updated:'Actualizado',stale:'La actualización se está retrasando. Últimos datos:',error:'No se han podido cargar los tiempos. Lo intentaremos de nuevo.',offline:'No se ha podido comprobar la actualización. Últimos datos:',empty:'Todavía no hay tiempos publicados en este circuito. ¿Estrenas tú la clasificación?'},
    en: {loading:'Loading lap times…',updated:'Updated',stale:'The update is delayed. Latest data:',error:'Lap times could not be loaded. We will try again.',offline:'Could not check for updates. Latest data:',empty:'No published times on this track yet. Will you be the first?'},
    it: {loading:'Caricamento dei tempi…',updated:'Aggiornato',stale:'Aggiornamento in ritardo. Ultimi dati:',error:'Impossibile caricare i tempi. Riproveremo.',offline:'Impossibile verificare gli aggiornamenti. Ultimi dati:',empty:'Nessun tempo pubblicato su questo circuito. Sarai il primo?'}
  };
  let snapshot = null, loading = false, failed = false, lastAttempt = 0, visible = false;
  const lang = () => messages[document.documentElement.lang] ? document.documentElement.lang : 'es';
  function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor(ms / 1000) % 60;
    return `${minutes}:${String(seconds).padStart(2,'0')}.${String(ms % 1000).padStart(3,'0')}`;
  }
  function render() {
    const text = messages[lang()];
    if (!snapshot) {
      status.textContent = text[failed ? 'error' : 'loading'];
      status.dataset.state = failed ? 'error' : 'loading';
      return;
    }
    const selected = select.value;
    select.replaceChildren(...snapshot.tracks.map(track => {
      const option = document.createElement('option');
      option.value = track.id;
      option.textContent = names[track.id] || track.id.replaceAll('-',' ');
      return option;
    }));
    if (snapshot.tracks.some(track => track.id === selected)) select.value = selected;
    const track = snapshot.tracks.find(item => item.id === select.value);
    const entries = track?.entries || [];
    body.replaceChildren(...entries.map(entry => {
      const row = document.createElement('tr');
      row.dataset.rank = String(entry.rank);
      for (const value of [String(entry.rank).padStart(2,'0'),entry.nick,formatTime(entry.best_time_ms)]) {
        const cell = document.createElement('td');
        cell.textContent = value; // Player names are untrusted text, never HTML.
        row.append(cell);
      }
      return row;
    }));
    table.hidden = !entries.length;
    empty.hidden = !!entries.length;
    empty.textContent = text.empty;
    select.disabled = snapshot.tracks.length === 0;
    const generated = new Date(snapshot.generated_at);
    const stale = Date.now() - generated.getTime() > STALE_MS;
    status.dataset.state = stale || failed ? 'stale' : 'ready';
    const prefix = stale ? text.stale : failed ? text.offline : text.updated;
    status.textContent = `${prefix} ${new Intl.DateTimeFormat(lang(),{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(generated)}`;
  }
  function valid(data) {
    return data?.version === 1 && Number.isFinite(Date.parse(data.generated_at)) && Date.parse(data.generated_at) <= Date.now()+60000 &&
      Array.isArray(data.tracks) && data.tracks.length <= 100 && data.tracks.every(track =>
        typeof track.id === 'string' && Array.isArray(track.entries) && track.entries.length <= 10 &&
        track.entries.every(entry => typeof entry.nick === 'string' && Number.isSafeInteger(entry.rank) && entry.rank >= 1 && entry.rank <= 10 && Number.isSafeInteger(entry.best_time_ms) && entry.best_time_ms > 0));
  }
  async function refresh() {
    if (loading || document.hidden || !visible || Date.now()-lastAttempt < REFRESH_MS) return;
    loading = true; lastAttempt = Date.now();
    try {
      const response = await fetch(URL,{credentials:'omit',signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error('Snapshot unavailable');
      const data = await response.json();
      if (!valid(data)) throw new Error('Invalid snapshot');
      if (!snapshot || Date.parse(data.generated_at) >= Date.parse(snapshot.generated_at)) snapshot = data;
      failed = false;
    } catch { failed = true; }
    finally { loading = false; render(); }
  }
  select.addEventListener('change',render);
  document.getElementById('lang')?.addEventListener('change',render);
  document.addEventListener('visibilitychange',() => {if (!document.hidden) {render(); refresh();}});
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {visible = entries.some(entry => entry.isIntersecting); if (visible) refresh();},{rootMargin:'200px'}).observe(root);
  } else { visible = true; refresh(); }
  setInterval(() => {if (visible && !document.hidden) {render(); refresh();}},REFRESH_MS);
  render();
})();
