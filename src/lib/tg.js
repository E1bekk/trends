// Обёртка над Telegram Mini Apps: работает и в Telegram, и в обычном браузере (для проверки).
const W = typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp;
export const tg = W && W.initData !== undefined ? W : null;
export const inTelegram = !!(tg && tg.initData);

export function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();   // свайп по ленте не закрывает приложение
    if (tg.setHeaderColor) tg.setHeaderColor('#0b0b12');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#0b0b12');
    if (tg.setBottomBarColor) tg.setBottomBarColor('#0b0b12');
  } catch (e) {}
}
export function tgUser() {
  const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  return u ? { id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' '), username: u.username || '', photo: u.photo_url || '', lang: u.language_code || '' } : null;
}
// Открыть канал или пост в Telegram (внутри Telegram — без выхода из приложения)
export function openTg(path) {
  const url = 'https://t.me/' + path;
  if (inTelegram && tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
}
export function share(path, text) {
  const url = 'https://t.me/' + path;
  const link = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text || '');
  if (inTelegram && tg.openTelegramLink) tg.openTelegramLink(link);
  else if (navigator.share) navigator.share({ url, text }).catch(() => {});
  else window.open(link, '_blank');
}
export function haptic(type) {
  try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(type || 'light'); } catch (e) {}
}
// Кнопка «Назад» Telegram
export function backButton(on, cb) {
  if (!tg || !tg.BackButton) return () => {};
  if (on) { tg.BackButton.show(); tg.BackButton.onClick(cb); } else tg.BackButton.hide();
  return () => { try { tg.BackButton.offClick(cb); } catch (e) {} };
}
