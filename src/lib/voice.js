// Запись голосовых прямо в приложении. Пишем сжатым звуком (opus) —
// минута занимает меньше 250 КБ, поэтому отправляется быстро даже с плохого интернета.
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export const canRecord = () =>
  typeof MediaRecorder !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

// onLevel(громкость 0..100, секунд) — чтобы рисовать живую дорожку во время записи
export async function startRec(onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  const mime = TYPES.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

  // дорожка: меряем громкость десять раз в секунду
  let ctx = null, timer = null;
  const wave = [], t0 = Date.now();
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    timer = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) { const d = Math.abs(buf[i] - 128); if (d > peak) peak = d; }
      const lvl = Math.min(100, Math.round(peak / 128 * 170));
      wave.push(lvl);
      if (onLevel) onLevel(lvl, (Date.now() - t0) / 1000);
    }, 100);
  } catch (e) { /* без дорожки запись всё равно идёт */ }

  const close = () => {
    if (timer) clearInterval(timer);
    stream.getTracks().forEach(t => t.stop());
    if (ctx) ctx.close().catch(() => {});
  };

  rec.start(250);

  return {
    cancel() { try { rec.stop(); } catch (e) {} close(); },
    stop() {
      return new Promise(resolve => {
        rec.onstop = () => {
          close();
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          if (!blob.size) return resolve(null);
          const f = new FileReader();
          f.onload = () => resolve({ dataURL: f.result, sec: (Date.now() - t0) / 1000, wave: squeeze(wave) });
          f.onerror = () => resolve(null);
          f.readAsDataURL(blob);
        };
        try { rec.stop(); } catch (e) { close(); resolve(null); }
      });
    }
  };
}

// сжимаем дорожку до 40 столбиков — столько помещается в сообщение
function squeeze(src, n = 40) {
  if (!src.length) return [];
  const step = src.length / n, out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step));
    let m = 0; for (let k = a; k < b && k < src.length; k++) m = Math.max(m, src[k]);
    out.push(m);
  }
  return out;
}
