"use client";

import { useRef, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, Check, CircleHelp, Clock3, ExternalLink, FileText, Film, LoaderCircle, Plus, ShieldCheck, Sparkles, Target, Upload, X } from "lucide-react";
import type { Coaching, GrowthPlan, KnowledgeDocument, Outcome, Video } from "@/lib/types";
import { captureVideoFrames } from "@/lib/client-media";

const describe = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" }, body: body instanceof FormData ? body : JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result as T;
}
function Placeholder({ icon: Icon, title, text }: { icon: typeof Target; title: string; text: string }) {
  return <div className="empty-state"><span className="empty-state-icon"><Icon size={31} /></span><h3>{title}</h3><p>{text}</p></div>;
}

export function KnowledgeLibrary({ documents, onChange }: { documents: KnowledgeDocument[]; onChange: (documents: KnowledgeDocument[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const characters = documents.reduce((total, document) => total + document.text.length, 0);
  const upload = async (file: File) => {
    setBusy(true); setError("");
    try {
      if (documents.length >= 20) throw new Error("Keep at most 20 knowledge documents per project.");
      if (file.size > 2_500_000) throw new Error("Choose a document smaller than 2.5 MB.");
      const data = new FormData(); data.set("file", file);
      const result = await request<{ document: KnowledgeDocument }>("/api/knowledge", data);
      if (characters + result.document.text.length > 100000) throw new Error("This document exceeds the 100,000-character project knowledge limit. Remove or shorten an existing document first.");
      onChange([...documents, result.document]);
    } catch (cause) { setError(describe(cause)); } finally { setBusy(false); }
  };
  return <><div className="knowledge-intro"><BookOpen size={26} /><div><h3>Your content is the source of truth.</h3><p>Scripts use these documents for factual claims. Viral examples contribute creative structure, hooks, and pacing.</p></div></div>{error && <div className="inline-error" role="alert">{error}</div>}<div className="knowledge-layout"><section className="knowledge-upload"><input ref={input} type="file" hidden accept=".txt,.md,.json,.pdf,.docx" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /><button className="upload-zone" disabled={busy} onClick={() => input.current?.click()}>{busy ? <LoaderCircle size={28} className="spin" /> : <Upload size={28} />}<strong>{busy ? "Extracting document text…" : "Upload your knowledge"}</strong><span>Guides, product facts, lessons, research, or your own writing.</span><small>TXT, Markdown, JSON, PDF, or DOCX</small></button><p className="knowledge-budget">{characters.toLocaleString()} / 100,000 characters · {documents.length} / 20 documents</p><p className="small-note">Document text is extracted on this app's server and saved in this browser. Selected text is sent to your configured AI provider when scripts are generated. Files are not publicly published.</p><details className="add-note"><summary>Or add a knowledge note <Plus size={14} /></summary><label>Document title<input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. My product facts" maxLength={200} /></label><label>Knowledge text<textarea rows={7} value={note} onChange={event => setNote(event.target.value)} placeholder="Paste source material you want scripts to follow…" maxLength={50000} /></label><button className="button button-secondary" disabled={busy || note.trim().length < 20 || !name.trim() || documents.length >= 20 || characters + note.trim().length > 100000} onClick={() => { onChange([...documents, { id: crypto.randomUUID(), name: name.trim(), text: note.trim(), uploadedAt: new Date().toISOString() }]); setName(""); setNote(""); }}><Plus size={15} /> Add note</button></details></section><section className="knowledge-documents"><div className="section-title"><h2>Your source library <span className="count-badge">{documents.length}</span></h2></div>{documents.length ? documents.map(document => <article className="knowledge-document" key={document.id}><div className="knowledge-document-head"><span className="stat-icon blue"><FileText size={18} /></span><div><h3>{document.name}</h3><small>{document.text.length.toLocaleString()} characters · {new Date(document.uploadedAt).toLocaleDateString()}</small></div><button className="icon-button" aria-label={`Remove ${document.name}`} disabled={busy} onClick={() => onChange(documents.filter(item => item.id !== document.id))}><X size={16} /></button></div><details><summary>Review extracted text <ArrowRight size={13} /></summary><pre>{document.text}</pre></details></article>) : <Placeholder icon={BookOpen} title="Build on what you know." text="Add a source document or paste a knowledge note. Factual script claims will cite your material so you can verify them." />}</section></div></>;
}

export function VideoCoach({ draft, coaching, benchmarks, subject, onDraft, onCoaching, onChooseReferences }: { draft?: Video; coaching?: Coaching; benchmarks: Video[]; subject: string; onDraft: (draft: Video) => void; onCoaching: (coaching: Coaching) => void; onChooseReferences: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");
  const currentInput = useRef("");
  currentInput.current = JSON.stringify({ draft, benchmarks, subject });
  const makeDraft = (): Video => draft || { id: `draft-${crypto.randomUUID()}`, url: "", title: "My draft video", creator: "You", platform: "other", publishedAt: null, duration: null, followers: null, snapshots: [], source: "User-provided draft", fetchedAt: new Date().toISOString() };
  const update = (patch: Partial<Video>) => onDraft({ ...makeDraft(), ...patch, frames: undefined });
  const inspect = async (file: File) => {
    setError(""); setBusy("inspect");
    try {
      const original = currentInput.current;
      const captured = await captureVideoFrames(file);
      const current = makeDraft();
      const result = await request<{ visualNotes: string; onScreenText: string }>("/api/inspect", { video: current, frames: captured.frames });
      if (original !== currentInput.current) throw new Error("The draft changed during inspection. Your current work was kept; inspect again to update it.");
      onDraft({ ...current, ...result, duration: captured.duration, source: "Local draft with AI-inspected frame evidence", frames: undefined });
      setFilename(file.name);
    } catch (cause) { setError(describe(cause)); } finally { setBusy(""); }
  };
  const compare = async () => {
    setError(""); setBusy("coach");
    try {
      if (!subject.trim()) throw new Error("Choose a subject in Video research first.");
      if (!draft || !(draft.transcript?.trim() || draft.visualNotes?.trim() || draft.onScreenText?.trim())) throw new Error("Add a transcript or inspect your draft video before comparison.");
      if (!benchmarks.length) throw new Error("Select reference videos in Video research first.");
      const original = currentInput.current;
      const result = await request<Coaching>("/api/coach", { subject, draft, benchmarks: benchmarks.slice(0, 10) });
      if (original !== currentInput.current) throw new Error("The draft or reference selection changed during comparison. Run comparison again to use the current evidence.");
      onCoaching(result);
    } catch (cause) { setError(describe(cause)); } finally { setBusy(""); }
  };
  return <>{error && <div className="inline-error" role="alert">{error}</div>}<div className="coach-layout"><fieldset className="coach-form" disabled={Boolean(busy)}><div className="panel-heading"><span className="stat-icon coral"><Film size={19} /></span><div><h3>Your video draft</h3><p>Start with what you actually made.</p></div></div><label>Draft title<input value={draft?.title || ""} onChange={event => update({ title: event.target.value })} placeholder="Give your video a title" maxLength={500} /></label><button className="upload-zone" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>{busy === "inspect" ? <LoaderCircle className="spin" size={25} /> : <Upload size={25} />}<span>{busy === "inspect" ? "Inspecting sampled frames…" : filename || "Upload and inspect your video"}</span><small>Local video · up to 12 sampled frames · text notes saved</small></button><input ref={fileInput} hidden type="file" accept="video/*" onChange={event => { const file = event.target.files?.[0]; if (file) void inspect(file); event.target.value = ""; }} /><label>Spoken transcript<textarea rows={7} value={draft?.transcript || ""} onChange={event => update({ transcript: event.target.value, transcriptSource: "User-provided draft transcript" })} placeholder="Paste your script or the words spoken in your draft…" maxLength={40000} /></label><label>Visual notes<textarea rows={4} value={draft?.visualNotes || ""} onChange={event => update({ visualNotes: event.target.value })} placeholder="Observed visual hook, transitions, and framing…" maxLength={10000} /></label><label>On-screen text<textarea rows={3} value={draft?.onScreenText || ""} onChange={event => update({ onScreenText: event.target.value })} placeholder="The actual text shown in your video…" maxLength={10000} /></label><div className="brief-evidence"><LayersIcon /><span>{Math.min(benchmarks.length, 10)} selected reference videos</span><button className="text-button" onClick={onChooseReferences}>Choose</button></div><button className="button button-primary full-width" disabled={Boolean(busy) || !draft || !benchmarks.length} onClick={() => void compare()}>{busy === "coach" ? <LoaderCircle size={17} className="spin" /> : <Target size={17} />} Compare & improve my video</button><p className="small-note">Your draft stays separate from the reference library. Sampled images go to the configured AI provider; the project retains only text.</p></fieldset><section className="coach-output">{coaching ? <><article><h3>Your creative review</h3><p>{coaching.verdict}</p><small className="source-provenance">{coaching.model} · {new Date(coaching.generatedAt).toLocaleDateString()}</small><h3 className="subsection-heading">Keep what works</h3><ul>{coaching.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></article><article><h3>Prioritized improvements</h3>{coaching.fixes.map((fix, index) => <div className="coach-fix" key={index}><div><span className={`priority priority-${fix.priority}`}>{fix.priority} priority</span><small>{fix.moment}</small></div><p>{fix.problem}</p><strong>Make this edit</strong><p>{fix.change}</p><div className="pattern-sources">{fix.referenceVideoIds.map(id => { const reference = benchmarks.find(item => item.id === id); return reference ? <a href={reference.url} target="_blank" rel="noreferrer" key={id}>{reference.title}<ExternalLink size={11} /></a> : <span key={id}>Reference {id}</span>; })}</div></div>)}</article><article><h3>A revised opening to try</h3><div className="revised-hook">{coaching.revisedHook}</div><h3 className="subsection-heading">Suggested cuts</h3><ul>{coaching.suggestedCuts.map((item, index) => <li key={index}>{item}</li>)}</ul></article><article><h3>Before publishing</h3><ul>{coaching.prePublishChecklist.map((item, index) => <li key={index}>{item}</li>)}</ul><h3 className="subsection-heading">A hypothesis to test</h3><p>{coaching.testHypothesis}</p><details className="coaching-limitations"><summary>Evidence limits <CircleHelp size={13} /></summary><ul>{coaching.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></details></article></> : <Placeholder icon={Target} title="Your next edit can be a more informed one." text="Add your video or transcript, select standout references, and compare the hook, structure, visuals, and CTA with the evidence available." />}</section></div><p className="guarantee-note">Creative guidance and posting plans improve your experiments. They cannot guarantee virality.</p></>;
}

function LayersIcon() { return <Sparkles size={16} />; }

export function PostingPlan({ plan, videos, outcomes, onPlan, onUseDuration }: { plan?: GrowthPlan; videos: Video[]; outcomes: Outcome[]; onPlan: (plan: GrowthPlan) => void; onUseDuration: (seconds: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const build = async () => {
    setBusy(true); setError("");
    try { onPlan(await request<GrowthPlan>("/api/plan", { videos, outcomes })); }
    catch (cause) { setError(describe(cause)); } finally { setBusy(false); }
  };
  const localTime = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
  return <><div className="plan-toolbar"><span>Utah local time · America/Denver · daylight saving aware</span><button className="button button-primary" disabled={busy} onClick={() => void build()}>{busy ? <LoaderCircle className="spin" size={16} /> : <CalendarDays size={16} />}{plan ? "Refresh posting plan" : "Build my posting plan"}</button></div>{error && <div className="inline-error" role="alert">{error}</div>}{plan ? <><div className="plan-grid"><section className="schedule-panel"><div className="section-title"><h3>Upcoming posting windows</h3><span className="confidence">{plan.timingBasis === "observed" ? "Observed results" : "Experiment to test"}</span></div><p>{plan.timingExplanation}</p>{plan.schedule.map((slot, index) => <div className="schedule-item" key={`${slot.utc}-${index}`}><span><CalendarDays size={17} /></span><div><strong>{localTime(slot.utc)}</strong><p>{slot.rationale}</p></div></div>)}</section><section className="duration-panel"><h3>A length to test</h3><div className="duration-number">{plan.duration.seconds}<small>seconds</small></div><div className="duration-range">Working range: {plan.duration.lower}–{plan.duration.upper} seconds</div><p>{plan.duration.basis}</p><small>{plan.duration.sampleSize} videos in duration sample</small><button className="button button-secondary full-width" onClick={() => onUseDuration(plan.duration.seconds)}>Use in creative brief <ArrowRight size={14} /></button></section></div><div className="plan-experiments">{plan.experiments.map((experiment, index) => <article key={index}><span className="stat-icon cyan"><Target size={18} /></span><h3>{experiment.title}</h3><p>{experiment.change}</p><small>Measure: {experiment.measure}</small></article>)}</div><div className="analysis-columns"><section className="plain-panel"><h3><Check size={18} /> Publish checklist</h3><ul>{plan.checklist.map((item, index) => <li key={index}>{item}</li>)}</ul></section><section className="plain-panel"><h3><ShieldCheck size={18} /> How to read this plan</h3><ul>{plan.caveats.map((item, index) => <li key={index}>{item}</li>)}</ul></section></div><p className="source-provenance">Plan generated {localTime(plan.generatedAt)}</p></> : <Placeholder icon={Clock3} title="Make a plan you can actually test." text="Build a Utah-time posting schedule and a duration recommendation from the reference sample and your observed results. Without outcome data, timing is an experiment." />}<p className="guarantee-note">A good schedule is a starting hypothesis. Track actual outcomes to refine your next round.</p></>;
}

export function KnowledgeCitations({ documents, citations }: { documents: KnowledgeDocument[]; citations: { documentId: string; quote: string; supports: string }[] }) {
  return <div className="knowledge-citations"><h4><BookOpen size={14} /> Knowledge behind this script</h4>{citations.map((citation, index) => <blockquote key={index}><cite>{documents.find(document => document.id === citation.documentId)?.name || citation.documentId}</cite><p>“{citation.quote}”</p><small>Supports: {citation.supports}</small></blockquote>)}</div>;
}
