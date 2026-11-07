// Рекомендации «как в TikTok»:
//  • новичку — самое популярное и свежее (что «залетело» у всех);
//  • дальше лента подстраивается: каналы и темы, которые человек досматривает, лайкает,
//    сохраняет и на которые подписывается, поднимаются выше; то, что он пролистывает, — ниже;
//  • уже просмотренное уходит вниз, подряд не идут ролики одного канала;
//  • часть мест (~15%) отдаём новому, чтобы лента не замыкалась на одном.
import { state } from './store';

const hours = iso => Math.max(0.5, (Date.now() - new Date(iso)) / 36e5);

// Популярность: просмотры относительно обычного охвата канала + абсолютные просмотры + свежесть
export function popularity(v, ch) {
  const rel = Math.min(3, v.views / Math.max(50, (ch && ch.reach) || v.views || 1)) / 3;
  const abs = Math.log10(v.views + 10) / 6;
  const fresh = Math.exp(-hours(v.date) / 96);
  return (0.55 * rel + 0.45 * abs) * (0.35 + 0.65 * fresh);
}
// Тренды: кто быстрее всех набирает просмотры (просмотры в час)
export function trending(videos) {
  return videos.filter(v => hours(v.date) < 24 * 5)
    .map(v => ({ v, s: v.views / Math.pow(hours(v.date) + 2, 0.8) }))
    .sort((a, b) => b.s - a.s).map(x => x.v);
}
// Интерес человека к каналу и теме (от −1 до +1)
function taste(v) {
  const S = state();
  const c = Math.tanh((S.chan[v.channel] || 0) / 6), t = Math.tanh((S.cat[v.cat] || 0) / 8);
  const follow = S.follows.includes(v.channel) ? 0.35 : 0;
  return Math.max(-0.9, Math.min(1.4, 0.75 * c + 0.35 * t + follow));
}
const rnd = seed => { let x = seed % 2147483647; return () => (x = x * 16807 % 2147483647) / 2147483647; };

export function forYou(videos, chMap, seed = Date.now()) {
  const S = state(), r = rnd(seed), cold = S.events < 3;
  const scored = videos.map(v => {
    let s = popularity(v, chMap[v.channel]);
    if (!cold) s *= 1 + 1.6 * taste(v);
    const seen = S.seen[v.key];
    if (seen) s *= 0.15 + Math.min(0.5, (Date.now() - seen) / 864e5 / 4);   // просмотренное — вниз
    return { v, s: s * (0.9 + 0.2 * r()) };
  }).sort((a, b) => b.s - a.s);
  // ~15% мест — «на пробу» из того, что человек ещё не видел
  const out = [], rest = scored.slice(), explore = scored.filter(x => !S.seen[x.v.key]).slice(Math.floor(scored.length / 3));
  while (rest.length) {
    let pick = 0;
    if (!cold && explore.length && r() < 0.15) { const e = explore.splice(Math.floor(r() * explore.length), 1)[0]; pick = rest.indexOf(e); if (pick < 0) pick = 0; }
    // не два ролика одного канала подряд
    const last = out[out.length - 1];
    if (last && rest[pick].v.channel === last.channel) { const j = rest.findIndex(x => x.v.channel !== last.channel); if (j > 0) pick = j; }
    out.push(rest.splice(pick, 1)[0].v);
  }
  return out;
}
export function following(videos) {
  const f = new Set(state().follows);
  return videos.filter(v => f.has(v.channel)).sort((a, b) => new Date(b.date) - new Date(a.date));
}
// «Досортировать» хвост ленты после новых сигналов, не трогая уже показанное
export function rerankTail(list, fromIndex, chMap) {
  const head = list.slice(0, fromIndex + 1), tail = list.slice(fromIndex + 1);
  return head.concat(forYou(tail, chMap, fromIndex * 7919 + 13));
}
