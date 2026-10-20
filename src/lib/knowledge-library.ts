import type { KnowledgeDocument, ScriptBatch } from "./types";

export const MAX_LIBRARY_DOCUMENT_CHARS = 12_000_000;
export const MAX_LIBRARY_CHARS = 60_000_000;
export const MAX_LIBRARY_FILE_BYTES = 100_000_000;
export const MAX_LIBRARY_PAGES = 5000;
export const KNOWLEDGE_CONTEXT_CHARS = 80_000;

const stop = new Set("the and for with that this from your you are was were have has not only into about how what when where which their them then than will can our its use using make create script video content knowledge document brief audience optional original software validation".split(" "));
function terms(text:string):string[]{return [...new Set((text.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(word=>!stop.has(word)))].slice(0,120);}

/** Search the entire retained library; only exact excerpts enter the bounded model context. */
export function selectKnowledge(documents:KnowledgeDocument[], query:string, budget=KNOWLEDGE_CONTEXT_CHARS):KnowledgeDocument[]{
  if(documents.reduce((sum,d)=>sum+d.text.length,0)<=budget) return documents;
  const wanted=terms(query);
  const rows:{document:number;start:number;text:string;score:number}[]=[];
  for(const [document,doc] of documents.entries()){
    for(let start=0;start<doc.text.length;start+=1800){
      const text=doc.text.slice(start,Math.min(start+2100,doc.text.length));
      const lower=text.toLocaleLowerCase();
      const score=wanted.reduce((sum,word)=>sum+(lower.includes(word)?1+Math.min(4,lower.split(word).length-1)*0.1:0),0);
      rows.push({document,start,text,score});
    }
  }
  const chosen=new Map<number,typeof rows>();
  let remaining=budget;
  // Include source introductions, then retrieve strongest matches anywhere, including final pages.
  const ordered=[...rows.filter(row=>row.start===0),...rows.filter(row=>row.start!==0).sort((a,b)=>b.score-a.score||a.start-b.start)];
  for(const row of ordered){
    if(remaining<500)break;
    const text=row.text.slice(0,remaining-2);
    const group=chosen.get(row.document)||[];
    group.push({...row,text});chosen.set(row.document,group);remaining-=text.length+2;
  }
  return documents.flatMap((doc,index)=>{
    const chunks=chosen.get(index);
    if(!chunks)return [];
    // Merge overlapping excerpts so quotations remain continuous exact source text.
    const intervals:{start:number;end:number}[]=[];
    for(const c of chunks.sort((a,b)=>a.start-b.start)){
      const previous=intervals.at(-1);
      if(previous && c.start<=previous.end) previous.end=Math.max(previous.end,c.start+c.text.length);
      else intervals.push({start:c.start,end:c.start+c.text.length});
    }
    return [{...doc,text:intervals.map(i=>doc.text.slice(i.start,i.end)).join("\n\n")}];
  });
}

export function assertLibraryCitations(batch:ScriptBatch, documents:KnowledgeDocument[]):void{
  const normalize=(s:string)=>s.replace(/\s+/gu," ").trim();
  const sources=new Map(documents.map(d=>[d.id,normalize(d.text)]));
  for(const script of batch.scripts)for(const citation of script.knowledgeCitations){
    if(!sources.get(citation.documentId)?.includes(normalize(citation.quote))) throw new Error("A quotation did not match the original full knowledge document. No scripts were saved; regenerate with a narrower subject.");
  }
}
