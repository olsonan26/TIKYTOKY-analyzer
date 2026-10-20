import "server-only";
import { randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { HttpError } from "./auth";
import type { KnowledgeDocument } from "./types";

export const MAX_KNOWLEDGE_REQUEST_BYTES = 3_000_000;
export const MAX_KNOWLEDGE_FILE_BYTES = 2_500_000;
export const MAX_KNOWLEDGE_TEXT_CHARS = 50_000;
const MAX_DOCX_UNPACKED_BYTES = 10_000_000;
const EXTENSIONS = new Set(["txt", "md", "json", "pdf", "docx"]);
type UploadFile = Pick<File, "name" | "type" | "size" | "arrayBuffer">;

function documentName(name: string): string {
  const cleaned = name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() || "Knowledge document";
  return cleaned.slice(0, 160);
}
function extension(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (!EXTENSIONS.has(ext)) throw new HttpError(415, "Upload a .txt, .md, .json, searchable .pdf, or .docx file.");
  return ext;
}
function cleanText(text: string, isPdf = false): string {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new HttpError(422, isPdf ? "This PDF has no searchable text. Use a text-based PDF or paste its text; scanned pages need OCR first." : "This document contains no usable text. Add your specific knowledge and try again.");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(normalized)) throw new HttpError(422, "This document contains binary or unsupported control characters. Save it as UTF-8 text and try again.");
  if (normalized.length > MAX_KNOWLEDGE_TEXT_CHARS) throw new HttpError(413, "This document contains more than 50,000 characters. Split it into smaller knowledge documents.");
  return normalized;
}

/** Validate the archive and its expansion, returning only the main document XML. */
function docxXml(buffer: Buffer): string {
  const fail = () => { throw new HttpError(422, "This DOCX could not be read safely. Export a new .docx or upload its text instead."); };
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) fail();
  let end = -1;
  for (let position = buffer.length - 22; position >= Math.max(0, buffer.length - 65_557); position--) {
    if (buffer.readUInt32LE(position) === 0x06054b50 && position + 22 + buffer.readUInt16LE(position + 20) === buffer.length) { end = position; break; }
  }
  if (end < 0) fail();
  const entries = buffer.readUInt16LE(end + 10);
  const directoryLength = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || entries !== buffer.readUInt16LE(end + 8) || entries < 1 || entries > 512 || directoryOffset + directoryLength !== end) fail();
  let cursor = directoryOffset;
  let expanded = 0;
  let documentXml = "";
  const names = new Set<string>();
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) fail();
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const packedSize = buffer.readUInt32LE(cursor + 20);
    const unpackedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 1 || ![0, 8].includes(method) || unpackedSize > MAX_DOCX_UNPACKED_BYTES || localOffset + 30 > directoryOffset) fail();
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (!name || name.includes("\0") || name.includes("\\") || name.startsWith("/") || name.split("/").includes("..") || names.has(name)) fail();
    names.add(name);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50 || buffer.readUInt16LE(localOffset + 8) !== method) fail();
    const dataOffset = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (dataOffset + packedSize > directoryOffset || dataOffset < localOffset) fail();
    const packed = buffer.subarray(dataOffset, dataOffset + packedSize);
    let actual: Buffer = Buffer.alloc(0);
    try {
      actual = method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: MAX_DOCX_UNPACKED_BYTES });
    } catch { fail(); }
    const actualSize = actual.length;
    expanded += actualSize;
    if (actualSize !== unpackedSize || expanded > MAX_DOCX_UNPACKED_BYTES) fail();
    if (name === "word/document.xml") {
      if (actualSize > 2_000_000) fail();
      try { documentXml = new TextDecoder("utf-8", { fatal: true }).decode(actual); }
      catch { fail(); }
    }
    cursor = next;
  }
  if (cursor !== end || !names.has("[Content_Types].xml") || !documentXml) fail();
  return documentXml;
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const xml = docxXml(buffer);
  // Never resolve declared entities, external files, relationships, images, or embedded objects.
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml) || (xml.match(/</g)?.length ?? 0) > 50_000) throw new HttpError(422, "This DOCX contains unsupported XML. Export a plain .docx or upload its text instead.");
  const { DOMParser } = await import("@xmldom/xmldom");
  const fail = () => { throw new Error("invalid XML"); };
  const document = new DOMParser({ onError: fail }).parseFromString(xml, "application/xml");
  const namespaces = new Set(["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"]);
  if (!document.documentElement || document.documentElement.localName !== "document" || !namespaces.has(document.documentElement.namespaceURI || "")) throw new Error("invalid DOCX document");
  const pieces: string[] = [];
  type XmlNode = { nodeType: number; namespaceURI?: string | null; localName?: string | null; textContent?: string | null; lastChild: XmlNode | null; previousSibling: XmlNode | null };
  const queue: Array<{ node: XmlNode; depth: number; closing?: boolean }> = [{ node: document as unknown as XmlNode, depth: 0 }];
  let visited = 0;
  while (queue.length) {
    const { node, depth, closing } = queue.pop()!;
    if (++visited > 100_000 || depth > 128) throw new Error("DOCX structure too large");
    const element = node;
    const wordElement = element.nodeType === 1 && namespaces.has(element.namespaceURI || "");
    if (closing) {
      if (wordElement && element.localName === "p") pieces.push("\n\n");
      else if (wordElement && element.localName === "tc") pieces.push("\t");
      continue;
    }
    if (wordElement && element.localName === "t") { pieces.push(element.textContent || ""); continue; }
    if (wordElement && element.localName === "tab") { pieces.push("\t"); continue; }
    if (wordElement && (element.localName === "br" || element.localName === "cr")) { pieces.push("\n"); continue; }
    // Ignore deleted revisions, field code instructions, and embedded drawings.
    if (wordElement && ["del", "instrText", "drawing", "pict", "object"].includes(element.localName || "")) continue;
    queue.push({ node, depth, closing: true });
    for (let child = node.lastChild; child; child = child.previousSibling) queue.push({ node: child, depth: depth + 1 });
  }
  return pieces.join("");
}

