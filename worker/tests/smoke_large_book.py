"""Opt-in real 2,001-page upload, IndexedDB, full export and restore smoke.
Uses isolated browser storage and generated software validation material only.
"""
import asyncio
from datetime import datetime,timezone
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright
from dotenv import dotenv_values
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_knowledge_books import make_book
ROOT=Path(__file__).resolve().parents[2]
KEY='tiky-toky-workspace-v1'
READ="""() => new Promise((resolve,reject)=>{const o=indexedDB.open('tikytoky-workspaces',1);o.onerror=()=>reject(o.error);o.onsuccess=()=>{const db=o.result;const r=db.transaction('workspace','readonly').objectStore('workspace').get('tiky-toky-workspace-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const w=r.result;const p=w?.projects.find(p=>p.id===w.activeId);const d=p?.knowledge?.[0];resolve({id:p?.id,pages:d?.pageCount,characters:d?.text.length,tail:d?.text.slice(-100),legacy:localStorage.getItem('tiky-toky-workspace-v1')});db.close();};};})"""
async def main():
    output=ROOT/'worker/.data'/('large-book-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    output.mkdir(parents=True)
    book=output/'SOFTWARE-VALIDATION-2001-PAGES.pdf'
    make_book(book)
    url=os.getenv('DASHBOARD_URL','http://localhost:4199/')
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        context=await browser.new_context(accept_downloads=True,viewport={'width':1440,'height':1100})
        if url.startswith('https:'):await context.grant_permissions(['local-network-access'],origin=url.rstrip('/'))
        page=await context.new_page()
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        try:
            await page.goto(url,wait_until='networkidle',timeout=90000)
            if await page.get_by_label('Workspace password',exact=True).count():
                password=dotenv_values(ROOT/'.env.local').get('APP_PASSWORD') or (ROOT/'worker/.data/dashboard-password.txt').read_text().strip()
                await page.get_by_label('Workspace password',exact=True).fill(password)
                await page.get_by_role('button',name='Open workspace',exact=True).click()
            await page.get_by_label('Local access token').fill((ROOT/'worker/.data/worker-token.txt').read_text().strip())
            await page.get_by_role('button',name='Connect worker',exact=True).click()
            await page.get_by_text('Worker connected:',exact=False).wait_for(timeout=30000)
            await page.get_by_role('button',name='Your knowledge',exact=True).click()
            await page.locator('input[type="file"][accept=".txt,.md,.json,.pdf,.docx"]').set_input_files(book)
            await page.get_by_role('heading',name=book.name,exact=True).wait_for(timeout=300000)
            for _ in range(60):
                saved=await page.evaluate(READ)
                if saved.get('pages')==2001:break
                await asyncio.sleep(.5)
            assert saved['pages']==2001 and saved['characters']>5_000_000 and saved['legacy'] is None,saved
            assert saved['tail'].endswith('QuartzBeacon calibration uses exactly seven reference markers.')
            await page.reload(wait_until='networkidle')
            await page.get_by_role('button',name='Your knowledge',exact=True).click()
            await page.get_by_role('heading',name=book.name,exact=True).wait_for()
            assert (await page.evaluate(READ))==saved
            await page.get_by_text('Review extracted text',exact=False).click()
            assert len(await page.locator('.knowledge-document pre').inner_text())==15000
            async with page.expect_download() as download:
                await page.get_by_role('button',name='Download complete extracted text',exact=True).click()
            text_path=output/'complete-text.txt';await(await download.value).save_as(text_path)
            assert len(text_path.read_text(encoding='utf-8'))==saved['characters']
            async with page.expect_download() as download:
                await page.get_by_role('button',name='Export project',exact=True).click()
            backup=output/'backup.json';await(await download.value).save_as(backup)
            assert json.loads(backup.read_text(encoding='utf-8'))['project']['knowledge'][0]['text']==text_path.read_text(encoding='utf-8')
            await page.locator('input[type="file"][accept=".json,application/json"]').first.set_input_files(backup)
            await page.get_by_text('Backup restored as a separate browser-saved project.',exact=True).wait_for()
            for _ in range(60):
                restored=await page.evaluate(READ)
                if restored.get('id')!=saved['id']:break
                await asyncio.sleep(.5)
            assert restored['id']!=saved['id'] and restored['characters']==saved['characters'] and restored['tail']==saved['tail']
            await page.reload(wait_until='networkidle')
            await page.get_by_role('button',name='Your knowledge',exact=True).click()
            await page.get_by_role('heading',name=book.name,exact=True).wait_for()
            assert (await page.evaluate(READ))==restored
            assert not errors,errors
            summary={'status':'passed','dashboard':url,'pages':saved['pages'],'characters':saved['characters'],'completeLastPage':True,'indexedDbReload':True,'fullTextExport':True,'backupRestoreReload':True,'browserErrors':errors,'fixture':'Generated software validation material, no market claims'}
            (output/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
            print(json.dumps(summary),flush=True)
        except BaseException:
            await page.screenshot(path=str(output/'failure.png'),full_page=True)
            print('Evidence: '+str(output),flush=True)
            raise
        finally:await browser.close()
if __name__=='__main__':asyncio.run(main())
