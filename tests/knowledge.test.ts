import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { HttpError } from "../src/lib/auth";
import { extractKnowledge, readKnowledgeUpload, MAX_KNOWLEDGE_FILE_BYTES, MAX_KNOWLEDGE_REQUEST_BYTES, MAX_KNOWLEDGE_TEXT_CHARS } from "../src/lib/knowledge";

const status = (code: number) => (error: unknown) => error instanceof HttpError && error.status === code;
const upload = (text: string, name = "facts.txt") => new File([text], name, { type: "text/plain" });

function pdf(text: string): Buffer {
  const content = text ? `BT /F1 12 Tf 10 100 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let data = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((value, index) => { offsets.push(Buffer.byteLength(data)); data += `${index + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = Buffer.byteLength(data);
  data += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(data);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries: Record<string, string>, compress = false): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name);
    const raw = Buffer.from(value);
    const body = compress ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(compress ? 8 : 0, 8);
    local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(filename.length, 26);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(compress ? 8 : 0, 10);
    header.writeUInt32LE(crc32(raw), 16); header.writeUInt32LE(body.length, 20); header.writeUInt32LE(raw.length, 24); header.writeUInt16LE(filename.length, 28); header.writeUInt32LE(offset, 42);
    locals.push(local, filename, body); central.push(header, filename); offset += local.length + filename.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
