// Заранее скачиваем следующие ролики целиком (как TikTok), чтобы при свайпе они включались сразу.
// Ролик качается в память телефона и отдаётся видео-плееру как локальный файл (blob:).
// • качаем по одному ролику, по порядку: ближайший — первым;
// • держим в памяти только окно вокруг текущего ролика, остальное сразу освобождаем;
// • очень длинные ролики заранее не качаем — они играют потоком, как обычно.
const MAX_PARALLEL = 1;            // по одному — меньше отнимаем интернет у текущего ролика
const MAX_DURATION = 90;           // сек
const MAX_BYTES = 15 * 1024 * 1024; // 15 МБ на ролик

export function createPrefetcher(onReady) {
  const map = new Map();           // key → { src, state: queued|loading|done|error, url, ctrl }
  let queue = [], running = 0;

  const pump = () => {
    while (running < MAX_PARALLEL && queue.length) {
      const e = queue.shift();
      if (map.get(e.key) === e && e.state === 'queued') start(e);
    }
  };
  async function start(e) {
    running++; e.state = 'loading'; e.ctrl = new AbortController();
    try {
      const r = await fetch(e.src, { signal: e.ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (+r.headers.get('content-length') > MAX_BYTES) { e.ctrl.abort(); throw new Error('big'); }
      const blob = await r.blob();
      if (map.get(e.key) !== e) return;                       // пока качали — ролик стал не нужен
      e.url = URL.createObjectURL(blob); e.state = 'done';
      onReady();
    } catch (err) {
      if (e.state === 'loading') e.state = 'error';
    } finally { running--; pump(); }
  }

  return {
    // items — нужные ролики по порядку важности: { key, src, dur, start }
    // start: false — не начинать загрузку (текущий ролик и так уже идёт из сети), но и не выбрасывать готовый
    want(items) {
      const keep = new Set(items.map(i => i.key));
      for (const [k, e] of map) if (!keep.has(k)) {
        if (e.state === 'loading' && e.ctrl) e.ctrl.abort();
        if (e.url) URL.revokeObjectURL(e.url);
        map.delete(k);
      }
      queue = [];
      for (const it of items) {
        let e = map.get(it.key);
        if (!e) {
          if (it.start === false || !it.src || it.dur > MAX_DURATION) continue;
          e = { key: it.key, src: it.src, state: 'queued' }; map.set(it.key, e);
        }
        if (e.state === 'queued') queue.push(e);
      }
      pump();
    },
    get: key => { const e = map.get(key); return e && e.state === 'done' ? e.url : null; },
    // приостановить (лента скрыта): недокачанное бросаем, готовое оставляем
    stop() { for (const e of map.values()) if (e.state === 'loading' || e.state === 'queued') { if (e.ctrl) e.ctrl.abort(); map.delete(e.key); } queue = []; },
    clear() { for (const e of map.values()) { if (e.ctrl) e.ctrl.abort(); if (e.url) URL.revokeObjectURL(e.url); } map.clear(); queue = []; },
  };
}
