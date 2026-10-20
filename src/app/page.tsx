"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, AudioLines, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clapperboard, Clock3, Copy, ExternalLink, Eye, FileJson, FileText, Film, Folder, Layers3, LoaderCircle, LockKeyhole, Menu, Plus, Search, Settings2, ShieldCheck, Sparkles, Target, TrendingUp, Upload, WandSparkles, X } from "lucide-react";
import { AutonomousResearch, type WorkerResult } from "@/components/autonomous-research";
import { CreatorLibrary } from "@/components/creator-library";
import { mergeVideos, normalizeVideos, rankVideos } from "@/lib/ranking";
import type { Brief, Coaching, DiscoveryJob, GrowthPlan, KnowledgeDocument, MetricSnapshot, Outcome, Project, RankedVideo, Research, ScriptBatch, ServiceStatus, Video } from "@/lib/types";
import { captureVideoFrames, downloadFile, scriptsMarkdown, withoutFrameBytes } from "@/lib/client-media";
import { parseSavedBrief, parseSavedProject } from "@/lib/client-media";
import { utahWallTimeToUtc } from "@/lib/growth";
import { KnowledgeCitations, KnowledgeLibrary, PostingPlan, VideoCoach } from "@/components/growth-tools";

type Tab = "autonomous" | "creators" | "research" | "patterns" | "knowledge" | "scripts" | "coach" | "plan" | "outcomes" | "setup";
type StoredWorkspace = { version: 1; projects: Project[]; briefs: Record<string, Brief>; activeId: string };
const STORAGE_KEY = "tiky-toky-workspace-v1";
const defaultBrief: Brief = { subject: "", audience: "", brand: "", offer: "", tone: "Curious and conversational", duration: 30, cta: "", count: 3, deliveryStyle: "direct-teaching", studyCreators: ["alex-hormozi"] };
const tabs = [{ id: "autonomous", label: "Autonomous research", icon: Search }, { id: "research", label: "Video research", icon: Search }, { id: "patterns", label: "Pattern library", icon: Layers3 }, { id: "knowledge", label: "Your knowledge", icon: BookOpen }, { id: "creators", label: "Creator study", icon: Target }, { id: "scripts", label: "Script studio", icon: WandSparkles }, { id: "coach", label: "Improve my video", icon: Target }, { id: "plan", label: "Posting plan", icon: CalendarDays }, { id: "outcomes", label: "Your results", icon: TrendingUp }] as const;
const compact = (value: number | null | undefined) => value == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const utahInputValue = (value = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Try again.";
const uid = () => crypto.randomUUID();
const safeLink = (value: string | undefined) => value && /^https?:\/\//i.test(value) ? value : undefined;
const newProject = (): Project => ({ id: uid(), subject: "", videos: [], outcomes: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const latestSnapshot = (video: Video) => [...video.snapshots].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || `Request failed (${response.status}).`);
  return result as T;
}

export default function Studio() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [briefs, setBriefs] = useState<Record<string, Brief>>({});
  const [activeId, setActiveId] = useState("");
  const [ready, setReady] = useState(false);
  const [recoveryData, setRecoveryData] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("autonomous");
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [studyProgress, setStudyProgress] = useState("");
  const [subject, setSubject] = useState("");
  const [platform, setPlatform] = useState<"tiktok" | "youtube">("tiktok");
  const [limit, setLimit] = useState(30);
  const [periodDays, setPeriodDays] = useState(7);
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState("signal");
  const [importOpen, setImportOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [job, setJob] = useState<{ data: DiscoveryJob; projectId: string } | null>(null);
  const [transcriptJob, setTranscriptJob] = useState<{ id: string; videoId: string; projectId: string; originalTranscript?: string } | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const briefsRef = useRef(briefs);
  briefsRef.current = briefs;
  const project = projects.find(item => item.id === activeId);
  const brief = briefs[activeId] || { ...defaultBrief, subject: project?.subject || subject };
  const locked = Boolean(status?.passwordRequired && !status.authenticated);
  const ranked = useMemo(() => {
    const result = rankVideos(project?.videos || []);
    if (sort === "views") return result.sort((a, b) => (latestSnapshot(b)?.views ?? -1) - (latestSnapshot(a)?.views ?? -1));
    if (sort === "growth") return result.sort((a, b) => (b.growthPerHour ?? -Infinity) - (a.growthPerHour ?? -Infinity));
    if (sort === "velocity") return result.sort((a, b) => (b.viewsPerHour ?? -1) - (a.viewsPerHour ?? -1));
    return result;
  }, [project?.videos, sort]);
  const selectedVideos = (project?.videos || []).filter(video => selected.includes(video.id)).slice(0, 20);
  const video = project?.videos.find(item => item.id === activeVideo);
  const freshest = project?.videos.reduce((latest, item) => Date.parse(item.fetchedAt) > Date.parse(latest || "1970-01-01") ? item.fetchedAt : latest, "");

  const refreshStatus = useCallback(async () => {
    try { setStatus(await api<ServiceStatus>("/api/status")); } catch (cause) { setError(message(cause)); }
  }, []);

  useEffect(() => {
    let original: string | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      original = raw;
      if (raw) {
        const stored = JSON.parse(raw) as StoredWorkspace;
        if (stored.version !== 1 || !Array.isArray(stored.projects)) throw new Error("Saved workspace format is not supported.");
        const cleaned = stored.projects.map(parseSavedProject);
        if (!cleaned.length) cleaned.push(newProject());
        const savedBriefs = Object.fromEntries(Object.entries(stored.briefs || {}).map(([id, saved]) => [id, parseSavedBrief(saved)]));
        setProjects(cleaned); setBriefs(savedBriefs); setActiveId(cleaned.some(item => item.id === stored.activeId) ? stored.activeId : cleaned[0].id);
      } else { const initial = newProject(); setProjects([initial]); setActiveId(initial.id); }
    } catch (cause) { setError(`${message(cause)} Download the original saved data below to recover it.`); setRecoveryData(original); const initial = newProject(); setProjects([initial]); setActiveId(initial.id); }
    setReady(true);
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!ready || recoveryData !== null) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, projects: projects.map(withoutFrameBytes), briefs, activeId } satisfies StoredWorkspace)); }
    catch { setError("Browser storage is full or unavailable. Download a project backup to keep your work."); }
  }, [projects, briefs, activeId, ready, recoveryData]);

  useEffect(() => {
    const current = projects.find(item => item.id === activeId);
    setSubject(current?.subject || ""); setSelected((current ? rankVideos(current.videos) : []).slice(0, 20).map(item => item.id)); setActiveVideo(null);
    // Changing the workspace should reset its local selection, not every video edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const updateProject = useCallback((id: string, update: (current: Project) => Project) => {
    setProjects(all => all.map(current => current.id === id ? { ...update(current), updatedAt: new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString() } : current));
  }, []);
  const setResearchSubject = (value: string) => {
    setSubject(value);
    updateProject(activeId, current => ({ ...current, subject: value, research: undefined, scripts: undefined, coaching: undefined, plan: undefined }));
    setBriefs(all => ({ ...all, [activeId]: { ...(all[activeId] || defaultBrief), subject: value } }));
  };
  const patchVideo = (id: string, update: Partial<Video>, projectId = activeId) => updateProject(projectId, current => ({ ...current, videos: current.videos.map(item => item.id === id ? { ...item, ...update, frames: undefined } : item), research: undefined, scripts: undefined, plan: undefined, coaching: undefined }));
  const addVideos = (incoming: Video[], projectId = activeId) => {
    updateProject(projectId, current => ({ ...current, videos: mergeVideos(current.videos, incoming), research: undefined, scripts: undefined, plan: undefined, coaching: undefined }));
    if (projectId === activeId) setSelected(current => [...new Set([...current, ...incoming.map(item => item.id)])].slice(0, 20));
  };

  useEffect(() => {
    if (!job || job.data.status !== "RUNNING") return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ id: job.data.id, subject: job.data.subject, limit: String(job.data.limit) });
        const result = await api<DiscoveryJob>(`/api/discover?${query}`);
        if (cancelled) return;
        setJob({ data: result, projectId: job.projectId });
        if (result.status === "SUCCEEDED") {
          const incoming = normalizeVideos(result.videos || []);
          updateProject(job.projectId, current => ({ ...current, videos: mergeVideos(current.videos, incoming), research: undefined, scripts: undefined, plan: undefined, coaching: undefined }));
          if (job.projectId === activeId) setSelected(incoming.slice(0, 20).map(item => item.id));
          setNotice(`Research complete. ${incoming.length} videos returned by this source.`);
        } else if (result.status !== "RUNNING") setError(result.message || `Discovery ended: ${result.status.toLowerCase()}.`);
      } catch (cause) { if (!cancelled) { setError(message(cause)); setJob(null); } }
    }, 3500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [job, activeId, updateProject]);

  useEffect(() => {
    if (!transcriptJob) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await api<{ status: string; transcript?: string; message?: string }>(`/api/transcript?id=${encodeURIComponent(transcriptJob.id)}`);
        if (cancelled) return;
        if (result.status === "completed") {
          const currentVideo = projectsRef.current.find(item => item.id === transcriptJob.projectId)?.videos.find(item => item.id === transcriptJob.videoId);
          if (currentVideo?.transcript !== transcriptJob.originalTranscript) { setTranscriptJob(null); setError("The transcript was edited while retrieval was running. Your edits were kept; fetch again if needed."); return; }
          updateProject(transcriptJob.projectId, current => ({ ...current, research: undefined, scripts: undefined, videos: current.videos.map(item => item.id === transcriptJob.videoId ? { ...item, transcript: result.transcript || "", transcriptSource: "Transcription provider" } : item) }));
          setTranscriptJob(null); setNotice("Transcript added to this video's evidence.");
        } else if (result.status === "queued" || result.status === "processing") setTranscriptJob({ ...transcriptJob });
        else { setTranscriptJob(null); setError(result.message || "Transcription failed. Paste a transcript to continue."); }
      } catch (cause) { if (!cancelled) { setTranscriptJob(null); setError(message(cause)); } }
    }, 4000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [transcriptJob, updateProject]);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label); setError(""); setNotice("");
    try { await action(); } catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  };
  const discover = () => run("discover", async () => {
    if (!subject.trim()) throw new Error("Enter a subject to start your research.");
    updateProject(activeId, current => ({ ...current, subject: subject.trim() }));
    setBriefs(all => ({ ...all, [activeId]: { ...(all[activeId] || defaultBrief), subject: subject.trim() } }));
    const result = await api<DiscoveryJob>("/api/discover", { subject: subject.trim(), platform, limit, periodDays });
    setJob({ data: result, projectId: activeId });
    if (result.status === "SUCCEEDED") { addVideos(normalizeVideos(result.videos || [])); setNotice(`${result.videos?.length || 0} videos found. Review their evidence before analysis.`); }
    else if (result.status !== "RUNNING") throw new Error(result.message || "This discovery could not be completed.");
  });
  const analyze = () => run("analyze", async () => {
    if (!selectedVideos.length) throw new Error("Select at least one video to analyze.");
    const initialVersion = project?.updatedAt;
    const result = await api<Research>("/api/analyze", { subject: subject || project?.subject, videos: selectedVideos });
    if (projectsRef.current.find(item => item.id === activeId)?.updatedAt !== initialVersion) throw new Error("Your project changed during analysis. Run analysis again to use the current evidence.");
    updateProject(activeId, current => ({ ...current, research: result, scripts: undefined })); setTab("patterns");
  });
  const acceptWorkerResult = useCallback(async (result: WorkerResult, shouldGenerate: boolean) => {
    const targetId = result.projectId || activeId;
    const target = projectsRef.current.find(p => p.id === targetId);
    if (!target) throw new Error("The original worker project no longer exists. Export its result from the worker before importing elsewhere.");
    const incoming = normalizeVideos(result.videos);
    updateProject(targetId, p => ({ ...p, subject: result.subject, videos: mergeVideos(p.videos, incoming), research: undefined, scripts: undefined, coaching: undefined, plan: undefined }));
    setBriefs(all => ({ ...all, [targetId]: { ...defaultBrief, ...(all[targetId] || {}), subject: result.subject } }));
    const sources = incoming.filter(v => v.transcript || v.visualNotes || v.onScreenText).slice(0,20);
    if (!sources.length) { setNotice("Worker collected source metadata, but obtained no transcript or visual evidence. No creative analysis was fabricated. Review the worker's limitations."); return; }
    const evidenceFingerprint = JSON.stringify(sources.map(v => [v.id,v.transcript,v.visualNotes,v.onScreenText]));
    const research = await api<Research>("/api/analyze", {subject:result.subject,videos:sources});
    const latest = projectsRef.current.find(p => p.id === targetId);
    const currentFingerprint = JSON.stringify(sources.map(v => {const current=latest?.videos.find(item=>item.id===v.id);return[current?.id,current?.transcript,current?.visualNotes,current?.onScreenText];}));
    if (currentFingerprint !== evidenceFingerprint) throw new Error("Evidence changed during worker analysis. Reanalyze current sources; stale output was discarded.");
    updateProject(targetId,p=>({...p,research,scripts:undefined}));
    if (targetId === activeId) setSelected(sources.map(v=>v.id));
    if (!shouldGenerate) {setNotice("Worker evidence imported and analyzed. Review patterns, then create scripts from your knowledge.");return;}
    if (!latest?.knowledge?.length) throw new Error("Research is complete. Upload your own knowledge to this project before generating factual scripts.");
    const knowledgeFingerprint = JSON.stringify(latest.knowledge);
    const creativeBrief = { ...defaultBrief, ...(briefsRef.current[targetId] || {}), subject:result.subject, audience:briefsRef.current[targetId]?.audience || `People interested in ${result.subject}` };
    const scripts = await api<ScriptBatch>("/api/scripts",{brief:creativeBrief,research,videos:sources,knowledge:latest.knowledge,outcomes:latest.outcomes.toSorted((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,20)});
    if (JSON.stringify(projectsRef.current.find(p=>p.id===targetId)?.knowledge) !== knowledgeFingerprint) throw new Error("Knowledge changed during script generation; stale scripts were discarded.");
    updateProject(targetId,p=>({...p,scripts}));
    setNotice("Autonomous research and knowledge-grounded scripts completed. Review citations and script before publishing.");
  },[activeId,updateProject]);
  const autoStudy = () => run("study", async () => {
    const targets = rankVideos(selectedVideos).slice(0, 5);
    if (!targets.length) throw new Error("Select source videos first. Automatic study processes the top five selected examples.");
    if (!status?.ai) throw new Error("Configure OPENROUTER_API_KEY before automatic study.");
    const studyProjectId = activeId;
    const collected: Video[] = [];
    const failures: string[] = [];
    try {
      for (let index = 0; index < targets.length; index++) {
        let item: Video = { ...targets[index] };
        setStudyProgress(`Studying ${index + 1}/${targets.length}: ${item.title.slice(0, 70)}`);
        if (!item.transcript && status.transcripts) {
          try {
            let transcript = await api<{status: string; transcript?: string; jobId?: string}>("/api/transcript", {url: item.url});
            const jobId = transcript.jobId;
            for (let attempt = 0; transcript.status === "queued" && jobId && attempt < 20; attempt++) {
              await new Promise(resolve => window.setTimeout(resolve, 3500));
              transcript = await api(`/api/transcript?id=${encodeURIComponent(jobId)}`);
            }
            if (transcript.status === "completed" && transcript.transcript) item = { ...item, transcript: transcript.transcript, transcriptSource: "Supadata transcript from source URL" };
            else failures.push(`${item.title}: speech retrieval did not finish; speech remains unavailable.`);
          } catch (cause) { failures.push(`${item.title}: ${message(cause)}`); }
        }
        if (!item.visualNotes && item.mediaUrl) {
          try {
            const visual = await api<{visualNotes: string; onScreenText: string; frameTimes: number[]; frameCount: number}>("/api/study", {video: item});
            item = { ...item, visualNotes: `${visual.visualNotes}\nDecoded ${visual.frameCount} frames at actual video timestamps: ${visual.frameTimes.map(t => t.toFixed(2)).join(", ")} seconds.`, onScreenText: visual.onScreenText };
          } catch (cause) { failures.push(`${item.title}: ${message(cause)}`); }
        }
        const current = projectsRef.current.find(p => p.id === studyProjectId)?.videos.find(v => v.id === item.id);
        if (current && (current.transcript !== targets[index].transcript || current.visualNotes !== targets[index].visualNotes || current.onScreenText !== targets[index].onScreenText)) throw new Error("Source evidence changed during automatic study. Your edits were kept; run study again.");
        if (item.transcript || item.visualNotes || item.onScreenText) {
          collected.push(item);
          patchVideo(item.id, { transcript: item.transcript, transcriptSource: item.transcriptSource, visualNotes: item.visualNotes, onScreenText: item.onScreenText }, studyProjectId);
        } else failures.push(`${item.title}: no speech or footage evidence is available. Configure transcription, refresh downloadable footage, or upload a local copy.`);
      }
      if (failures.length) setNotice(`Evidence gaps: ${failures.join(" ")}`);
      if (!collected.length) throw new Error("No creative evidence was obtained. No automatic study result was generated. Add transcripts or downloadable footage and retry.");
      setStudyProgress(`Analyzing ${collected.length} examples with actual content evidence…`);
      const fingerprint = JSON.stringify(collected.map(v => [v.id, v.transcript, v.visualNotes, v.onScreenText]));
      const result = await api<Research>("/api/analyze", { subject: subject || project?.subject, videos: collected });
      const currentSources = projectsRef.current.find(p => p.id === studyProjectId)?.videos || [];
      const currentFingerprint = JSON.stringify(collected.map(v => { const item = currentSources.find(x => x.id === v.id); return [item?.id, item?.transcript, item?.visualNotes, item?.onScreenText]; }));
      if (fingerprint !== currentFingerprint) throw new Error("Your source evidence changed during analysis. Generate analysis again using the current evidence.");
      updateProject(studyProjectId, p => ({ ...p, research: result, scripts: undefined }));
      setTab("patterns");
      if (!failures.length) setNotice(`${collected.length} source videos studied from available content evidence. Review individual evidence limits.`);
    } finally { setStudyProgress(""); }
  });
  const generate = () => run("generate", async () => {
    if (!project?.research) throw new Error("Analyze your selected videos first to build a pattern library.");
    if (!project.knowledge?.length) throw new Error("Add at least one knowledge document first. Scripts use your knowledge for factual claims.");
    if (project.knowledge.reduce((total, document) => total + document.text.length, 0) > 100000) throw new Error("Keep selected knowledge under 100,000 characters. Remove or shorten a document to generate.");
    const initialVersion = project.updatedAt;
    if (!brief.subject.trim() || !brief.audience.trim()) throw new Error("Add the subject and audience to your creative brief.");
    const originalBrief = JSON.stringify(briefsRef.current[activeId]);
    const evidence = project.videos.filter(item => project.research?.sourceIds.includes(item.id)).slice(0, 20);
    const result = await api<ScriptBatch>("/api/scripts", { brief, research: project.research, videos: evidence, knowledge: project.knowledge, outcomes: project.outcomes.toSorted((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 20) });
    if (projectsRef.current.find(item => item.id === activeId)?.updatedAt !== initialVersion || JSON.stringify(briefsRef.current[activeId]) !== originalBrief) throw new Error("Your source material or brief changed during generation. Generate again to use the current evidence.");
    updateProject(activeId, current => ({ ...current, scripts: result })); setNotice("Your original scripts are ready. Review factual claims before publishing.");
  });
  const fetchTranscript = (item: Video) => run(`transcript:${item.id}`, async () => {
    const result = await api<{ status: "completed" | "queued"; transcript?: string; jobId?: string; message?: string }>("/api/transcript", { url: item.url });
    if (projectsRef.current.find(current => current.id === activeId)?.videos.find(current => current.id === item.id)?.transcript !== item.transcript) throw new Error("The transcript changed during retrieval. Your edits were kept.");
    if (result.status === "completed") { patchVideo(item.id, { transcript: result.transcript || "", transcriptSource: "Transcription provider" }); setNotice("Transcript added."); }
    else if (result.jobId) { setTranscriptJob({ id: result.jobId, videoId: item.id, projectId: activeId, originalTranscript: item.transcript }); setNotice(result.message || "Transcription started. You can keep working while it processes."); }
    else throw new Error(result.message || "No transcription job was returned.");
  });
  const inspectFile = (item: Video, file: File) => run(`inspect:${item.id}`, async () => {
    const initialVersion = project?.updatedAt;
    const captured = await captureVideoFrames(file);
    const result = await api<{ visualNotes: string; onScreenText: string }>("/api/inspect", { video: item, frames: captured.frames });
    if (projectsRef.current.find(current => current.id === activeId)?.updatedAt !== initialVersion) throw new Error("Your evidence changed during frame inspection. Your edits were kept; inspect again if needed.");
    patchVideo(item.id, { ...result, duration: item.duration || captured.duration });
    setNotice(`${captured.frames.length} frames inspected. Visual notes saved; image bytes discarded.`);
  });
  const exportProject = () => {
    if (!project) return;
    downloadFile(`tiky-toky-${project.subject.replace(/[^a-z0-9]+/gi, "-") || "research"}.json`, JSON.stringify({ version: 1, project: withoutFrameBytes(project), brief }, null, 2));
  };
  const importBackup = async (file: File) => {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose a JSON backup smaller than 10 MB.");
      const raw = JSON.parse(await file.text());
      const source = raw.project || raw;
      if (!source || !Array.isArray(source.videos) || typeof source.subject !== "string") throw new Error("This is not a project backup. To add videos, use Import videos.");
      const restored = parseSavedProject({ ...source, id: uid(), updatedAt: new Date().toISOString() });
      const restoredBrief = raw.brief ? parseSavedBrief(raw.brief) : undefined;
      setProjects(all => [...all, restored]); setActiveId(restored.id); if (restoredBrief) setBriefs(all => ({ ...all, [restored.id]: restoredBrief })); setNotice("Backup restored as a separate browser-saved project.");
    } catch (cause) { setError(message(cause)); }
  };

  return <div className="studio-shell">
    <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
      <a className="brand" href="/" aria-label="TIKY TOKY home"><span className="brand-mark"><AudioLines size={25} strokeWidth={2.8} /></span><span>TIKY<span className="brand-second">TOKY</span><small>Viral intelligence studio</small></span></a>
      <div className="workspace-label"><span className="workspace-dot" /> Your workspace <ChevronDown size={14} /></div>
      <nav aria-label="Main navigation">{tabs.map(item => <button key={item.id} className={`nav-item ${tab === item.id ? "active" : ""}`} onClick={() => { setTab(item.id); setSidebarOpen(false); }}><item.icon size={18} /><span>{item.label}</span>{item.id === "scripts" && Boolean(project?.scripts?.scripts.length) && <span className="nav-count">{project?.scripts?.scripts.length}</span>}</button>)}</nav>
      <div className="project-heading"><span>Research projects</span><button className="icon-button" aria-label="Create research project" onClick={() => { const item = newProject(); setProjects(all => [...all, item]); setActiveId(item.id); setTab("research"); }}><Plus size={16} /></button></div>
      <div className="project-list">{projects.map(item => <button key={item.id} className={`project-item ${item.id === activeId ? "current" : ""}`} onClick={() => { setActiveId(item.id); setSidebarOpen(false); }}><Folder size={15} /><span>{item.subject || "Untitled research"}</span><small>{item.videos.length}</small></button>)}</div>
      <div className="sidebar-bottom"><div className="saved-note"><ShieldCheck size={18} /><div>Saved in this browser<small>Export a backup to take it with you.</small></div></div><button className={`nav-item ${tab === "setup" ? "active" : ""}`} onClick={() => { setTab("setup"); setSidebarOpen(false); }}><Settings2 size={18} /> Connections & setup</button><button className="backup-link" onClick={() => backupInput.current?.click()}><Upload size={14} /> Restore project backup</button><input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.target.value = ""; }} /></div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <div className="workspace-main">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={21} /></button><span>Workspace</span><ChevronRight size={13} /><strong>{project?.subject || "New research"}</strong></div><div className="topbar-actions"><span className="private-badge"><span /> Private workspace</span><button className="button button-small button-secondary" onClick={exportProject} disabled={!project}><ArrowDownToLine size={15} /> Export project</button><span className="avatar" title="Local workspace">TT</span></div></header>
      <main>
        {error && <div role="alert" className="notice notice-error"><CircleHelp size={18} /><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={17} /></button></div>}
        {recoveryData !== null && <div className="recovery-panel"><p>Autosave is paused to protect your original saved workspace. Download the original data before starting a new workspace.</p><button className="button button-secondary button-small" onClick={() => downloadFile("tiky-toky-recovery.json", recoveryData)}>Download original data</button><button className="button button-dark button-small" onClick={() => { downloadFile("tiky-toky-recovery.json", recoveryData); setRecoveryData(null); }}>Download & start new workspace</button></div>}
        {notice && <div role="status" className="notice notice-success"><CheckCircle2 size={18} /><span>{notice}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={17} /></button></div>}
        {tab === "autonomous" && <AutonomousResearch initialSubject={project?.subject || ""} projectId={activeId} onResult={acceptWorkerResult} />}
        {tab === "research" && <>
          <div className="page-intro"><div><div className="intro-label"><span className="signal-mini" /> Research that becomes original content</div><h1>Find the pattern.<br />Make it yours.</h1><p>Study standout videos in any subject. Turn what you learn into your next original script.</p></div><div className="intro-art" aria-hidden="true"><div className="art-video video-one"><div className="art-play" /><i /><i /><i /><div className="art-caption" /></div><div className="art-video video-two"><AudioLines size={49} /><span /><span /><span /></div><div className="art-spark"><Sparkles size={24} /></div><span className="art-path" /></div></div>
          <section className="discovery-panel" aria-label="Discover videos"><form onSubmit={event => { event.preventDefault(); void discover(); }}><label className="search-field"><Search size={22} /><input aria-label="Research subject" placeholder="What do you want to explore? Try any topic or niche…" value={subject} onChange={event => setResearchSubject(event.target.value)} maxLength={200} /><kbd>Topic</kbd></label><div className="discovery-controls"><label className="select-field"><span>Platform</span><select value={platform} onChange={event => setPlatform(event.target.value as "tiktok" | "youtube")}><option value="tiktok">TikTok</option><option value="youtube">YouTube</option></select></label><label className="select-field"><span>Published within</span><select value={periodDays} onChange={event => setPeriodDays(Number(event.target.value))}><option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option></select></label><label className="select-field"><span>Sample size</span><select value={limit} onChange={event => setLimit(Number(event.target.value))}><option value={10}>10 videos</option><option value={30}>30 videos</option><option value={50}>50 videos</option><option value={100}>100 videos</option></select></label><button className="button button-primary discover-button" type="submit" disabled={Boolean(busy) || job?.data.status === "RUNNING" || locked}>{busy === "discover" || job?.data.status === "RUNNING" ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />} {ranked.length ? "Refresh research" : "Discover videos"} <ArrowRight size={16} /></button></div></form><div className="discovery-foot"><span><ShieldCheck size={14} /> Ranked source sample. Coverage varies by platform.</span><button onClick={() => setImportOpen(true)}><Upload size={14} /> Or import your own videos</button></div></section>
          {platform === "tiktok" && <p className="budget-note">TikTok discovery uses your Apify account. Default provider budget: up to $1 per search; configurable on the server. Footage downloads are requested for automatic visual study and may consume the provider budget.</p>}{freshest && <div className="freshness-bar"><span><span className="status-dot" />Latest collected evidence: {new Date(freshest).toLocaleString()}</span><button disabled={Boolean(busy) || job?.data.status === "RUNNING"} onClick={() => void discover()}>Refresh current research <ArrowRight size={12} /></button></div>}{status && !(platform === "tiktok" ? status.tiktok : status.youtube) && <div className="connection-hint"><span><span className="status-dot amber" /> Connect {platform === "tiktok" ? "TikTok discovery" : "YouTube discovery"} to search live videos. You can import research now.</span><button onClick={() => setTab("setup")}>View setup <ArrowRight size={14} /></button></div>}
          {job?.projectId === activeId && <div className={`job-state ${job.data.status === "RUNNING" ? "running" : ""}`}>{job.data.status === "RUNNING" ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}<div><strong>{job.data.status === "RUNNING" ? "Collecting your research sample…" : "Discovery source coverage"}</strong><p>{job.data.coverage || job.data.message || "Search is running. Results will appear automatically."}</p></div></div>}
          <div className="workspace-stats"><div><span className="stat-icon coral"><Film size={19} /></span><strong>{project?.videos.length || 0}</strong><span>Videos collected</span></div><div><span className="stat-icon cyan"><FileText size={19} /></span><strong>{project?.videos.filter(item => item.transcript?.trim()).length || 0}</strong><span>With transcripts</span></div><div><span className="stat-icon lilac"><Layers3 size={19} /></span><strong>{project?.research?.patterns.length || 0}</strong><span>Patterns identified</span></div><div><span className="stat-icon blue"><Clapperboard size={19} /></span><strong>{project?.scripts?.scripts.length || 0}</strong><span>Original scripts</span></div></div>
          <section className="research-section"><div className="section-title"><div><h2>Your research collection <span className="count-badge">{ranked.length}</span></h2><p>Select up to 20 videos. Add transcripts or visual evidence for a stronger analysis.</p></div><button className="button button-secondary" onClick={() => setImportOpen(true)}><Plus size={16} /> Import videos</button></div><div className="collection-toolbar"><label className="checkbox-label"><input type="checkbox" checked={ranked.length > 0 && selected.length === Math.min(ranked.length, 20)} onChange={event => setSelected(event.target.checked ? ranked.slice(0, 20).map(item => item.id) : [])} />{selected.length ? `${selected.length} selected` : "Select top 20"}</label><div className="toolbar-right"><label className="sort-field">Sort by <select value={sort} onChange={event => setSort(event.target.value)}><option value="signal">Research signal</option><option value="views">Most views</option><option value="velocity">Average views per hour</option><option value="growth">Observed recent growth</option></select></label><button className="button button-dark button-small" disabled={Boolean(busy) || !selected.length || locked} onClick={() => void analyze()}>{busy === "analyze" ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Analyze selected</button></div></div>
            {!ranked.length ? <div className="empty-collection"><div className="empty-visual"><Search size={35} /><span className="empty-orbit one" /><span className="empty-orbit two" /><span className="empty-corner"><Film size={18} /></span></div><h3>Your next idea starts with a little research.</h3><p>Search a subject above, or bring in video links, performance metrics, and transcripts from your own research.</p><button className="button button-secondary" onClick={() => setImportOpen(true)}><Upload size={16} /> Import videos</button><div className="empty-topics"><span>Explore any subject</span><button onClick={() => setResearchSubject("numerology")}>Numerology</button><button onClick={() => setResearchSubject("home cooking")}>Home cooking</button><button onClick={() => setResearchSubject("astrology")}>Astrology</button></div></div> : <div className="video-grid">{ranked.map((item, index) => <VideoCard key={item.id} video={item} index={index} selected={selected.includes(item.id)} onToggle={() => setSelected(all => all.includes(item.id) ? all.filter(id => id !== item.id) : all.length < 20 ? [...all, item.id] : all)} onOpen={() => setActiveVideo(item.id)} />)}</div>}
          </section><div className="evidence-footer"><ShieldCheck size={16} /><p>Views and engagement are source-reported snapshots. Attention and retention commentary are estimates, never measured audience-retention curves.</p></div>
        </>}
        {tab === "research" && <div className="auto-study-panel"><div><strong>Actually study the content</strong><p>Fetch available footage, decode real frames, retrieve speech when configured, then analyze the top five selected examples. Each missing source is reported. Uses your provider credits.</p>{studyProgress && <p role="status">{studyProgress}</p>}</div><button className="button button-primary" disabled={Boolean(busy) || !selectedVideos.length || locked} onClick={() => void autoStudy()}>{busy === "study" ? <LoaderCircle className="spin" size={17} /> : <Eye size={17} />} Study top 5 & analyze</button></div>}
        {tab === "patterns" && <div className="content-view"><ViewHeading icon={Layers3} title="A pattern library, built from evidence." description="Find the mechanics that recur across your selected videos. Keep the inspiration; make the content your own." />{project?.research ? <><div className="research-summary"><Sparkles size={24} /><div><h3>The research readout</h3><p>{project.research.summary}</p><small>{project.research.sourceIds.length} source videos · {project.research.model} · {date(project.research.generatedAt)}</small></div></div><div className="patterns-grid">{project.research.patterns.map((pattern, index) => <article className="pattern-card" key={`${pattern.name}-${index}`}><div className="pattern-top"><span className="pattern-symbol"><Layers3 size={21} /></span><span className={`confidence confidence-${pattern.confidence}`}>{pattern.confidence} confidence</span></div><h3>{pattern.name}</h3><p>{pattern.explanation}</p><blockquote>{pattern.evidence}</blockquote><div className="pattern-sources">{pattern.videoIds.map(id => { const source = project.videos.find(item => item.id === id); return source ? <button key={id} onClick={() => setActiveVideo(id)}><Film size={12} />{source.title}</button> : <span key={id}>Source: {id}</span>; })}</div></article>)}</div><div className="analysis-columns"><section className="plain-panel"><h3><Target size={18} /> Creative opportunities</h3><ul>{project.research.opportunities.map((item, index) => <li key={index}>{item}</li>)}</ul></section><section className="plain-panel"><h3><CircleHelp size={18} /> What this evidence cannot tell us</h3><ul>{project.research.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></section></div><div className="section-title breakdown-heading"><h2>Video-by-video breakdown</h2><button className="button button-primary" onClick={() => setTab("scripts")}><WandSparkles size={16} /> Build my scripts <ArrowRight size={15} /></button></div><div className="video-breakdowns">{project.research.videos.map((analysis, index) => <details key={`${analysis.videoId}-${index}`}><summary><Film size={17} /><span>{project.videos.find(item => item.id === analysis.videoId)?.title || analysis.videoId}</span><small>{analysis.evidenceLevel.replaceAll("_", " + ")}</small><ChevronDown size={16} /></summary><div className="breakdown-body">{Object.entries({ Hook: analysis.hook, Structure: analysis.structure, Visuals: analysis.visualTechnique, Audio: analysis.audioTechnique, Curiosity: analysis.curiosity, CTA: analysis.cta }).map(([label, text]) => <div key={label}><strong>{label}</strong><p>{text}</p></div>)}<div className="attention-note"><strong>Estimated attention risks</strong><ul>{analysis.attentionRisks.map((risk, riskIndex) => <li key={riskIndex}>{risk}</li>)}</ul><small>Hypotheses based on available evidence, not actual viewer retention.</small></div></div></details>)}</div></> : <EmptyState icon={Layers3} title="Let the evidence reveal the patterns." description="Collect videos, select a useful sample, and analyze them to start your pattern library." action="Go to video research" onAction={() => setTab("research")} />}</div>}
        {tab === "creators" && <CreatorLibrary selected={brief.studyCreators || ["alex-hormozi"]} onChange={ids => setBriefs(all => ({ ...all, [activeId]: { ...brief, studyCreators: ids } }))} onResearch={name => { const item = { ...newProject(), subject: name }; setProjects(all => [...all, item]); setActiveId(item.id); setSubject(name); setTab("research"); setNotice("Confirm the creator on returned videos. Name searches may include mentions from other accounts."); }} />}
        {tab === "scripts" && <div className="content-view"><ViewHeading icon={WandSparkles} title="Your perspective. Evidence-based inspiration." description="Give the research a direction. Create original scripts that fit your audience, offering, and voice." /><div className="script-layout"><section className="brief-panel"><div className="panel-heading"><span className="stat-icon coral"><FileText size={18} /></span><div><h3>Your creative brief</h3><p>Tell us what you want to make.</p></div></div><BriefForm brief={brief} onChange={next => setBriefs(all => ({ ...all, [activeId]: next }))} /><div className="brief-evidence"><Layers3 size={17} /><span>{project?.research ? `${project.research.patterns.length} patterns from ${project.research.sourceIds.length} videos` : "Analyze a video sample to unlock generation"}</span></div><button className="button button-primary full-width" disabled={Boolean(busy) || !project?.research || !project?.knowledge?.length || (project.knowledge || []).reduce((total, document) => total + document.text.length, 0) > 100000 || locked} onClick={() => void generate()}>{busy === "generate" ? <LoaderCircle className="spin" size={17} /> : <WandSparkles size={17} />} Generate original scripts</button><button className="knowledge-brief-link" onClick={() => setTab("knowledge")}><BookOpen size={14} />{project?.knowledge?.length ? `${project.knowledge.length} knowledge documents connected` : "Add knowledge to unlock scripts"}<ArrowRight size={12} /></button><p className="small-note">Uses your knowledge for claims and the latest 20 outcome records for performance context. Review before publishing.</p></section><section className="scripts-output"><div className="section-title"><div><h2>Your scripts <span className="count-badge">{project?.scripts?.scripts.length || 0}</span></h2><p>{project?.scripts ? `Created with ${project.scripts.model}` : "From research to something you can record."}</p></div>{project?.scripts && <button className="button button-secondary button-small" onClick={() => downloadFile("tiky-toky-scripts.md", scriptsMarkdown(project.subject, project.scripts!.scripts), "text/markdown")}><ArrowDownToLine size={15} /> Download</button>}</div>{project?.scripts ? project.scripts.scripts.map((script, index) => <article className="script-card" key={`${script.title}-${index}`}><div className="script-card-head"><span className="script-number">{String(index + 1).padStart(2, "0")}</span><div><h3>{script.title}</h3><p>{script.angle}</p></div><button className="icon-button" aria-label={`Copy ${script.title}`} onClick={() => { void navigator.clipboard.writeText(scriptsMarkdown(project.subject, [script])).then(() => setNotice("Script copied to clipboard.")).catch(() => setError("Clipboard unavailable. Use Download to save the script.")); }}><Copy size={17} /></button></div><div className="script-hook"><small>Opening hook</small><p>“{script.hook}”</p></div><div className="script-beats">{script.beats.map((beat, beatIndex) => <div className="script-beat" key={beatIndex}><time>{beat.start}–{beat.end}s</time><div><p>{beat.spoken}</p><dl><dt>On screen</dt><dd>{beat.onScreen}</dd><dt>Visual</dt><dd>{beat.visual}</dd></dl></div></div>)}</div><div className="script-post"><strong>Call to action</strong><p>{script.cta}</p><strong>Caption</strong><p>{script.caption}</p><div className="hashtag-list">{script.hashtags.map((tag, tagIndex) => <span key={tagIndex}>{tag.startsWith("#") ? tag : `#${tag}`}</span>)}</div></div><details className="script-reasoning"><summary>Why this approach <ChevronDown size={15} /></summary><p>{script.hypothesis}</p><strong>Test this</strong><p>{script.testPlan}</p><small>Patterns: {script.patternNames.join(", ")}</small><div className="pattern-sources">{script.sourceIds.map(id => <button key={id} onClick={() => setActiveVideo(id)}>Source {project.videos.findIndex(item => item.id === id) + 1}</button>)}</div></details><KnowledgeCitations documents={project.knowledge || []} citations={script.knowledgeCitations || []} /></article>) : <EmptyState icon={Clapperboard} title="An empty page. A lot of possibility." description="Complete your creative brief, then generate scripts inspired by the patterns in your research." />}</section></div></div>}
        {tab === "outcomes" && <div className="content-view"><ViewHeading icon={TrendingUp} title="Let your real results lead." description="Record published videos and repeat observations. Learn which creative hypotheses hold up with your audience." /><OutcomeTracker outcomes={project?.outcomes || []} titles={project?.scripts?.scripts.map(item => item.title) || []} onSave={(outcome) => updateProject(activeId, current => { const existing = current.outcomes.find(item => item.url === outcome.url && item.scriptTitle === outcome.scriptTitle); return { ...current, plan: undefined, outcomes: existing ? current.outcomes.map(item => item.id === existing.id ? { ...item, notes: outcome.notes || item.notes, snapshots: [...item.snapshots, ...outcome.snapshots] } : item) : [...current.outcomes, outcome] }; })} onNotice={setNotice} />{project?.outcomes.length ? <div className="outcomes-list">{project.outcomes.map(outcome => <article key={outcome.id} className="outcome-card"><div><span className="stat-icon cyan"><TrendingUp size={19} /></span><div><h3>{outcome.scriptTitle}</h3><a href={safeLink(outcome.url)} target="_blank" rel="noreferrer">View published video <ExternalLink size={12} /></a></div><small>{outcome.snapshots.length} observation{outcome.snapshots.length === 1 ? "" : "s"}</small></div><div className="table-scroll"><table><thead><tr><th>Observed</th><th>Views</th><th>Likes</th><th>Comments</th><th>Shares</th></tr></thead><tbody>{outcome.snapshots.map((snapshot, index) => <tr key={`${snapshot.observedAt}-${index}`}><td>{new Date(snapshot.observedAt).toLocaleString()}</td><td>{compact(snapshot.views)}</td><td>{compact(snapshot.likes)}</td><td>{compact(snapshot.comments)}</td><td>{compact(snapshot.shares)}</td></tr>)}</tbody></table></div>{outcome.notes && <p className="outcome-notes">{outcome.notes}</p>}</article>)}</div> : <div className="outcomes-tip"><Target size={20} /><p>Start with a clear hypothesis: change the hook, keep the rest similar, and record comparable observation windows. A few views alone cannot establish which technique caused a result.</p></div>}</div>}
        {tab === "setup" && <div className="content-view"><ViewHeading icon={Settings2} title="Connect your research studio." description="Provider credentials stay on the server. Your projects and text evidence are saved in this browser." /><Connections status={status} onRefresh={() => void refreshStatus()} /><div className="setup-notes"><h3>A clear chain from source to script</h3><p>Discovery returns a provider's ranked sample, with a limited view of the platform. Imported videos can include your own verified metrics and transcripts. AI findings are interpretations of this evidence.</p><p>Upload a local video from its evidence panel for frame analysis. Sampled images are sent to the configured AI service, then discarded from the browser project. Download backups regularly; browser storage does not sync across devices.</p><button className="button button-secondary" onClick={exportProject}><FileJson size={16} /> Download project backup</button></div></div>}
        {tab === "knowledge" && <div className="content-view"><ViewHeading icon={BookOpen} title="Your knowledge. Your source of truth." description="Ground every script in your own material. Add the content, lessons, and product facts your audience should hear." /><KnowledgeLibrary documents={project?.knowledge || []} onChange={documents => updateProject(activeId, current => ({ ...current, knowledge: documents, scripts: undefined }))} /></div>}
        {tab === "coach" && <div className="content-view"><ViewHeading icon={Target} title="Make your next edit count." description="Compare your draft with selected standout videos. Get concrete, prioritized changes grounded in the evidence." /><VideoCoach draft={project?.draft} coaching={project?.coaching} subject={subject || project?.subject || ""} benchmarks={selectedVideos.slice(0, 10)} onDraft={draft => updateProject(activeId, current => ({ ...current, draft, coaching: undefined }))} onCoaching={coaching => updateProject(activeId, current => ({ ...current, coaching }))} onChooseReferences={() => setTab("research")} /></div>}
        {tab === "plan" && <div className="content-view"><ViewHeading icon={CalendarDays} title="A practical plan for your next post." description="Choose a length and posting window to test, with Utah local times and a clear basis for each recommendation." /><PostingPlan plan={project?.plan} videos={project?.videos || []} outcomes={project?.outcomes || []} onPlan={plan => updateProject(activeId, current => ({ ...current, plan }))} onUseDuration={duration => { setBriefs(all => ({ ...all, [activeId]: { ...brief, duration } })); setTab("scripts"); setNotice(`${duration}-second target added to your creative brief.`); }} /></div>}
      </main>
      <footer className="app-footer"><span><span className="footer-mark" /> TIKY TOKY</span><p>Study the signal. Create something original.</p><span>Browser-saved workspace</span></footer>
    </div>
    {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImport={input => { const imported = normalizeVideos(input); if (!imported.length) throw new Error("No valid videos found. Include a URL and title for each video."); addVideos(imported); setImportOpen(false); setNotice(`${imported.length} videos added to your collection.`); }} />}
    {video && <EvidenceDrawer key={video.id} video={video} busy={busy} queued={transcriptJob?.videoId === video.id} onClose={() => setActiveVideo(null)} onSave={patch => { patchVideo(video.id, patch); setNotice("Evidence saved. Reanalyze your collection to update patterns."); }} onTranscribe={() => void fetchTranscript(video)} onInspect={file => void inspectFile(video, file)} onRemove={() => { updateProject(activeId, current => ({ ...current, videos: current.videos.filter(item => item.id !== video.id), research: undefined, scripts: undefined, plan: undefined, coaching: undefined })); setSelected(all => all.filter(id => id !== video.id)); setActiveVideo(null); }} />}
    {locked && <LoginGate onLogin={password => run("login", async () => { await api("/api/session", { password }); await refreshStatus(); })} busy={busy === "login"} error={error} />}
  </div>;
}

function ViewHeading({ icon: Icon, title, description }: { icon: typeof Search; title: string; description: string }) {
  return <div className="view-heading"><span className="view-icon"><Icon size={24} /></span><h1>{title}</h1><p>{description}</p></div>;
}

function EmptyState({ icon: Icon, title, description, action, onAction }: { icon: typeof Search; title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span className="empty-state-icon"><Icon size={31} /></span><h3>{title}</h3><p>{description}</p>{action && <button className="button button-secondary" onClick={onAction}>{action} <ArrowRight size={15} /></button>}</div>;
}

function VideoCard({ video, index, selected, onToggle, onOpen }: { video: RankedVideo; index: number; selected: boolean; onToggle: () => void; onOpen: () => void }) {
  const snapshot = latestSnapshot(video);
  return <article className={`video-card ${selected ? "selected" : ""}`}><div className={`video-preview preview-${index % 4}`}><button className="preview-open" onClick={onOpen} aria-label={`Inspect ${video.title}`}>{safeLink(video.thumbnail) ? <img src={video.thumbnail} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = "none"; }} /> : <div className="video-placeholder"><Film size={36} /><span>Video evidence</span></div>}<span className="preview-shade" /></button><label className="video-select"><input aria-label={`Select ${video.title}`} type="checkbox" checked={selected} onChange={onToggle} /><span><Check size={13} /></span></label><span className="platform-tag">{video.platform === "youtube" ? "YouTube" : video.platform === "tiktok" ? "TikTok" : video.platform}</span>{video.duration != null && <span className="duration-tag">{Math.floor(video.duration / 60)}:{String(Math.round(video.duration % 60)).padStart(2, "0")}</span>}<span className="rank-tag">#{index + 1} in sample</span></div><div className="video-card-content"><div className="video-creator"><span>{video.creator || "Creator unavailable"}</span>{safeLink(video.url) && <a href={video.url} target="_blank" rel="noreferrer" aria-label={`Open ${video.title}`}><ExternalLink size={13} /></a>}</div><button className="video-title" onClick={onOpen}>{video.title || "Untitled video"}</button><div className="video-metrics"><span><Eye size={13} />{compact(snapshot?.views)}<small>views</small></span><span><TrendingUp size={13} />{video.engagementRate == null ? "—" : `${(video.engagementRate * 100).toFixed(1)}%`}<small>engagement</small></span></div><p className="source-provenance">{video.growthPerHour == null ? "Recent growth unknown: collect another observation." : `${compact(video.growthPerHour)} observed views/hour between snapshots`}</p><div className="video-evidence"><span className={video.transcript ? "evidence-ready" : "evidence-missing"}><FileText size={12} />{video.transcript ? "Transcript" : "No transcript"}</span><span className={video.visualNotes ? "evidence-ready" : "evidence-missing"}><Film size={12} />{video.visualNotes ? "Visual notes" : "No visual evidence"}</span></div><div className="video-source"><span title={video.source}>{video.source}</span><span>{snapshot ? date(snapshot.observedAt) : "No metric snapshot"}</span></div><button className="inspect-button" onClick={onOpen}>Inspect evidence <ArrowRight size={14} /></button></div></article>;
}

function BriefForm({ brief, onChange }: { brief: Brief; onChange: (next: Brief) => void }) {
  return <div className="brief-fields"><label>Delivery<select value={brief.deliveryStyle || "direct-teaching"} onChange={event => onChange({ ...brief, deliveryStyle: event.target.value as Brief["deliveryStyle"] })}><option value="direct-teaching">Direct, concise teaching</option><option value="story-led">Clear story and payoff</option><option value="reflective">Reflective and thoughtful</option></select></label><p className="small-note">Use your voice and knowledge. Selected creator lenses guide mechanics, not facts or imitation.</p>{([{ key: "subject", label: "Subject", placeholder: "What is this video about?" }, { key: "audience", label: "Audience", placeholder: "Who are you speaking to?" }, { key: "brand", label: "Brand or creator (optional)", placeholder: "Your brand, product, or name" }] as const).map(field => <label key={field.key}>{field.label}<input value={brief[field.key]} placeholder={field.placeholder} onChange={event => onChange({ ...brief, [field.key]: event.target.value })} maxLength={400} /></label>)}<label>What are you offering? <span className="optional">optional</span><textarea value={brief.offer} rows={3} placeholder="A clear benefit, what it does, and facts the script can use." onChange={event => onChange({ ...brief, offer: event.target.value })} maxLength={2000} /></label><label>Voice & tone<select value={brief.tone} onChange={event => onChange({ ...brief, tone: event.target.value })}><option>Curious and conversational</option><option>Warm and relatable</option><option>Confident and educational</option><option>Playful and surprising</option><option>Calm and thoughtful</option></select></label><label>Call to action <span className="optional">optional</span><input value={brief.cta} placeholder="What should the viewer do next?" onChange={event => onChange({ ...brief, cta: event.target.value })} maxLength={400} /></label><div className="field-pair"><label>Duration<input type="number" min={10} max={180} step={1} value={brief.duration} onChange={event => onChange({ ...brief, duration: Number(event.target.value) })} /></label><label>Variations<select value={brief.count} onChange={event => onChange({ ...brief, count: Number(event.target.value) })}><option value={1}>1 script</option><option value={3}>3 scripts</option><option value={5}>5 scripts</option></select></label></div></div>;
}

function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (input: unknown) => void }) {
  const [mode, setMode] = useState<"manual" | "json">("manual");
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [values, setValues] = useState({ url: "", title: "", creator: "", views: "", likes: "", comments: "", shares: "", transcript: "" });
  const input = useRef<HTMLInputElement>(null);
  const submit = () => {
    try {
      if (mode === "json") onImport(JSON.parse(raw));
      else {
        if (!/^https?:\/\//i.test(values.url)) throw new Error("Enter a complete video URL beginning with https://.");
        if (!values.title.trim()) throw new Error("Add a title so you can identify this video.");
        const metrics = Object.fromEntries((["views", "likes", "comments", "shares"] as const).map(key => { const parsed = values[key] === "" ? null : Number(values[key]); if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) throw new Error("Metrics must be positive numbers or blank."); return [key, parsed]; }));
        onImport([{ ...values, ...metrics, source: "Manually imported research", fetchedAt: new Date().toISOString(), transcriptSource: values.transcript ? "User-provided transcript" : undefined, snapshots: [{ ...metrics, source: "User-provided metrics", observedAt: new Date().toISOString() }] }]);
      }
    } catch (cause) { setError(message(cause)); }
  };
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="modal-head"><span className="stat-icon cyan"><Upload size={20} /></span><div><h2 id="import-title">Bring your research.</h2><p>Add real videos and the evidence you have.</p></div><button className="icon-button" aria-label="Close import" onClick={onClose}><X size={20} /></button></div><div className="segmented-control"><button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}><Plus size={15} /> Add a video</button><button className={mode === "json" ? "active" : ""} onClick={() => setMode("json")}><FileJson size={15} /> Import JSON</button></div>{error && <div className="inline-error" role="alert">{error}</div>}{mode === "manual" ? <div className="form-fields"><label>Video URL<input autoFocus placeholder="https://www.tiktok.com/@creator/video/…" value={values.url} onChange={event => setValues({ ...values, url: event.target.value })} /></label><div className="field-pair"><label>Title<input placeholder="A memorable video title" value={values.title} onChange={event => setValues({ ...values, title: event.target.value })} /></label><label>Creator<input placeholder="@creator" value={values.creator} onChange={event => setValues({ ...values, creator: event.target.value })} /></label></div><div className="metric-form">{(["views", "likes", "comments", "shares"] as const).map(key => <label key={key}>{key}<input type="number" min={0} step={1} placeholder="Unavailable" value={values[key]} onChange={event => setValues({ ...values, [key]: event.target.value })} /></label>)}</div><p className="field-help">Leave unavailable metrics blank. They are saved as missing, not zero.</p><label>Transcript <span className="optional">optional</span><textarea rows={4} placeholder="Paste what is actually said in the video…" value={values.transcript} onChange={event => setValues({ ...values, transcript: event.target.value })} /></label></div> : <div className="form-fields"><p>Paste a JSON array of video records. Each record needs a video URL; title, creator, metrics, and transcript can be included.</p><textarea className="json-input" rows={11} aria-label="Video JSON" value={raw} onChange={event => setRaw(event.target.value)} placeholder={'[\n  {\n    "url": "https://…",\n    "title": "Video title",\n    "views": 12000,\n    "transcript": "Actual spoken words…"\n  }\n]'} /><button className="button button-secondary" onClick={() => input.current?.click()}><Upload size={15} /> Choose JSON file</button><input ref={input} hidden type="file" accept=".json,application/json" onChange={async event => { const file = event.target.files?.[0]; if (file) { if (file.size > 10 * 1024 * 1024) setError("Choose a JSON file smaller than 10 MB."); else setRaw(await file.text()); } }} /></div>}<div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" onClick={submit}><Plus size={16} />{mode === "manual" ? "Add video" : "Import collection"}</button></div></section></div>;
}