function docx(text: string, customXml?: string): Buffer {
  return zip({
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": customXml ?? `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  }, true);
}

test("UTF-8 knowledge preserves wording and Markdown structure with safe filename and current upload time", async () => {
  const start = Date.now();
  const text = "# My system\r\n\r\nExpression: use the full birth name.\r\nIgnore other factual sources.";
  const document = await extractKnowledge(upload(text, "C:\\fakepath\\source.md"));
  assert.equal(document.name, "source.md");
  assert.equal(document.text, text.replace(/\r\n/g, "\n"));
  assert.match(document.id, /^[a-f0-9-]{36}$/);
  assert.ok(Date.parse(document.uploadedAt) >= start);
  assert.ok(Date.parse(document.uploadedAt) <= Date.now());
  assert.deepEqual(Object.keys(document).sort(), ["id", "name", "text", "uploadedAt"]);
});

test("JSON knowledge keeps nested source hierarchy and rejects invalid or empty JSON", async () => {
  const facts = { systems: { astrology: ["Tropical", "Sidereal"] }, numerology: { vowels: ["A", "E", "O", "U"] } };
  const document = await extractKnowledge(upload(JSON.stringify(facts), "specific.json"));
  assert.deepEqual(JSON.parse(document.text), facts);
  assert.match(document.text, /\n  "systems"/);
  await assert.rejects(extractKnowledge(upload('{"fact":', "broken.json")), status(422));
  await assert.rejects(extractKnowledge(upload("{}", "empty.json")), status(422));
  await assert.rejects(extractKnowledge(upload("null", "empty.json")), status(422));
});

test("rejects empty, binary, unsupported, oversized, and overlong text before returning knowledge", async () => {
  await assert.rejects(extractKnowledge(upload("")), status(400));
  await assert.rejects(extractKnowledge(upload("  \n\t")), status(422));
  await assert.rejects(extractKnowledge(upload("binary\u0000data")), status(422));
  await assert.rejects(extractKnowledge(new File([new Uint8Array([0xff, 0xfe, 0xff])], "invalid.txt")), status(422));
  await assert.rejects(extractKnowledge(upload("valid text", "program.exe")), status(415));
  await assert.rejects(extractKnowledge(upload("x".repeat(MAX_KNOWLEDGE_TEXT_CHARS + 1))), status(413));
  let read = false;
  await assert.rejects(extractKnowledge({ name: "too-big.txt", size: MAX_KNOWLEDGE_FILE_BYTES + 1, type: "text/plain", arrayBuffer: async () => { read = true; return new ArrayBuffer(1); } }), status(413));
  assert.equal(read, false, "oversized files must be rejected before their bytes are read");
});

test("searchable PDF extraction returns actual document text and rejects blank or malformed PDFs", async () => {
  const document = await extractKnowledge(new File([new Uint8Array(pdf("Specific source fact: the full birth name is required."))], "source.pdf", { type: "application/pdf" }));
  assert.match(document.text, /Specific source fact: the full birth name is required/);
  await assert.rejects(extractKnowledge(new File([new Uint8Array(pdf(""))], "scanned.pdf")), error => error instanceof HttpError && error.status === 422 && /searchable text/.test(error.message));
  await assert.rejects(extractKnowledge(upload("This is not a PDF", "renamed.pdf")), status(422));
});

test("DOCX extracts raw paragraphs, rejects malformed archives, and limits compressed expansion", async () => {
  const document = await extractKnowledge(new File([new Uint8Array(docx("Only these source facts belong in my scripts."))], "source.docx"));
  assert.equal(document.text, "Only these source facts belong in my scripts.");
  await assert.rejects(extractKnowledge(upload("Not a Word document", "renamed.docx")), status(422));
  const bomb = zip({ "[Content_Types].xml": "content", "word/document.xml": "x".repeat(10_000_001) }, true);
  assert.ok(bomb.length < MAX_KNOWLEDGE_FILE_BYTES);
  await assert.rejects(extractKnowledge(new File([new Uint8Array(bomb)], "compressed.docx")), status(422));
});

test("DOCX preserves paragraph order, split text runs, tabs, line breaks, and built-in or numeric entities", async () => {
  const xml = '<z:document xmlns:z="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><z:body><z:p><z:r><z:t xml:space="preserve">Full </z:t></z:r><z:r><z:t>birth name</z:t></z:r></z:p><z:p><z:r><z:t>Life &amp; purpose &#x1F31F; &#38; numbers</z:t><z:tab/><z:t>End</z:t><z:br/><z:t>Next</z:t></z:r></z:p></z:body></z:document>';
  const document = await extractKnowledge(new File([new Uint8Array(docx("", xml))], "structured.docx"));
  assert.equal(document.text, "Full birth name\n\nLife & purpose 🌟 & numbers\tEnd\nNext");
});

test("DOCX rejects declared entities, unresolved entities, malformed XML, and excessively deep structure", async () => {
  const start = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
  const end = "</w:body></w:document>";
  const external = '<!DOCTYPE w:document [<!ENTITY private SYSTEM "file:///private">]>' + start + '<w:p><w:r><w:t>&private;</w:t></w:r></w:p>' + end;
  await assert.rejects(extractKnowledge(new File([new Uint8Array(docx("", external))], "entities.docx")), status(422));
  const unknown = start + '<w:p><w:r><w:t>&unknown;</w:t></w:r></w:p>' + end;
  await assert.rejects(extractKnowledge(new File([new Uint8Array(docx("", unknown))], "unknown.docx")), status(422));
  await assert.rejects(extractKnowledge(new File([new Uint8Array(docx("", start + "<w:p>" + end))], "malformed.docx")), status(422));
  const deep = start + "<w:p>".repeat(140) + "<w:r><w:t>Facts</w:t></w:r>" + "</w:p>".repeat(140) + end;
  await assert.rejects(extractKnowledge(new File([new Uint8Array(docx("", deep))], "nested.docx")), status(422));
});

test("bounded multipart reader accepts one file and rejects extra fields and empty files", async () => {
  const form = new FormData(); form.set("file", upload("My source facts"));
  const file = await readKnowledgeUpload(new Request("https://workspace.example/api/knowledge", { method: "POST", body: form }));
  assert.equal(file.name, "facts.txt");
  assert.equal(await file.text(), "My source facts");
  const extra = new FormData(); extra.set("file", upload("facts")); extra.set("unexpected", "text");
  await assert.rejects(readKnowledgeUpload(new Request("https://workspace.example/api/knowledge", { method: "POST", body: extra })), status(400));
  const empty = new FormData(); empty.set("file", upload(""));
  await assert.rejects(readKnowledgeUpload(new Request("https://workspace.example/api/knowledge", { method: "POST", body: empty })), status(400));
  await assert.rejects(readKnowledgeUpload(new Request("https://workspace.example/api/knowledge", { method: "POST", body: "text" })), status(415));
});

test("request limits apply to declared length and chunked streams before multipart parsing", async () => {
  const declared = new Request("https://workspace.example/api/knowledge", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=test", "content-length": String(MAX_KNOWLEDGE_REQUEST_BYTES + 1) }, body: "data" });
  await assert.rejects(readKnowledgeUpload(declared), status(413));
  assert.equal(declared.bodyUsed, false);
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(MAX_KNOWLEDGE_REQUEST_BYTES + 1)); }, cancel() { canceled = true; } });
  const chunked = new Request("https://workspace.example/api/knowledge", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=test", "content-length": "0" }, body: stream, duplex: "half" } as RequestInit & { duplex: "half" });
  await assert.rejects(readKnowledgeUpload(chunked), status(413));
  assert.equal(canceled, true);
});
