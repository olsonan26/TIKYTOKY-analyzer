import { knowledgeSchema, videoSchema } from "./validation";
import type { KnowledgeDocument, Video } from "./types";
import { MAX_LIBRARY_FILE_BYTES } from "./knowledge-library";

export const WORKER_CONNECTION = "tikytoky-worker-connection";
export async function uploadKnowledgeBook(file:File,progress:(message:string)=>void):Promise<KnowledgeDocument>{
  if(!file.size || file.size>MAX_LIBRARY_FILE_BYTES)throw new Error("Choose a searchable PDF smaller than 100 MB.");
  let connection:{base:string;token:string};
  try{connection=JSON.parse(sessionStorage.getItem(WORKER_CONNECTION)||"null");if(!connection?.token)throw new Error();connection.base=workerUrl(connection.base);}
  catch{throw new Error("For large PDFs (up to 5,000 pages / 100 MB), connect your local worker in Autonomous research first, then return here and upload the book.");}
  const headers={Authorization:`Bearer ${connection.token}`};
  progress("Uploading book directly to your local worker…");
  const response=await fetch(`${connection.base}/v1/knowledge?name=${encodeURIComponent(file.name)}`,{method:"POST",headers:{...headers,"Content-Type":"application/octet-stream"},body:file,signal:AbortSignal.timeout(300000)});
  const job=await response.json();
  if(!response.ok)throw new Error(typeof job.detail==="string"?job.detail:"The worker could not accept the book.");
  const deadline=Date.now()+20*60*1000;
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,1500));
    const check=await fetch(`${connection.base}/v1/jobs/${encodeURIComponent(job.id)}`,{headers,signal:AbortSignal.timeout(60000)});
    if(!check.ok)throw new Error("The worker connection was interrupted. Reconnect and retry the book upload.");
    const current=await check.json();
    progress(current.events?.at(-1)?.message||`Book extraction: ${current.status}`);
    if(current.result?.knowledgeError)throw new Error(current.result.knowledgeError);
    if(current.status==="completed" && current.result?.document)return knowledgeSchema.parse(current.result.document);
    if(["failed","cancelled","blocked","interrupted"].includes(current.status))throw new Error(current.error||"The book could not be extracted.");
  }
  throw new Error("Book extraction took too long. Check the local worker and retry.");
}
export function workerUrl(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Use a worker base URL with no credentials, path, query or fragment.");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Use loopback HTTP on this computer, or your secure HTTPS worker endpoint.");
  return url.origin;
}

export async function studyUploadedDraft(file: File, projectId: string, progress: (message: string) => void): Promise<{video: Video; warnings: string[]}> {
  if (!file.type.startsWith("video/") || !file.size || file.size > 50_000_000) throw new Error("Choose a video smaller than 50 MB and no longer than three minutes.");
  let connection: {base: string; token: string};
  try {
    connection = JSON.parse(sessionStorage.getItem(WORKER_CONNECTION) || "null");
    if (!connection?.token) throw new Error();
    connection.base = workerUrl(connection.base);
  } catch { throw new Error("Connect your local worker in Autonomous research first, then return to upload your draft."); }
  const headers = {Authorization: `Bearer ${connection.token}`};
  progress("Uploading privately to your worker…");
  const response = await fetch(`${connection.base}/v1/media?projectId=${encodeURIComponent(projectId)}`, {method: "POST", headers: {...headers,"Content-Type": "application/octet-stream"}, body: file, signal: AbortSignal.timeout(120000)});
  const job = await response.json();
  if (!response.ok) throw new Error(typeof job.detail === "string" ? job.detail : "The worker could not accept this upload.");
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2500));
    const check = await fetch(`${connection.base}/v1/jobs/${encodeURIComponent(job.id)}`, {headers, signal: AbortSignal.timeout(20000)});
    const current = await check.json();
    if (!check.ok) throw new Error("The worker connection was interrupted. Its job is persisted and can be reopened in Autonomous research.");
    progress(current.events?.at(-1)?.message || `Local draft: ${current.status}`);
    if (current.status === "completed" && current.result?.draft) return {video: videoSchema.parse(current.result.draft), warnings: current.result.warnings || []};
    if (["failed","blocked","cancelled","interrupted"].includes(current.status)) throw new Error(current.error || "The worker could not finish studying the draft. Review its persisted job log.");
  }
  throw new Error("The draft is taking longer than expected. Its persisted worker job can be reopened in Autonomous research.");
}
