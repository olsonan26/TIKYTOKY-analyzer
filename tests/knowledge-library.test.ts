import assert from "node:assert/strict";
import test from "node:test";
import { selectKnowledge, assertLibraryCitations, KNOWLEDGE_CONTEXT_CHARS } from "../src/lib/knowledge-library";
import { parseSavedProject } from "../src/lib/client-media";
import type { KnowledgeDocument, ScriptBatch } from "../src/lib/types";
const doc:KnowledgeDocument={id:"book",name:"2001 page software test",text:"Background material. ".repeat(260000)+"\n[Page 2001]\nQuartzBeacon calibration uses exactly seven reference markers.",uploadedAt:new Date().toISOString(),pageCount:2001};
test("retrieval searches beyond five million characters and preserves exact late-page source text",()=>{
 const selected=selectKnowledge([doc],"QuartzBeacon calibration reference markers");
 assert.ok(selected[0].text.includes("QuartzBeacon calibration uses exactly seven reference markers."));
 assert.ok(selected.reduce((n,d)=>n+d.text.length,0)<=KNOWLEDGE_CONTEXT_CHARS);
 assert.equal(selected[0].id,doc.id);
 assert.equal(doc.text.length>5_000_000,true);
 assert.equal(doc.pageCount,2001);
});
test("large knowledge survives project backup parsing without truncation",()=>{
 const now=new Date().toISOString();
 const restored=parseSavedProject({id:"test",subject:"validation",videos:[],outcomes:[],knowledge:[doc],createdAt:now,updatedAt:now});
 assert.equal(restored.knowledge?.[0].text,doc.text);
 assert.equal(restored.knowledge?.[0].pageCount,2001);
});
test("citation validation rejects invented or stitched quotes against the original full book",()=>{
 const batch=(quote:string)=>({scripts:[{knowledgeCitations:[{documentId:"book",quote,supports:"software test"}]}]} as ScriptBatch);
 assert.doesNotThrow(()=>assertLibraryCitations(batch("QuartzBeacon calibration uses exactly seven reference markers."),[doc]));
 assert.throws(()=>assertLibraryCitations(batch("QuartzBeacon calibration uses eight reference markers."),[doc]));
 assert.throws(()=>assertLibraryCitations(batch("Background material. QuartzBeacon calibration"),[doc]));
});
