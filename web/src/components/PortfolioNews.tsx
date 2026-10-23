import { useEffect, useState } from 'react';
import { shortName, type Stat } from '../portfolio';
import { ago, fetchNews, type NewsItem } from '../news';

interface Props { stats: Stat[]; selected: string; setSelected(id: string): void }
type Row = NewsItem & { who: string; id: string };

const MOOD = { 1: ['Positive', 'up'], 0: ['Neutral', 'neu'], [-1]: ['Negative', 'down'] } as const;

/** Latest headlines for each holding, or all of them mixed by time. */
export default function PortfolioNews({ stats, selected, setSelected }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const ids = stats.map((s) => s.h.id).join();

  useEffect(() => {
    let dead = false;
    setRows(null);
    (async () => {
      const list = selected === 'all' ? stats : stats.filter((s) => s.h.id === selected);
      const got = await Promise.all(list.map(async (s) => (await fetchNews(s.h.inst, selected === 'all' ? 5 : 12)).map((n) => ({ ...n, who: shortName(s.h.inst), id: s.h.id }))));
      if (!dead) setRows(got.flat().sort((a, b) => b.time - a.time));
    })();
    return () => { dead = true; };
  }, [selected, ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const one = selected === 'all' ? null : stats.find((s) => s.h.id === selected);
  const pos = rows?.filter((r) => r.mood > 0).length ?? 0, neg = rows?.filter((r) => r.mood < 0).length ?? 0;

  return (
    <section className="pf-box">
      <h3>Latest news</h3>
      <div className="chips pf-chips">
        <button className={selected === 'all' ? 'on' : ''} onClick={() => setSelected('all')}>All holdings</button>
        {stats.map((s) => <button key={s.h.id} className={selected === s.h.id ? 'on' : ''} onClick={() => setSelected(s.h.id)}>{shortName(s.h.inst)}</button>)}
      </div>
      {one && rows && rows.length > 0 && (
        <p className="small">{one.isFund ? 'Fund' : 'Stock'} news mood: <b className="up">{pos} positive</b>, <b className="down">{neg} negative</b>, {rows.length - pos - neg} neutral across {rows.length} recent headlines. Based on keywords in the headline, so read the story before acting.</p>
      )}
      {rows === null ? <p className="small">Loading headlines…</p>
        : rows.length === 0 ? <p className="small">No recent headlines found. {one?.isFund ? 'Funds are covered less than stocks; news about the fund house may still appear under "All holdings".' : 'Try again in a moment.'}</p>
        : <ul className="pf-news">
          {rows.map((r, i) => (
            <li key={r.link + i}>
              <a href={r.link} target="_blank" rel="noopener noreferrer">{r.title}</a>
              <div className="small">
                {selected === 'all' && <><b>{r.who}</b> · </>}{r.source}{r.time ? ` · ${ago(r.time)}` : ''}
                {r.mood !== 0 && <span className={`chip pf-mood ${MOOD[r.mood][1]}`}>{MOOD[r.mood][0]}</span>}
              </div>
            </li>
          ))}
        </ul>}
      <p className="small">Headlines come from Google News and open the publisher's own site. Nothing here is a recommendation.</p>
    </section>
  );
}
