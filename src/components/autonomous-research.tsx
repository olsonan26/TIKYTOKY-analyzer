"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, CircleHelp, ExternalLink, LoaderCircle, Plug, Search, ShieldCheck } from "lucide-react";
import type { Video } from "@/lib/types";

export type WorkerResult = { projectId?: string; subject: string; videos: Video[]; report: string; sources: {url: string; title?: string; method?: string}[]; warnings: string[]; coverage: string; generatedAt: string; liveCollection: boolean; blocked: boolean; speechVideos: number; visualVideos: number };
type WorkerJob = { id: string; status: string; request: {subject: string}; events: {at: string; message: string}[]; error?: string; result?: WorkerResult };
const CONNECTION = "tikytoky-worker-connection";
const terminal = new Set(["completed", "blocked", "failed", "cancelled", "interrupted"]);

function connectionUrl(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Use a worker base URL with no credentials, path, query or fragment.");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Use loopback HTTP on this computer, or an explicitly configured HTTPS worker endpoint.");
  return url.origin;
}
export function AutonomousResearch({ initialSubject, projectId, onResult }: { initialSubject: string; projectId: string; onResult: (result: WorkerResult, generate: boolean) => Promise<void> }) {
  const [base, setBase] = useState("http://127.0.0.1:8765"), [token, setToken] = useState("");
  const [connected, setConnected] = useState(false), [versions, setVersions] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState(initialSubject), [creators, setCreators] = useState(""), [hashtags, setHashtags] = useState("");
  const [limit, setLimit] = useState(15), [studyLimit, setStudyLimit] = useState(3), [periodDays, setPeriodDays] = useState(7);
  const [generate, setGenerate] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [jobs, setJobs] = useState<WorkerJob[]>([]), [job, setJob] = useState<WorkerJob | null>(null), [importing, setImporting] = useState(false);
  const delivered = useRef(new Set<string>());
  const generateRef = useRef(false);
  useEffect(() => {
    try { const saved = sessionStorage.getItem(CONNECTION); if (saved) { const data = JSON.parse(saved); setBase(connectionUrl(data.base)); setToken(typeof data.token === "string" ? data.token : ""); } } catch {}
  }, []);
  async function request<T>(path: string, body?: unknown): Promise<T> {
    const destination = connectionUrl(base);
    const response = await fetch(destination + path, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? {"Content-Type": "application/json"} : {}) }, ...(body !== undefined ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(20000) });
    const payload = await response.json();
    if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : `Worker request failed (${response.status}).`);
    return payload as T;
  }
  async function connect() {
    setBusy(true); setError("");
    try {
      const status = await request<{ready: boolean; versions: Record<string, string>; aiConfigured: boolean}>("/v1/status");
      if (!status.ready) throw new Error("Worker is reachable, but required Python dependencies are missing. Run the worker setup.");
      if (!status.aiConfigured) throw new Error("The local worker needs OPENROUTER_API_KEY in its environment or the repository's private .env.local.");
      sessionStorage.setItem(CONNECTION, JSON.stringify({base: connectionUrl(base), token}));
      setVersions(status.versions); setConnected(true);
      setJobs((await request<{jobs: WorkerJob[]}>("/v1/jobs")).jobs);
    } catch (cause) { setConnected(false); setError(cause instanceof Error ? cause.message : "Cannot connect. Start the local worker, allow this dashboard origin, and grant local-network access if your browser requests it."); }
    finally { setBusy(false); }
  }
  async function start() {
    setBusy(true); setError("");
    try {
      if (!subject.trim()) throw new Error("Choose a niche or research subject.");
      generateRef.current = generate;
      setJob(await request<WorkerJob>("/v1/jobs", { projectId, subject: subject.trim(), limit, periodDays, studyLimit, creators: creators.split(",").map(s => s.trim()).filter(Boolean), hashtags: hashtags.split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean), webResearch: true }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The job could not start."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!job || terminal.has(job.status)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const next = await request<WorkerJob>(`/v1/jobs/${encodeURIComponent(job.id)}`);
        if (cancelled) return;
        setJob(next);
        if (next.result && !delivered.current.has(next.id) && terminal.has(next.status)) {
          delivered.current.add(next.id);
          if (next.result.videos.length) {
            setImporting(true);
            try { await onResult(next.result, generateRef.current); } finally { setImporting(false); }
          }
        }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Worker connection interrupted. Its persisted job can be reopened after reconnecting."); }
    }, 2500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [job, base, token, onResult]);
  return <div className="content-view"><div className="view-heading"><span className="stat-icon coral"><Bot size={24} /></span><h1>Autonomous research, from real evidence.</h1><p>The local Python worker browses, collects, investigates and transcribes. This dashboard stays on Vercel. No Apify or Supadata key is required.</p></div><section className="plain-panel worker-pair"><h3><Plug size={18} /> Connect your local worker</h3><div className="worker-fields"><label>Worker address<input value={base} onChange={event => {setBase(event.target.value);setConnected(false);}} /></label><label>Local access token<input type="password" value={token} autoComplete="off" onChange={event => {setToken(event.target.value);setConnected(false);}} placeholder="From worker/.data/worker-token.txt" /></label><button className="button button-secondary" disabled={busy} onClick={() => void connect()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Plug size={16}/>} {connected ? "Reconnect" : "Connect worker"}</button></div><p className="small-note">The pairing token stays in this tab's session storage and is sent only to your configured worker. Set WORKER_ALLOWED_ORIGINS to your Vercel URL. A browser local-network permission may be required. Off-computer access needs your own secure HTTPS worker endpoint.</p>{connected && <p className="source-provenance"><CheckCircle2 size={14}/> Worker connected: {Object.entries(versions).map(([name, version]) => `${name} ${version}`).join("; ")}</p>}</section>{error && <div className="notice notice-error" role="alert"><CircleHelp size={18}/>{error}</div>}<section className="plain-panel"><h3><Search size={18}/> Launch a coordinated investigation</h3><div className="worker-fields"><label>Niche or topic<input value={subject} maxLength={200} onChange={event=>setSubject(event.target.value)} placeholder="Astrology, numerology, or any other niche"/></label><label>Creators to investigate<input value={creators} onChange={event=>setCreators(event.target.value)} placeholder="Comma-separated handles or names"/></label><label>Hashtags<input value={hashtags} onChange={event=>setHashtags(event.target.value)} placeholder="astrology, numerology"/></label></div><div className="worker-fields"><label>Time window<select value={periodDays} onChange={event=>setPeriodDays(Number(event.target.value))}><option value={1}>24 hours</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label><label>Candidate limit<input type="number" min={1} max={30} value={limit} onChange={event=>setLimit(Number(event.target.value))}/></label><label>Videos to study<input type="number" min={0} max={5} value={studyLimit} onChange={event=>setStudyLimit(Number(event.target.value))}/></label></div><p className="small-note">Browser Use discovers candidates and Creative Center context. TikTok-Api checks available public metadata. yt-dlp + FFmpeg + local faster-whisper collect content evidence. GPT Researcher coordinates the comparison; Crawl4AI and optional local SearXNG support web sources. Missing or blocked steps remain explicit.</p><label className="worker-check"><input type="checkbox" checked={generate} onChange={event=>setGenerate(event.target.checked)}/> After research, generate scripts using this project's uploaded knowledge only</label><button className="button button-primary" disabled={!connected || busy || importing || Boolean(job && !terminal.has(job.status))} onClick={()=>void start()}><Bot size={18}/> Start autonomous research</button>{importing && <p role="status"><LoaderCircle className="spin" size={15}/> Importing evidence and running the dashboard's source-linked analysis…</p>}</section>{job && <section className="plain-panel"><div className="section-title"><h3>{job.request.subject}: {job.status}</h3>{!terminal.has(job.status) && <button className="button button-small button-secondary" onClick={()=>void request<WorkerJob>(`/v1/jobs/${job.id}/cancel`, {}).then(setJob).catch(cause=>setError(String(cause)))}>Request stop</button>}</div><div className="worker-events">{job.events.map((event,index)=><p key={index}><time>{new Date(event.at).toLocaleTimeString()}</time> {event.message}</p>)}</div>{job.error && <p className="inline-error">{job.error}</p>}{job.result && <><p>{job.result.coverage}</p><p>{job.result.videos.length} videos collected; {job.result.speechVideos} with speech; {job.result.visualVideos} with visual notes.</p>{job.result.warnings.length>0 && <details open><summary>Observed limitations and failed steps</summary><ul>{job.result.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}{job.result.report && <details><summary>GPT Researcher investigation</summary><pre className="worker-report">{job.result.report}</pre></details>}<div className="pattern-sources">{job.result.sources.map((source,index)=><a key={index} href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}<ExternalLink size={11}/></a>)}</div></>}</section>}{jobs.length>0 && <section className="plain-panel"><h3>Persisted worker jobs</h3><div className="pattern-sources">{jobs.map(item=><button key={item.id} onClick={()=>{generateRef.current=false;setJob(item);}}>{item.request.subject}: {item.status}</button>)}</div><p className="small-note">Reopening a completed job shows its stored evidence. It does not fabricate a new collection time or rerun paid analysis.</p></section>}<p className="guarantee-note"><ShieldCheck size={15}/> Manual login stays in the worker's isolated profile. A challenge or access denial stops collection; the agent does not bypass it. No system guarantees virality.</p></div>;
}
