"""Real searchable PDF tests; generated material is software test content only."""
from pathlib import Path
import pytest
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
from tikytoky.knowledge import extract_book


def make_book(path:Path,pages=2001):
    writer=PdfWriter()
    font=writer._add_object(DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')}))
    for number in range(1,pages+1):
        page=writer.add_blank_page(width=612,height=792)
        page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):font})})
        text='Software validation background material. '*70 if number<pages else 'QuartzBeacon calibration uses exactly seven reference markers.'
        stream=DecodedStreamObject()
        stream.set_data(f'BT /F1 8 Tf 10 780 Td ({text}) Tj ET'.encode())
        page[NameObject('/Contents')]=writer._add_object(stream.flate_encode())
    writer.write(path)


def test_real_2001_page_book_keeps_last_page_and_over_five_million_characters(tmp_path):
    path=tmp_path/'software-validation-2001-pages.pdf'
    make_book(path)
    result=extract_book(path,path.name)
    assert result['pageCount']==2001
    assert len(result['text'])>5_000_000
    assert '[Page 2001]' in result['text']
    assert result['text'].endswith('QuartzBeacon calibration uses exactly seven reference markers.')


def test_scanned_and_invalid_documents_have_actionable_errors(tmp_path):
    path=tmp_path/'scanned.pdf'
    writer=PdfWriter();writer.add_blank_page(width=612,height=792);writer.write(path)
    with pytest.raises(ValueError,match='OCR'):extract_book(path,path.name)
    path.write_bytes(b'not a PDF')
    with pytest.raises(ValueError,match='searchable PDF'):extract_book(path,path.name)

def test_knowledge_upload_auth_limits_and_cancel_cleanup(tmp_path,monkeypatch):
    from fastapi.testclient import TestClient
    from tikytoky import server
    from tikytoky.store import JobStore
    monkeypatch.setattr(server,'store',JobStore(tmp_path/'jobs.sqlite'))
    monkeypatch.setattr(server,'DATA_ROOT',tmp_path)
    client=TestClient(server.app)
    headers={'Authorization':f'Bearer {server.TOKEN}'}
    assert client.post('/v1/knowledge',content=b'private').status_code==401
    assert client.post('/v1/knowledge',headers={**headers,'Content-Length':'100000001'},content=b'x').status_code==413
    assert client.post('/v1/knowledge?name=book.exe',headers=headers,content=b'x').status_code==415
    assert client.post('/v1/knowledge',headers=headers,content=b'').status_code==400
    job=client.post('/v1/knowledge?name=book.pdf',headers=headers,content=b'%PDF-test queue fixture').json()
    path=Path(job['request']['uploadPath'])
    assert path.is_file()
    assert not client.get('/v1/jobs',headers=headers).json()['jobs']
    assert client.post(f"/v1/jobs/{job['id']}/cancel",headers=headers).json()['status']=='cancelled'
    assert not path.exists()
