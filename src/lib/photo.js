// Выбор фото с телефона + сжатие прямо на устройстве.
// Сжимаем до отправки: так загрузка быстрая даже на слабом интернете,
// и вместе с лишними килобайтами уходят служебные данные снимка (где и чем снято).
const MAX_W = 1440, MAX_H = 1920, TARGET = 900 * 1024;

async function draw(file) {
  // createImageBitmap сам разворачивает фото как надо (снятое боком — не ляжет набок)
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {}
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((ok, no) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => no(new Error('не получилось открыть фото'));
      im.src = url;
    });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

export async function shrink(file) {
  const img = await draw(file);
  const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
  const k = Math.min(1, MAX_W / w0, MAX_H / h0);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w0 * k)); cv.height = Math.max(1, Math.round(h0 * k));
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  if (img.close) img.close();

  let q = 0.82, url = cv.toDataURL('image/jpeg', q);
  while (url.length * 0.75 > TARGET && q > 0.45) { q -= 0.12; url = cv.toDataURL('image/jpeg', q); }
  return url;
}

// Открывает выбор фото. Вернёт сжатую картинку или null, если человек передумал.
export function pickPhoto() {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    document.body.appendChild(inp);

    let done = false;
    const finish = v => { if (!done) { done = true; inp.remove(); resolve(v); } };

    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return finish(null);
      try { finish(await shrink(f)); } catch (e) { done = true; inp.remove(); reject(e); }
    };
    // если окно выбора закрыли без фото — событие change не придёт, ловим возврат в приложение
    const back = () => setTimeout(() => { if (!inp.files || !inp.files.length) finish(null); }, 1200);
    window.addEventListener('focus', back, { once: true });

    inp.click();
  });
}
