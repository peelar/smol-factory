'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItemRecord } from '../lib/records';

const defaults = ['validate', 'classify', 'review', 'verify', 'ready'];
const labels: Record<string, string> = { validate: 'Validate', classify: 'Classify', review: 'Review', verify: 'Verify', ready: 'Ready', unassigned: 'Unassigned', needsInformation: 'Needs information', pending: 'Pending', running: 'Running', blocked: 'Blocked', rejected: 'Rejected' };
const name = (value: string) => labels[value] || value;
const repositoryKey = (record: ItemRecord) => `${record.repository.githubHost}/${record.repository.name}`;
const date = (value: string) => new Date(value).toLocaleDateString();
const control = 'appearance-none rounded-none border border-neutral-400 bg-white px-2.5 py-2 text-sm hover:border-black';
const tabs = [{ kind: 'issue', title: 'Issues' }, { kind: 'pullRequest', title: 'PRs' }] as const;

function githubUrl(record: ItemRecord) {
  try {
    const url = new URL(record.item.url);
    if (url.protocol === 'https:' && url.host === record.repository.githubHost && !url.username && !url.password) return url.href;
  } catch { /* Invalid links are omitted. */ }
}

function Details({ record, onClose }: { record: ItemRecord; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const url = githubUrl(record);
  return <dialog ref={dialog} onClose={onClose} aria-labelledby="detail-title" className="fixed inset-0 m-auto max-h-[85vh] w-[min(700px,calc(100%_-_32px))] overflow-y-auto border border-black bg-white p-6 text-neutral-950">
    <div className="flex items-start justify-between gap-5">
      <h2 id="detail-title" className="text-lg font-semibold">{record.item.kind === 'issue' ? 'Issue' : 'PR'} #{record.item.number} · {record.snapshot.title}</h2>
      <button className={`${control} shrink-0`} onClick={() => dialog.current?.close()}>Close</button>
    </div>
    <div className="mt-4 space-y-3 break-words">
      <p>{repositoryKey(record)}</p>
      <p>{name(record.currentStage || 'unassigned')} · {name(record.disposition)} · {record.snapshot.state}</p>
      {url && <a className="inline-block underline underline-offset-4" href={url} target="_blank" rel="noopener noreferrer">Open on GitHub</a>}
      {!!record.snapshot.labels.length && <p>Labels: {record.snapshot.labels.join(', ')}</p>}
      <p>Verification: {record.verificationNeed} · Updated {date(record.updatedAt)}</p>
      <h3 className="pt-3 font-semibold">Stage results</h3>
      {!record.results.length && <p>No stage results recorded.</p>}
      {[...record.results].reverse().map((result, index) => <section key={result.id || index} className="space-y-2 border-t border-neutral-300 pt-3">
        <strong>{name(result.stage)} · {result.status}</strong>
        <p className="whitespace-pre-wrap">{result.summary}</p>
        {result.evidence.map((evidence, i) => <p key={i} className="whitespace-pre-wrap">{evidence.kind}: {evidence.detail} ({evidence.source})</p>)}
        {result.checks.map((check, i) => <p key={i}>{check.status}: {check.command} · {check.environment}</p>)}
      </section>)}
      <h3 className="pt-3 font-semibold">Proposals</h3>
      {!record.proposals.length && <p>No proposals recorded.</p>}
      {record.proposals.map((proposal, i) => <section key={proposal.id || i}>
        <p>{proposal.status} · {proposal.actions.length} proposed action(s)</p>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{JSON.stringify(proposal.actions, null, 2)}</pre>
      </section>)}
    </div>
  </dialog>;
}

export default function Board() {
  const [records, setRecords] = useState<ItemRecord[]>([]);
  const [kind, setKind] = useState<ItemRecord['item']['kind']>('issue');
  const [query, setQuery] = useState('');
  const [repository, setRepository] = useState('');
  const [state, setState] = useState('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState('');
  const [selected, setSelected] = useState<ItemRecord | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/records', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load records.');
      setRecords(data.records);
      setRepository(current => data.records.some((record: ItemRecord) => repositoryKey(record) === current) ? current : '');
      setLoadedAt(new Date().toLocaleTimeString());
    } catch (cause) {
      setRecords([]);
      setError(cause instanceof Error ? cause.message : 'Could not load records.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const search = query.trim().toLowerCase().replace(/^#/, '');
  const visible = records.filter(record => record.item.kind === kind &&
    (!repository || repositoryKey(record) === repository) && (!state || record.snapshot.state === state) &&
    (!search || `${record.item.number} ${record.snapshot.title}`.toLowerCase().includes(search)));
  const stages = [...defaults, ...new Set(records.map(record => record.currentStage || 'unassigned').filter(stage => !defaults.includes(stage)))];

  return <>
    <header className="flex items-baseline gap-5 border-b border-black px-4 py-5 sm:px-7">
      <h1 className="text-lg font-semibold">smol-factory</h1>
      <span className="hidden text-neutral-600 sm:inline">Issue &amp; PR board</span>
      <button onClick={refresh} disabled={loading} className={`${control} ml-auto`}>Refresh</button>
    </header>
    <main className="px-4 py-6 sm:px-7">
      <div role="tablist" aria-label="Item type" className="mb-6 flex gap-6 border-b border-neutral-300">
        {tabs.map(tab => <button key={tab.kind} id={`${tab.kind}-tab`} role="tab" aria-selected={kind === tab.kind} aria-controls="board" tabIndex={kind === tab.kind ? 0 : -1}
          className={`border-b-[3px] px-0 py-2 text-base ${kind === tab.kind ? 'border-black font-semibold text-black' : 'border-transparent text-neutral-500'}`}
          onClick={() => setKind(tab.kind)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 'issue' : event.key === 'End' ? 'pullRequest' : kind === 'issue' ? 'pullRequest' : 'issue';
            setKind(next);
            document.getElementById(`${next}-tab`)?.focus();
          }}>{tab.title}</button>)}
      </div>
      <form role="search" onSubmit={event => event.preventDefault()} className="flex flex-wrap items-end gap-4">
        <label className="grid w-full gap-1 text-xs sm:w-auto">Search<input type="search" placeholder="Title or #number" value={query} onChange={event => setQuery(event.target.value)} className={`${control} sm:w-[270px]`} /></label>
        <label className="grid gap-1 text-xs">Repository<select value={repository} onChange={event => setRepository(event.target.value)} className={control}>
          <option value="">All repositories</option>
          {[...new Set(records.map(repositoryKey))].sort().map(repo => <option key={repo}>{repo}</option>)}
        </select></label>
        <label className="grid gap-1 text-xs">State<select value={state} onChange={event => setState(event.target.value)} className={control}>
          <option value="open">Open</option><option value="">All states</option><option value="closed">Closed</option><option value="merged">Merged</option>
        </select></label>
      </form>
      <p role="status" className="mb-4 mt-5 text-xs text-neutral-600">{loading ? 'Loading records…' : error || `${visible.length} of ${records.length} items · Read only · Refreshed ${loadedAt}${!records.length ? ' · No stored records yet.' : !visible.length ? ' · No items match these filters.' : ''}`}</p>
      {!error && <div id="board" role="tabpanel" aria-labelledby={`${kind}-tab`} tabIndex={0} className="grid min-h-[55vh] auto-cols-[260px] grid-flow-col items-start gap-4 overflow-x-auto pb-5 sm:auto-cols-[minmax(240px,1fr)]">
        {stages.map(stage => {
          const items = visible.filter(record => (record.currentStage || 'unassigned') === stage).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          return <section key={stage} className="min-w-0">
            <h2 className="mb-3 flex justify-between gap-3 border-b-2 border-black pb-2.5 text-[13px] font-semibold">{name(stage)}<span className="font-normal text-neutral-500">{items.length}</span></h2>
            {items.map(record => <button key={`${repositoryKey(record)}/${record.item.kind}/${record.item.number}`} onClick={() => setSelected(record)} title={record.snapshot.title}
              className="mb-2.5 grid h-[182px] w-full grid-rows-[17px_minmax(0,1fr)_17px_17px] gap-2.5 overflow-hidden border border-neutral-300 p-3.5 text-left [overflow-wrap:anywhere] hover:border-black hover:bg-neutral-50">
              <span className="flex justify-between gap-2 text-[11px] text-neutral-600"><span>{kind === 'issue' ? 'Issue' : 'PR'} #{record.item.number}</span><span>{record.snapshot.state}</span></span>
              <span className="line-clamp-3 text-sm leading-[1.45] font-semibold">{record.snapshot.title}</span>
              <span className="truncate text-[11px] text-neutral-600">{repositoryKey(record)}</span>
              <span className="flex justify-between gap-2 text-[11px] text-neutral-600"><span>{name(record.disposition)}</span><span>{date(record.updatedAt)}</span></span>
            </button>)}
            {!items.length && <p className="text-xs text-neutral-500">No items</p>}
          </section>;
        })}
      </div>}
    </main>
    {selected && <Details record={selected} onClose={() => setSelected(null)} />}
  </>;
}
