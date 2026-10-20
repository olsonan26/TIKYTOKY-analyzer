"""Bounded local book extraction. No model call, OCR, or source-text execution."""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import uuid

MAX_PAGES=5000
MAX_CHARS=12_000_000
MAX_BYTES=100_000_000

def extract_book(path:Path,name:str)->dict:
    if not path.is_file() or not 0<path.stat().st_size<=MAX_BYTES:
        raise ValueError("Choose a nonempty PDF smaller than 100 MB.")
    with path.open("rb") as file:
        if file.read(5)!=b"%PDF-":raise ValueError("Choose a searchable PDF file.")
    from pypdf import PdfReader
    reader=PdfReader(path,strict=False)
    if reader.is_encrypted:raise ValueError("This PDF is encrypted. Upload an unencrypted searchable copy.")
    count=len(reader.pages)
    if count>MAX_PAGES:raise ValueError("Choose a PDF with 5,000 pages or fewer.")
    pieces=[]
    total=0
    for index,page in enumerate(reader.pages):
        text=(page.extract_text() or "").replace("\x00","")
        total+=len(text)+20
        if total>MAX_CHARS:raise ValueError("Extracted text exceeds 12 million characters. Split this book into volumes.")
        pieces.append(f"[Page {index+1}]\n{text}")
    if not any((part.split("\n",1)[1]).strip() for part in pieces):raise ValueError("This PDF has no searchable text. Scanned pages need OCR first.")
    return {"id":str(uuid.uuid4()),"name":name[:160],"text":"\n\n".join(pieces).strip(),"uploadedAt":datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),"pageCount":count,"extraction":"Local pypdf searchable-text extraction; no OCR"}

async def run_knowledge(request:dict,store,identifier:str)->dict:
    from .config import DATA_ROOT
    path=Path(request["uploadPath"]).resolve()
    if path.parent!=(DATA_ROOT/"uploads").resolve():raise ValueError("Invalid queued upload path.")
    output=path.with_suffix(".json")
    try:
        store.event(identifier,"Extracting the complete searchable PDF locally (up to 5,000 pages).")
        process=await asyncio.create_subprocess_exec(sys.executable,str(Path(__file__).resolve()),str(path),str(output),request["name"],stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.DEVNULL)
        try:
            await asyncio.wait_for(process.wait(),timeout=300)
        except (asyncio.TimeoutError,asyncio.CancelledError):
            process.kill();await process.wait();raise
        if process.returncode or not output.is_file():raise ValueError("PDF extraction failed. Use an unencrypted searchable PDF; scanned pages need OCR.")
        result=json.loads(output.read_text(encoding="utf-8"))
        if result.get("error"):return {"knowledgeError":result["error"]}
        store.event(identifier,f"Extracted {result['pageCount']} pages and {len(result['text']):,} characters without truncation.")
        return {"document":result}
    finally:
        path.unlink(missing_ok=True);output.unlink(missing_ok=True)

if __name__=="__main__":
    try:result=extract_book(Path(sys.argv[1]),sys.argv[3])
    except ValueError as error:result={"error":str(error)}
    except Exception:result={"error":"This PDF could not be read. Use an unencrypted searchable PDF; scanned pages need OCR."}
    Path(sys.argv[2]).write_text(json.dumps(result,ensure_ascii=False),encoding="utf-8")
