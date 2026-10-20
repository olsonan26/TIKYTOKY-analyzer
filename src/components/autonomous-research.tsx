"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, CircleHelp, ExternalLink, LoaderCircle, Plug, Search, ShieldCheck } from "lucide-react";
import type { Video } from "@/lib/types";

export type WorkerResult = { projectId?: string; draft?: Video; subject: string; videos: Video[]; report: string; sources: {url: string; title?: string; method?: string}[]; warnings: string[]; coverage: string; generatedAt: string; liveCollection: boolean; blocked: boolean; speechVideos: number; visualVideos: number };
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
  const [urls, setUrls] = useState("");
  const [login, setLogin] = useState<{active: boolean; message: string}>({active:false,message:""});
  const [limit, setLimit] = useState(15), [studyLimit, setStudyLimit] = useState(3), [periodDays, setPeriodDays] = useState(7);
  const [generate, setGenerate] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [jobs, setJobs] = useState<WorkerJob[]>([]), [job, setJob] = useState<WorkerJob | null>(null), [importing, setImporting] = useState(false);
  const delivered = useRef(new Set<string>());
  const generateRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
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
      const status = await request<{ready: boolean; versions: Record<string, string>; aiConfigured: boolean; manualLogin?: {active:boolean;message:string}}>("/v1/status");
      if (!status.ready) throw new Error("Worker is reachable, but required Python dependencies are missing. Run the worker setup.");
      if (!status.aiConfigured) throw new Error("The local worker needs OPENROUTER_API_KEY in its environment or the repository's private .env.local.");
      sessionStorage.setItem(CONNECTION, JSON.stringify({base: connectionUrl(base), token}));
      setVersions(status.versions); setConnected(true);
      if(status.manualLogin) setLogin(status.manualLogin);
      setJobs((await request<{jobs: WorkerJob[]}>("/v1/jobs")).jobs);
    } catch (cause) { setConnected(false); setError(cause instanceof Error ? cause.message : "Cannot connect. Start the local worker, allow this dashboard origin, and grant local-network access if your browser requests it."); }
    finally { setBusy(false); }
  }
  async function start() {
    setBusy(true); setError("");
    try {
      if (!subject.trim()) throw new Error("Choose a niche or research subject.");
      generateRef.current = generate;
      const supplied = urls.split(/\s+/).map(s=>s.trim()).filter(Boolean);
      setJob(await request<WorkerJob>("/v1/jobs", { projectId, subject: subject.trim(), limit, periodDays, studyLimit, creators: creators.split(",").map(s => s.trim()).filter(Boolean), hashtags: hashtags.split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean), ...(supplied.length ? {urls:supplied} : {}), webResearch: true }));
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
          if (next.result.videos.length || next.result.draft) {
            setImporting(true);
            try { await onResultRef.current(next.result, generateRef.current); delivered.current.add(next.id); } finally { setImporting(false); }
          }
        }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Worker connection interrupted. Its persisted job can be reopened after reconnecting."); }
    }, 2500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [job, base, token]);
  useEffect(()=>{
    if(!login.active || !connected) return;
    const timer=window.setTimeout(()=>void request<{active:boolean;message:string}>("/v1/browser/login").then(setLogin).catch(()=>setError("Manual browser status unavailable. Reconnect to check it.")),2500);
    return()=>clearTimeout(timer);
  },[login,connected,base,token]);
  async function loginAction(close=false){
    setBusy(true);setError("");
    try{setLogin(await request(close?"/v1/browser/close":"/v1/browser/login",{}));}
    catch(cause){setError(cause instanceof Error?cause.message:"Could not open manual login.");}
    finally{setBusy(false);}
  }
  return <div className="content-view"><div className="view-heading"><span className="stat-icon coral"><Bot size={24} /></span><h1>Autonomous research, from real evidence.</h1><p>The local Python worker browses, collects, investigates and transcribes. This dashboard stays on Vercel. No Apify or Supadata key is required.</p></div><section className="plain-panel worker-pair"><h3><Plug size={18} /> Connect your local worker</h3><div className="worker-fields"><label>Worker address<input value={base} onChange={event => {setBase(event.target.value);setConnected(false);}} /></label><label>Local access token<input type="password" value={token} autoComplete="off" onChange={event => {setToken(event.target.value);setConnected(false);}} placeholder="From worker/.data/worker-token.txt" /></label><button className="button button-secondary" disabled={busy} onClick={() => void connect()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Plug size={16}/>} {connected ? "Reconnect" : "Connect worker"}</button></div><p className="small-note">The pairing token stays in this tab's session storage and is sent only to your configured worker. Set WORKER_ALLOWED_ORIGINS to your Vercel URL. A browser local-network permission may be required. Off-computer access needs your own secure HTTPS worker endpoint.</p>{connected && <p className="source-provenance"><CheckCircle2 size={14}/> Worker connected: {Object.entries(versions).map(([name, version]) => `${name} ${version}`).join("; ")}</p>}</section>{error && <div className="notice notice-error" role="alert"><CircleHelp size={18}/>{error}</div>}<section className="plain-panel"><h3>Persistent TikTok session</h3><p>When TikTok requests login, open the isolated browser, sign in yourself, and select Finish login. It uses the same exclusive profile as Browser Use.</p><button className="button button-secondary" disabled={!connected || busy || Boolean(job && !terminal.has(job.status))} onClick={()=>void loginAction(login.active)}>{login.active ? "Finish login and close browser" : "Open TikTok login"}</button>{login.message && <p className="small-note" role="status">{login.message}</p>}</section><section className="plain-panel"><h3><Search size={18}/> Launch a coordinated investigation</h3><div className="worker-fields"><label>Niche or topic<input value={subject} maxLength={200} onChange={event=>setSubject(event.target.value)} placeholder="Astrology, numerology, or any other niche"/></label><label>Creators to investigate<input value={creators} onChange={event=>setCreators(event.target.value)} placeholder="Comma-separated handles or names"/></label><label>Hashtags<input value={hashtags} onChange={event=>setHashtags(event.target.value)} placeholder="astrology, numerology"/></label></div><label>Specific public video links (optional)<textarea rows={2} value={urls} maxLength={16000} onChange={event=>setUrls(event.target.value)} placeholder="One public TikTok video URL per line; leave empty for autonomous discovery"/></label><div className="worker-fields"><label>Time window<select value={periodDays} onChange={event=>setPeriodDays(Number(event.target.value))}><option value={1}>24 hours</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label><label>Candidate limit<input type="number" min={1} max={30} value={limit} onChange={event=>setLimit(Number(event.target.value))}/></label><label>Videos to study<input type="number" min={0} max={5} value={studyLimit} onChange={event=>setStudyLimit(Number(event.target.value))}/></label></div><p className="small-note">Browser Use discovers candidates and Creative Center context. TikTok-Api checks available public metadata. yt-dlp + FFmpeg + local faster-whisper collect content evidence. GPT Researcher coordinates the comparison; Crawl4AI and optional local SearXNG support web sources. Missing or blocked steps remain explicit.</p><label className="worker-check"><input type="checkbox" checked={generate} onChange={event=>setGenerate(event.target.checked)}/> After research, generate scripts using this project's uploaded knowledge only</label><button className="button button-primary" disabled={!connected || busy || importing || login.active || Boolean(job && !terminal.has(job.status))} onClick={()=>void start()}><Bot size={18}/> Start autonomous research</button>{importing && <p role="status"><LoaderCircle className="spin" size={15}/> Importing evidence and running the dashboard's source-linked analysis…</p>}</section>{job && <section className="plain-panel"><div className="section-title"><h3>{job.request.subject}: {job.status}</h3>{!terminal.has(job.status) && <button className="button button-small button-secondary" onClick={()=>void request<WorkerJob>(`/v1/jobs/${job.id}/cancel`, {}).then(setJob).catch(cause=>setError(String(cause)))}>Request stop</button>}</div><div className="worker-events">{job.events.map((event,index)=><p key={index}><time>{new Date(event.at).toLocaleTimeString()}</time> {event.message}</p>)}</div>{job.error && <p className="inline-error">{job.error}</p>}{job.result && <><p>{job.result.coverage}</p>{(job.result.videos.length>0 || job.result.draft) && <button className="button button-secondary" disabled={importing} onClick={()=>{setImporting(true);void onResult(job.result!,false).catch(cause=>setError(cause instanceof Error?cause.message:"Import failed.")).finally(()=>setImporting(false));}}>Import saved evidence</button>}<p>{job.result.videos.length} videos collected; {job.result.speechVideos} with speech; {job.result.visualVideos} with visual notes.</p>{job.result.warnings.length>0 && <details open><summary>Observed limitations and failed steps</summary><ul>{job.result.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}{job.result.report && <details><summary>GPT Researcher investigation</summary><pre className="worker-report">{job.result.report}</pre></details>}<div className="pattern-sources">{job.result.sources.map((source,index)=><a key={index} href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}<ExternalLink size={11}/></a>)}</div></>}</section>}{jobs.length>0 && <section className="plain-panel"><h3>Persisted worker jobs</h3><div className="pattern-sources">{jobs.map(item=><button key={item.id} onClick={()=>{generateRef.current=false;setJob(item);}}>{item.request.subject}: {item.status}</button>)}</div><p className="small-note">Reopen a completed job to review its stored evidence. Import saved evidence can rerun paid analysis; its original collection timestamps are preserved.</p></section>}<p className="small-note">This product includes software developed by UncleCode (<a href="https://x.com/unclecode" target="_blank" rel="noreferrer">https://x.com/unclecode</a>) as part of the Crawl4AI project (<a href="https://github.com/unclecode/crawl4ai" target="_blank" rel="noreferrer">https://github.com/unclecode/crawl4ai</a>).</p><p className="guarantee-note"><ShieldCheck size={15}/> Manual login stays in the worker's isolated profile. A challenge or access denial stops collection; the agent does not bypass it. No system guarantees virality.</p></div>;
}
