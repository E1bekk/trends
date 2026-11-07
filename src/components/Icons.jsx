const S = ({ d, fill, ...p }) => { const f = fill === true || fill === 'currentColor'; return (
  <svg viewBox="0 0 24 24" width="24" height="24" fill={f ? 'currentColor' : 'none'} stroke={f ? 'none' : 'currentColor'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{d}</svg>
); };
export const I = {
  video: p => <S {...p} d={<><rect x="3" y="5" width="18" height="14" rx="3.5" /><path d="M10.5 9.5v5l4-2.5z" fill="currentColor" /></>} />,
  channels: p => <S {...p} d={<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.3c1.4.7 2.3 2.2 2.6 4.7" /></>} />,
  news: p => <S {...p} d={<><rect x="3.5" y="4" width="17" height="16" rx="3" /><path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h5" /></>} />,
  user: p => <S {...p} d={<><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1-4 3.9-6 7.5-6s6.5 2 7.5 6" /></>} />,
  search: p => <S {...p} d={<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>} />,
  fire: p => <S {...p} d={<path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3.1 2-5 3.6-6.6.3 1.7 1.2 2.9 2.4 3.3-.3-3.3 1.3-6.2 4-8.1-.1 2.6 1.1 4.3 2.5 5.9 1.1 1.3 1.5 3 1.5 4.6C19 18 15.9 21 12 21Z" />} />,
  trend: p => <S {...p} d={<><path d="m3.5 16.5 6-6 4 4 7-7.5" /><path d="M15 7h5.5v5.5" /></>} />,
  heart: p => <S {...p} d={<path d="M12 20.3s-7.8-4.6-7.8-10.4A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 7.8 2.4c0 5.8-7.8 10.4-7.8 10.4Z" />} />,
  bookmark: p => <S {...p} d={<path d="M6.5 4h11a1 1 0 0 1 1 1v15.2l-6.5-4.4-6.5 4.4V5a1 1 0 0 1 1-1Z" />} />,
  share: p => <S {...p} d={<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5Z" />} />,
  plane: p => <S {...p} fill d={<path d="M20.7 3.6 2.9 10.5c-1.2.5-1.2 1.2-.2 1.5l4.6 1.4 1.7 5.3c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.2-2.1 4.6 3.4c.8.5 1.4.2 1.6-.8l3-14.1c.3-1.2-.4-1.8-1.4-1.4ZM9.6 14.2l8.2-7.4c.4-.3 0-.5-.5-.2l-10.1 6.4" />} />,
  eye: p => <S {...p} d={<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>} />,
  check: p => <S {...p} d={<path d="m5 12.5 4.5 4.5L19 7.5" />} />,
  play: p => <S {...p} fill d={<path d="M8 5.5v13l10.5-6.5z" />} />,
  close: p => <S {...p} d={<path d="M6 6l12 12M18 6 6 18" />} />,
  back: p => <S {...p} d={<path d="M15 5 8 12l7 7" />} />,
  mute: p => <S {...p} d={<><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></>} />,
  sound: p => <S {...p} d={<><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>} />,
  users: p => <S {...p} d={<><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M16 5.5a3 3 0 0 1 0 5.8M18.3 14.4c1.3.8 2 2.2 2.3 4.6" /></>} />,
  external: p => <S {...p} d={<><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>} />,
  sort: p => <S {...p} d={<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" />} />,
  home: p => <S {...p} d={<><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z" /></>} />,
  spark: p => <S {...p} fill d={<path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5Zm6.5 11c.2 2 1.3 3.1 3.3 3.3-2 .2-3.1 1.3-3.3 3.3-.2-2-1.3-3.1-3.3-3.3 2-.2 3.1-1.3 3.3-3.3Z" />} />,
  history: p => <S {...p} d={<><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3.5 4.5V9H8" /><path d="M12 7.5V12l3 2" /></>} />,
  grid: p => <S {...p} d={<><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>} />,
  crown: p => <S {...p} fill d={<path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 10H5Z" />} />,
  refresh: p => <S {...p} d={<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4" />} />
};
// Аватар канала: фото из Telegram или буква на цветном фоне
const COLORS = ['#8b5cff', '#ff3d81', '#3d9bff', '#ffb13d', '#18c29c', '#ff6a3d'];
export function Avatar({ ch, size = 40, ring }) {
  const style = { width: size, height: size, flex: 'none' };
  if (ring) return <span className={'ring' + (ring === 'seen' ? ' seen' : '')} style={{ width: size + 8, height: size + 8 }}><Avatar ch={ch} size={size} /></span>;
  if (ch && ch.avatar && !ch.avatar.startsWith('data:')) return <img className="ava" src={ch.avatar} alt="" style={style} loading="lazy" />;
  const t = (ch && (ch.title || ch.username) || '?').replace(/[^\p{L}\p{N}]/gu, '');
  const c = COLORS[[...(ch && ch.username || 'x')].reduce((a, b) => a + b.charCodeAt(0), 0) % COLORS.length];
  return <span className="ava ava-l" style={{ ...style, background: c, fontSize: size * 0.42 }}>{(t[0] || '?').toUpperCase()}</span>;
}
