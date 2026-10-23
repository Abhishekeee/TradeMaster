import { useEffect, useRef, useState } from 'react';
import { readHoldingsText, resolveFund, resolveRow, type NewLot } from '../portfolio';

interface Row { label: string; qty: number; price: number; date?: string; lot: NewLot | null; use: boolean }

interface Shot { id: string; file: File; url: string }

interface Props { hasHoldings: boolean; onImport(items: NewLot[], replace: boolean): void }

/** Bring in holdings exported from Groww, Zerodha, Upstox, etc.: pick the file or paste the table, check it, import. */
export default function PortfolioImport({ hasHoldings, onImport }: Props) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(true);
  const [shots, setShots] = useState<Shot[]>([]);
  const [big, setBig] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const live = useRef<Shot[]>([]);
  live.current = shots;

  // thumbnails are object URLs: free them when the box closes
  useEffect(() => () => live.current.forEach((x) => URL.revokeObjectURL(x.url)), []);

  /** Screenshots go into a preview list first, so several can be added (and wrong ones removed) before reading. */
  const stage = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return false;
    setShots((cur) => {
      const fresh = imgs.filter((f) => !cur.some((c) => c.file.name === f.name && c.file.size === f.size && c.file.lastModified === f.lastModified));
      return [...cur, ...fresh.map((file) => ({ id: Math.random().toString(36).slice(2), file, url: URL.createObjectURL(file) }))];
    });
    setRows(null); setMsg('');
    return true;
  };
  const unstage = (id: string) => setShots((cur) => { cur.filter((x) => x.id === id).forEach((x) => URL.revokeObjectURL(x.url)); return cur.filter((x) => x.id !== id); });

  // Ctrl+V of a copied image (a screenshot on the clipboard) anywhere on the page while this box is open
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.some((f) => f.type.startsWith('image/')) && stage(files)) e.preventDefault();
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  const read = async (src: string) => {
    const { rows: raw, error, note } = readHoldingsText(src);
    if (error) { setMsg(error); setRows(null); return; }
    setBusy(true); setMsg(`Matching ${raw.length} holdings to live prices…`);
    const out: Row[] = new Array(raw.length);
    let next = 0;
    const worker = async () => {
      while (next < raw.length) {
        const i = next++;
        const r = raw[i];
        if (r.fund) {
          // a fund: units = current value / latest NAV, average NAV = invested / units
          const f = await resolveFund(r);
          const units = f ? r.fund.current / f.nav : 0;
          out[i] = { label: r.label, qty: units, price: f ? r.fund.invested / units : 0, use: !!f && units > 0, lot: f && units > 0 ? { inst: f.inst, qty: units, price: r.fund.invested / units } : null };
          continue;
        }
        const inst = await resolveRow(r);
        out[i] = { label: r.label, qty: r.qty, price: r.price, date: r.date, use: !!inst, lot: inst ? { inst, qty: r.qty, price: r.price, date: r.date } : null };
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setRows(out); setBusy(false); setMsg(note ?? '');
  };

  /** Screenshots are read in the browser with Tesseract (free OCR); nothing is uploaded anywhere. */
  const readImages = async (files: File[]) => {
    setBusy(true); setRows(null);
    try {
      setMsg('Loading the text reader (first time only, about 10 MB)…');
      const { createWorker } = await import('tesseract.js');
      const w = await createWorker('eng', 1, { logger: (m) => { if (m.status === 'recognizing text') setMsg(`Reading screenshot… ${Math.round(m.progress * 100)}%`); } });
      let all = '';
      for (const f of files) all += (await w.recognize(f)).data.text + '\n';
      await w.terminate();
      setText(all);
      setBusy(false);
      await read(all);
    } catch {
      setBusy(false);
      setMsg('Could not read the screenshot (the text reader needs an internet connection the first time). You can paste the text instead.');
    }
  };

  /** Anything that is not a picture: a CSV or text file with the holdings table. */
  const pickFiles = async (list: FileList | File[] | null) => {
    const files = [...(list ?? [])];
    if (!files.length || stage(files)) return;
    const f = files[0];
    if (/.xlsx?$/i.test(f.name)) { setMsg('Excel files cannot be read directly. Open it, choose Save As → CSV (or select the table and paste it below), then try again.'); return; }
    const t = await f.text();
    setText(t);
    read(t);
  };

  const chosen = rows?.filter((r) => r.use && r.lot) ?? [];

  return (
    <div className="pf-import">
      <p className="small">
        <b>Easiest:</b> open your holdings (stocks or mutual funds) in Groww, Zerodha or any broker app and take a screenshot. Then <b>drop it here, press Ctrl+V to paste it, or click to choose</b>.
        Long list? Add several screenshots. Nothing leaves your browser, and you check every stock before it is added.
      </p>
      <div className={`pf-drop ${over ? 'over' : ''}`} tabIndex={0} role="button" aria-label="Add screenshots"
        onClick={() => pick.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pick.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pickFiles(e.dataTransfer.files); }}>
        <input ref={pick} type="file" accept="image/*,.csv,.tsv,.txt,.xlsx,.xls" multiple hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ''; }} />
        <b>📷 Drop screenshots here</b>
        <span className="small">or press <kbd>Ctrl</kbd>+<kbd>V</kbd> to paste a copied image, or click to choose a file (a CSV works too)</span>
      </div>
      {shots.length > 0 && (
        <div className="pf-shots">
          {shots.map((x) => (
            <div key={x.id} className="pf-shot">
              <img src={x.url} alt={x.file.name || 'screenshot'} title="Click to enlarge" onClick={() => setBig(x.url)} />
              <button className="pf-x" title="Remove this screenshot" onClick={() => unstage(x.id)}>✕</button>
            </div>
          ))}
          <div className="pf-shot-act">
            <button className="mini on" disabled={busy} onClick={() => readImages(shots.map((x) => x.file))}>Read {shots.length} screenshot{shots.length > 1 ? 's' : ''}</button>
            <button className="mini" disabled={busy} onClick={() => { shots.forEach((x) => URL.revokeObjectURL(x.url)); setShots([]); }}>Clear</button>
          </div>
        </div>
      )}
      {big && <div className="modal" onClick={() => setBig(null)}><img className="pf-big-img" src={big} alt="Screenshot preview" /></div>}
      <p className="small">Or paste the holdings as text or a copied table:</p>
      <textarea className="pf-paste" rows={4} value={text} placeholder={'Instrument\tQty.\tAvg. cost\nRELIANCE\t10\t2450.5\nTCS\t5\t3300'} onChange={(e) => setText(e.target.value)} />
      <div className="pf-row">
        <button className="mini on" disabled={busy || !text.trim()} onClick={() => read(text)}>Read holdings from text</button>
        {msg && <span className="small">{msg}</span>}
      </div>

      {rows && (
        <div className="pf-scroll">
          <table className="pf-table">
            <thead><tr><th></th><th>In your file</th><th>Matched to</th><th className="r">Qty</th><th className="r">Avg price</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.lot ? '' : 'pf-dim'}>
                  <td><input type="checkbox" checked={r.use} disabled={!r.lot} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, use: e.target.checked } : x)))} /></td>
                  <td>{r.label}</td>
                  <td>{r.lot ? <><b>{r.lot.inst.source === 'mf' ? 'Fund' : r.lot.inst.id}</b> <span className="small">{r.lot.inst.source === 'mf' ? r.lot.inst.name : r.lot.inst.name.split(' · ')[0]}</span></> : <span className="down">Not found. Add it by hand.</span>}</td>
                  <td className="r">{Number(r.qty.toFixed(3))}</td><td className="r">{Number(r.price.toFixed(2))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && (
        <div className="pf-row">
          {hasHoldings && <label className="chk"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace what is here now (best when importing your full holdings again)</label>}
          <button className="mini buyb" disabled={!chosen.length} onClick={() => { onImport(chosen.map((r) => r.lot as NewLot), replace && hasHoldings); setRows(null); setText(''); shots.forEach((x) => URL.revokeObjectURL(x.url)); setShots([]); }}>
            Import {chosen.length} holding{chosen.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  );
}