function EvidenceDrawer({ video, busy, queued, onClose, onSave, onTranscribe, onInspect, onRemove }: { video: Video; busy: string; queued: boolean; onClose: () => void; onSave: (patch: Partial<Video>) => void; onTranscribe: () => void; onInspect: (file: File) => void; onRemove: () => void }) {
  const [transcript, setTranscript] = useState(video.transcript || "");
  const [visualNotes, setVisualNotes] = useState(video.visualNotes || "");
  const [onScreenText, setOnScreenText] = useState(video.onScreenText || "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setTranscript(video.transcript || ""); setVisualNotes(video.visualNotes || ""); setOnScreenText(video.onScreenText || ""); }, [video.transcript, video.visualNotes, video.onScreenText]);
  useEffect(() => { const listener = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, [onClose]);
  return <div className="drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="evidence-title"><div className="drawer-head"><div><span className="intro-label">Source evidence</span><h2 id="evidence-title">{video.title}</h2></div><button className="icon-button" aria-label="Close evidence" onClick={onClose}><X size={22} /></button></div><div className="drawer-content"><div className="source-detail"><span className="platform-pill">{video.platform}</span><span>{video.creator || "Creator unavailable"}</span><a href={safeLink(video.url)} target="_blank" rel="noreferrer">Open source <ExternalLink size={13} /></a></div><p className="source-provenance">Source: {video.source}<br />Fetched: {new Date(video.fetchedAt).toLocaleString()}</p><div className="drawer-section"><div className="section-title"><h3><FileText size={17} /> Spoken transcript</h3><button className="button button-secondary button-small" disabled={Boolean(busy) || queued} onClick={onTranscribe}>{queued || busy === `transcript:${video.id}` ? <LoaderCircle size={14} className="spin" /> : <AudioLines size={14} />}{queued ? "Processing…" : "Fetch transcript"}</button></div><p className="field-help">Paste the video's spoken words, or request a transcript from the configured service.</p><textarea rows={10} value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="No transcript yet. Metadata alone cannot tell us what was said." /><small className="source-provenance">{video.transcriptSource || "A pasted transcript will be labeled user-provided."}</small></div><div className="drawer-section"><div className="section-title"><h3><Film size={17} /> Visual evidence</h3><button className="button button-secondary button-small" disabled={Boolean(busy)} onClick={() => input.current?.click()}>{busy === `inspect:${video.id}` ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />} Inspect local video</button></div><input ref={input} type="file" accept="video/*" hidden onChange={event => { const file = event.target.files?.[0]; if (file) onInspect(file); event.target.value = ""; }} /><p className="field-help">Samples the opening 0–3 seconds and up to 8 later frames. Images go to your configured AI provider. Only text notes are saved.</p><label>Visual notes<textarea rows={5} placeholder="Describe the actual cuts, visual hook, framing, and pacing…" value={visualNotes} onChange={event => setVisualNotes(event.target.value)} /></label><label>On-screen text<textarea rows={4} placeholder="The text actually visible in the video…" value={onScreenText} onChange={event => setOnScreenText(event.target.value)} /></label></div><div className="drawer-section"><h3>Metric snapshots</h3>{video.snapshots.length ? <div className="table-scroll"><table><thead><tr><th>Observed</th><th>Views</th><th>Likes</th><th>Shares</th></tr></thead><tbody>{video.snapshots.map((snapshot, index) => <tr key={index}><td>{date(snapshot.observedAt)}</td><td>{compact(snapshot.views)}</td><td>{compact(snapshot.likes)}</td><td>{compact(snapshot.shares)}</td></tr>)}</tbody></table></div> : <p className="field-help">No performance metrics available.</p>}</div></div><div className="drawer-actions"><button className="text-button danger" onClick={onRemove}>Remove video</button><button className="button button-primary" onClick={() => onSave({ transcript, transcriptSource: transcript !== (video.transcript || "") ? "User-provided transcript" : video.transcriptSource, visualNotes, onScreenText })}><Check size={16} /> Save evidence</button></div></section></div>;
}

function OutcomeTracker({ outcomes, titles, onSave, onNotice }: { outcomes: Outcome[]; titles: string[]; onSave: (outcome: Outcome) => void; onNotice: (text: string) => void }) {
  const [form, setForm] = useState(() => ({ scriptTitle: "", url: "", publishedAt: utahInputValue(), views: "", likes: "", comments: "", shares: "", notes: "" }));
  const [error, setError] = useState("");
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    try {
      if (!form.scriptTitle.trim() || !/^https?:\/\//i.test(form.url)) throw new Error("Add a script title and complete published-video URL.");
      const metrics = Object.fromEntries((["views", "likes", "comments", "shares"] as const).map(key => { const value = form[key] === "" ? null : Number(form[key]); if (value !== null && (!Number.isInteger(value) || value < 0)) throw new Error("Enter whole positive numbers, or leave unavailable metrics blank."); return [key, value]; })) as Pick<MetricSnapshot, "views" | "likes" | "comments" | "shares">;
      if (Object.values(metrics).every(value => value === null)) throw new Error("Record at least one observed performance metric.");
      const existing = outcomes.find(item => item.url === form.url.trim() && item.scriptTitle === form.scriptTitle.trim());
      if (!existing && outcomes.length >= 500) throw new Error("This project has 500 published videos. Export a backup and start another project to record more.");
      if (existing && existing.snapshots.length >= 100) throw new Error("This video has 100 observations. Export a backup before recording further observations in another project.");
      if (!existing && !form.publishedAt) throw new Error("Add the publication date for this new outcome.");
      const parts = form.publishedAt.split(/[-T:]/).map(Number);
      const published = existing ? new Date(existing.publishedAt) : utahWallTimeToUtc(parts[0], parts[1], parts[2], parts[3], parts[4]);
      if (!Number.isFinite(+published) || +published > Date.now()) throw new Error("Publication must be a valid date and time in the past. Enter the actual Utah local posting time.");
      if (!existing && utahInputValue(published) !== form.publishedAt) throw new Error("That Utah time does not exist during the daylight saving clock change. Use the actual posting time.");
      onSave({ id: uid(), scriptTitle: form.scriptTitle.trim(), url: form.url.trim(), publishedAt: published.toISOString(), snapshots: [{ ...metrics, observedAt: new Date().toISOString(), source: "User-recorded actual performance" }], notes: form.notes });
      onNotice(existing ? "New observation appended to this published video's history." : "Actual performance recorded. Add another observation later to see change.");
      setForm({ ...form, views: "", likes: "", comments: "", shares: "" });
    } catch (cause) { setError(message(cause)); }
  };
  return <form className="outcome-form" onSubmit={submit}><div className="panel-heading"><span className="stat-icon cyan"><TrendingUp size={19} /></span><div><h3>Record an observation</h3><p>Use the same title and URL to append a new snapshot.</p></div></div>{error && <div className="inline-error" role="alert">{error}</div>}<div className="outcome-fields"><label>Script title<input value={form.scriptTitle} list="script-titles" placeholder="Which script did you publish?" onChange={event => setForm({ ...form, scriptTitle: event.target.value })} /><datalist id="script-titles">{[...new Set([...titles, ...outcomes.map(item => item.scriptTitle)])].map(title => <option value={title} key={title} />)}</datalist></label><label>Published video URL<input type="url" placeholder="https://…" value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} /></label><label>Published (Utah time)<input type="datetime-local" value={form.publishedAt} onChange={event => setForm({ ...form, publishedAt: event.target.value })} /></label></div><div className="metric-form">{(["views", "likes", "comments", "shares"] as const).map(key => <label key={key}>{key}<input type="number" min={0} step={1} placeholder="Unavailable" value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}</div><label>Notes <span className="optional">optional</span><textarea rows={2} placeholder="What changed? What did you learn?" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label><div className="outcome-form-foot"><span>Observed now. Publication uses America/Denver local time. Blank metrics remain unavailable.</span><button type="submit" className="button button-dark"><Plus size={16} /> Record observation</button></div></form>;
}

function Connections({ status, onRefresh }: { status: ServiceStatus | null; onRefresh: () => void }) {
  const items = [{ name: "Creative analysis & scripts", description: "AI analysis, visual inspection, and original script generation.", ready: status?.ai, env: "OPENROUTER_API_KEY · OPENROUTER_MODEL", icon: Sparkles }, { name: "TikTok discovery", description: "Subject searches and source-reported video metrics through Apify.", ready: status?.tiktok, env: "APIFY_API_TOKEN · APIFY_TIKTOK_ACTOR · APIFY_MAX_CHARGE_USD", icon: Search }, { name: "YouTube discovery", description: "Search public videos with the YouTube Data API.", ready: status?.youtube, env: "YOUTUBE_API_KEY", icon: Film }, { name: "Video transcription", description: "Extract speech from a supported public media URL.", ready: status?.transcripts, env: "SUPADATA_API_KEY", icon: AudioLines }];
  return <><div className="connections-head"><h2>Server connections</h2><button className="button button-secondary button-small" onClick={onRefresh}>Refresh status</button></div><div className="connections-list">{items.map(item => <article key={item.name} className="connection-card"><span className="connection-icon"><item.icon size={23} /></span><div><h3>{item.name}</h3><p>{item.description}</p><code>{item.env}</code></div><span className={`connection-status ${item.ready ? "connected" : ""}`}><span />{status ? item.ready ? "Configured" : "Not configured" : "Checking…"}</span></article>)}</div><p className="small-note">Configure environment variables on the server and restart the app. No provider secrets are entered or displayed here.</p></>;
}

function LoginGate({ onLogin, busy, error }: { onLogin: (password: string) => Promise<void>; busy: boolean; error: string }) {
  const [password, setPassword] = useState("");
  return <div className="login-backdrop"><form className="login-card" onSubmit={event => { event.preventDefault(); void onLogin(password); }}><span className="login-mark"><AudioLines size={32} /></span><h1>Your research starts here.</h1><p>Enter your workspace password to use the connected research and creative tools.</p><label>Workspace password<input type="password" autoFocus autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>{error && <div className="inline-error" role="alert">{error}</div>}<button className="button button-primary full-width" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <LockKeyhole size={17} />} Open workspace</button><small>TIKY TOKY · Your private creative research studio</small></form></div>;
}
