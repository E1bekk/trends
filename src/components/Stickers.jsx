// Панель стикеров: свои наборы и общая библиотека.
// Свой набор приносят ссылкой из Telegram и он сразу работает в чатах с друзьями.
// В общую библиотеку набор уходит только после проверки ИИ.
import { useEffect, useState } from 'react';
import { I } from './Icons';
import { getPacks, getSharedPacks, addPack, sharePack, takePack, dropPack, reportPack } from '../lib/api';
import { haptic, ask } from '../lib/tg';

export function StickerPanel({ onPick, onClose }) {
  const [packs, setPacks] = useState([]);
  const [lib, setLib] = useState(null);        // null — показываем свои
  const [at, setAt] = useState(0);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = () => getPacks().then(r => setPacks(r.packs || [])).catch(e => setNote(e.message));
  useEffect(() => { load(); }, []);

  const bring = async () => {
    if (!link.trim() || busy) return;
    setBusy(true); setNote('Разбираю набор…');
    try {
      const r = await addPack(link.trim());
      if (r.ok) {
        setLink(''); setNote(`Готово: ${r.got || ''} стикеров. Работает в чатах с друзьями.`);
        await load(); setAt(0);
      } else setNote(r.why || 'набор не подошёл');
    } catch (e) { setNote(e.message); }
    finally { setBusy(false); }
  };

  const toLibrary = async name => {
    setBusy(true); setNote('ИИ смотрит набор…');
    try { const r = await sharePack(name); setNote(r.ok ? 'Набор теперь в общей библиотеке' : (r.why || 'не пропустили')); await load(); }
    catch (e) { setNote(e.message); }
    finally { setBusy(false); }
  };

  const remove = async name => {
    if (!(await ask('Убрать набор у себя?'))) return;
    await dropPack(name).catch(() => {});
    setAt(0); load();
  };

  const openLib = async () => {
    setNote(''); setLib([]);
    try { const r = await getSharedPacks(''); setLib(r.packs || []); } catch (e) { setNote(e.message); }
  };

  const complain = async name => {
    if (!(await ask('Пожаловаться на этот набор?'))) return;
    try { const r = await reportPack(name); setNote(r.already ? 'Жалоба уже учтена' : 'Спасибо, посмотрим'); }
    catch (e) { setNote(e.message); }
  };

  const grab = async name => {
    setBusy(true);
    try { const r = await takePack(name); setNote(r.ok ? 'Набор добавлен' : (r.why || 'не вышло')); await load(); await openLib(); }
    catch (e) { setNote(e.message); }
    finally { setBusy(false); }
  };

  const cur = packs[at];

  return (
    <div className="spanel">
      <div className="spanel-top">
        <div className="spacks">
          <button className={lib ? 'on' : ''} onClick={lib ? () => setLib(null) : openLib} title="Общая библиотека">
            <I.grid width="17" height="17" />
          </button>
          {packs.map((p, k) => (
            <button key={p.name} className={!lib && k === at ? 'on' : ''} onClick={() => { setLib(null); setAt(k); }}>
              {p.items[0] ? <img src={p.items[0].url} alt="" /> : <span>{p.title?.[0] || '?'}</span>}
            </button>
          ))}
        </div>
        <button className="sclose" onClick={onClose} aria-label="Закрыть"><I.close width="18" height="18" /></button>
      </div>

      {lib
        ? <div className="sbody">
            {!lib.length && <p className="snote">В библиотеке пока пусто. Наборы попадают сюда после проверки.</p>}
            <div className="slib">
              {lib.map(p => (
                <div key={p.name} className="slib-row">
                  {p.cover ? <img src={p.cover} alt="" /> : <span className="slib-no" />}
                  <div><b>{p.title}</b><small>{p.total} стикеров</small></div>
                  <div className="slib-btns">
                    <button className="mini" disabled={p.mine || busy} onClick={() => grab(p.name)}>
                      {p.mine ? 'есть' : 'взять'}
                    </button>
                    <button className="mini" onClick={() => complain(p.name)} title="Пожаловаться">!</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        : cur
          ? <div className="sbody">
              <div className="sgrid">
                {cur.items.map(s => (
                  <button key={s.id} onClick={() => { haptic('light'); onPick(s); }}>
                    <img src={s.url} alt={s.emoji || ''} loading="lazy" />
                  </button>
                ))}
              </div>
              <div className="sfoot">
                <span>{cur.title}{cur.status === 'shared' ? ' · в общей' : ''}</span>
                <div>
                  {cur.status !== 'shared' && <button className="mini" disabled={busy} onClick={() => toLibrary(cur.name)}>в общую</button>}
                  <button className="mini" onClick={() => remove(cur.name)}>убрать</button>
                </div>
              </div>
            </div>
          : <div className="sbody">
              <p className="snote">Своих наборов пока нет. В Telegram задержи палец на стикере → «Поделиться» → скопируй ссылку и вставь сюда.</p>
            </div>}

      <div className="sadd">
        <input value={link} onChange={e => setLink(e.target.value)} placeholder="t.me/addstickers/название" />
        <button className="mini grad" disabled={busy || !link.trim()} onClick={bring}>{busy ? '…' : 'Принести'}</button>
      </div>
      {note && <p className="snote">{note}</p>}
    </div>
  );
}