export async function extractKnowledge(file: UploadFile): Promise<KnowledgeDocument> {
  if (!Number.isFinite(file.size) || file.size <= 0) throw new HttpError(400, "Choose a non-empty knowledge file.");
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) throw new HttpError(413, "Keep each knowledge file under 2.5 MB.");
  const name = documentName(file.name);
  const ext = extension(file.name);
  let buffer: Buffer;
  try { buffer = Buffer.from(await file.arrayBuffer()); }
  catch { throw new HttpError(400, "The knowledge file could not be read. Choose the file and try again."); }
  if (buffer.length > MAX_KNOWLEDGE_FILE_BYTES || buffer.length !== file.size) throw new HttpError(413, "Keep each knowledge file under 2.5 MB.");
  let text: string;
  if (ext === "pdf") {
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new HttpError(422, "This file is not a readable PDF. Export a searchable PDF or upload its text instead.");
    try {
      const { extractText } = await import("unpdf");
      const result = await extractText(new Uint8Array(buffer), { mergePages: true });
      if (result.totalPages > 200) throw new HttpError(413, "This PDF has more than 200 pages. Upload a shorter knowledge document.");
      text = result.text;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(422, "This PDF could not be read. Use an unencrypted searchable PDF or paste its text instead.");
    }
  } else if (ext === "docx") {
    try {
      text = await extractDocx(buffer);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(422, "This DOCX could not be read. Export a new .docx or upload its text instead.");
    }
  } else {
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch { throw new HttpError(422, "Save this document as UTF-8 text and upload it again."); }
    if (ext === "json") {
      // Preserve the source hierarchy; do not evaluate or follow any document instructions.
      let data: unknown;
      try { data = JSON.parse(text.replace(/^\uFEFF/, "")); }
      catch { throw new HttpError(422, "This JSON file is invalid. Check its JSON syntax and try again."); }
      if (data === null || data === "" || (typeof data === "object" && Object.keys(data).length === 0)) throw new HttpError(422, "This JSON document contains no usable knowledge. Add your factual content and try again.");
      text = JSON.stringify(data, null, 2);
    }
  }
  return { id: randomUUID(), name, text: cleanText(text, ext === "pdf"), uploadedAt: new Date().toISOString() };
}

/** Bound the incoming stream before the multipart parser allocates its file objects. */
export async function readKnowledgeUpload(request: Request): Promise<File> {
  const contentType = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType) || contentType.length > 1024) throw new HttpError(415, "Upload a file using multipart form data.");
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_KNOWLEDGE_REQUEST_BYTES) throw new HttpError(413, "This upload request is too large. Keep the file under 2.5 MB.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Choose a knowledge file to upload.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_KNOWLEDGE_REQUEST_BYTES) {
        try { await reader.cancel(); } catch { /* Preserve the locally constructed size error. */ }
        throw new HttpError(413, "This upload request is too large. Keep the file under 2.5 MB.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "The upload was interrupted. Choose the file and try again.");
  } finally { reader.releaseLock(); }
  let form: FormData;
  try {
    form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: Buffer.concat(chunks) }).formData();
  } catch { throw new HttpError(400, "The upload could not be read. Choose a file and try again."); }
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0][0] !== "file" || typeof entries[0][1] === "string") throw new HttpError(400, "Upload exactly one knowledge file at a time using the file field.");
  const file = entries[0][1];
  if (!file.size || file.size > MAX_KNOWLEDGE_FILE_BYTES) throw new HttpError(file.size ? 413 : 400, file.size ? "Keep each knowledge file under 2.5 MB." : "Choose a non-empty knowledge file.");
  extension(file.name);
  return file;
}
