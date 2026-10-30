"""Functional tests for Quick Dial NG storage logic.

Runs the extension pages in Chromium (Playwright) against a simulated Firefox
WebExtension API (test/mock.js). Usage: python3 test/test_storage.py
"""
import asyncio, json, os, shutil, sys, tempfile, threading, http.server, functools, socketserver
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
H = tempfile.mkdtemp(prefix='qdng-test-')
shutil.copytree(os.path.join(HERE, '..', 'src'), os.path.join(H, 'ext'))
for f in ('mock.js', 'index.html'): shutil.copy(os.path.join(HERE, f), H)
with open(os.path.join(H, 'ext', 'bg.html'), 'w') as f:
    f.write('<!doctype html><html><head><script>window.browser = parent.makeBrowser(window, "bg");</script><script src="js/background.js"></script></head><body></body></html>')
with open(os.path.join(H, 'ext', 'dial.html')) as f: dial = f.read()
with open(os.path.join(H, 'ext', 'dialtest.html'), 'w') as f:
    f.write(dial.replace('<script type="text/javascript" src="js/dial.js">', '<script>window.browser = parent.makeBrowser(window, "dial");</script><script type="text/javascript" src="js/dial.js">'))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=H)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
ok = True
def check(name, cond, info=''):
    global ok; ok &= bool(cond); print(('PASS ' if cond else 'FAIL ') + name, info)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        errs = []; pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{port}/index.html')
        # bookmarks: Quick Dial folder with 6 bookmarks + subfolder, and an unrelated folder
        await pg.evaluate("""() => { const m = S.bm.children[0]; S.bm.type='folder'; m.type='folder'; S.bm.children[1].type='folder';
          m.children.push({ id:'qd', type:'folder', title:'Quick Dial', children: [
            ...[1,2,3,4,5,6].map(i => ({ id:'b'+i, type:'bookmark', title:'Site '+i, url:'https://site'+i+'.example/', parentId:'qd' })),
            { id:'f1', type:'folder', title:'Folder', parentId:'qd', children:[ { id:'b7', type:'bookmark', title:'Site 7', url:'https://site7.example/', parentId:'f1' } ] } ] });
          m.children.push({ id:'other', type:'folder', title:'Other', children: [] }); }""")
        J = lambda s: pg.evaluate(s)
        # Phase A: fresh install -> defaults
        await J("loadFrame('bg', 'ext/bg.html')"); await pg.wait_for_timeout(1500)
        st = await J("Object.keys(S.storage)")
        check('A fresh install creates settings+node', set(st) >= {'version','settings','node'}, st)
        node = await J("S.storage.node"); check('A sync picked up 7 tiles', len(node['children']) == 7, len(node['children']))
        # Phase B: original Quick Dial v4 data with inline PNG screenshots
        await J("""() => { const mk = (seed) => { const c = document.createElement('canvas'); c.width = 600; c.height = 450; const x = c.getContext('2d');
            for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${(i*37+seed*91)%360},70%,${30+i%40}%)`; x.fillRect((i*53)%600, (i*29+seed)%450, 40+i%60, 20+i%30); }
            x.fillStyle = '#000'; x.font = '28px sans-serif'; for (let r = 0; r < 12; r++) x.fillText('Sample page text ' + seed + ' line ' + r, 20, 40 + r*34); return c.toDataURL('image/png'); };
          const v4 = { version: 4, settings: S.storage.settings, node: JSON.parse(JSON.stringify(S.storage.node)) };
          v4.node.children.forEach((n, i) => { if (n.type === 2) { n.image = i % 2 ? 'url(' + mk(i) + ')' : mk(i); n.imageLocked = true; } });
          v4.node.children[6].children[0].image = mk(77);
          S.storage = JSON.parse(JSON.stringify(v4)); window.v4size = JSON.stringify(v4).length; S.writes = []; S.removes = []; }""")
        await J("loadFrame('bg', 'ext/bg.html')"); await pg.wait_for_timeout(3000)
        s = await J("({ version: S.storage.version, nodeLen: JSON.stringify(S.storage.node).length, imgKeys: Object.keys(S.storage).filter(k => k.startsWith('img_')).sort(), webp: Object.keys(S.storage).filter(k => k.startsWith('img_')).every(k => S.storage[k].startsWith('data:image/webp')), total: JSON.stringify(S.storage).length, v4: window.v4size, flags: S.storage.node.children.map(n => n.image) })")
        check('B migrated to version 5', s['version'] == 5)
        check('B 7 images moved to own keys', s['imgKeys'] == ['img_b1','img_b2','img_b3','img_b4','img_b5','img_b6','img_b7'], s['imgKeys'])
        check('B images are WebP', s['webp'])
        check('B node tree no longer holds images', s['nodeLen'] < 5000, s['nodeLen'])
        print('   storage size v4 -> v5:', s['v4'], '->', s['total'], f"({s['v4']/s['total']:.1f}x smaller)")
        # Phase C: restart -> nothing written
        await J("S.writes = []; S.removes = []; loadFrame('bg', 'ext/bg.html')"); await pg.wait_for_timeout(1500)
        w = await J("S.writes"); check('C restart writes nothing', len(w) == 0, w)
        # Phase D: bookmark outside the tree is ignored, inside triggers sync
        await J("S.writes = []; document.getElementById('bg').contentWindow.browser.bookmarks.create({ parentId: 'other', title: 'X', url: 'https://x.example/' })"); await pg.wait_for_timeout(800)
        w = await J("S.writes"); check('D unrelated bookmark: no write', len(w) == 0, w)
        await J("document.getElementById('bg').contentWindow.browser.bookmarks.update('b1', { title: 'Renamed 1' })"); await pg.wait_for_timeout(800)
        w = await J("S.writes.map(x => x.k)"); t = await J("S.storage.node.children[0].title")
        check('D tracked bookmark rename saved without rewriting images', t == 'Renamed 1' and 'node' in w and not any(k.startswith('img_') for k in w), (w, t))
        # Phase E: dial page shows images for visible tiles
        await J("loadFrame('dial', 'ext/dialtest.html')"); await pg.wait_for_timeout(1500)
        d = await pg.frame_locator('#dial').locator('table.Grid a').evaluate_all("as => as.map(a => (a.className + '|' + (a.firstChild.style.backgroundImage||'').slice(0,20) + '|' + (a.lastChild.innerText||'')))")
        shown = [x for x in d if 'data:image/webp' in x]
        check('E dial shows 6 WebP tiles + folder', len(shown) == 6 and any(x.startswith('Folder|') for x in d), [x for x in d if not x.startswith('Empty')])
        # Phase F: export -> fresh profile -> import
        exp = await J("document.getElementById('bg').contentWindow.app.Backup.export()")
        check('F export has 7 images', len(exp['images']) == 7)
        await J("S.storage = {}; loadFrame('bg', 'ext/bg.html')"); await pg.wait_for_timeout(1500)
        await J(f"document.getElementById('bg').contentWindow.app.Backup.import({json.dumps(exp)})"); await pg.wait_for_timeout(1500)
        k = await J("Object.keys(S.storage).filter(k => k.startsWith('img_')).length"); check('F import restored 7 images', k == 7, k)
        # Phase G: delete tile removes its image; URL change drops image
        await J("S.removes = []; document.getElementById('bg').contentWindow.app.GridNodes.deleteNode(document.getElementById('bg').contentWindow.app.node, 'b2')"); await pg.wait_for_timeout(800)
        r = await J("S.removes"); check('G delete removes img_b2', 'img_b2' in r and 'img_b2' not in await J("Object.keys(S.storage)"), r)
        await J("document.getElementById('bg').contentWindow.browser.bookmarks.update('b3', { url: 'https://changed.example/' })"); await pg.wait_for_timeout(800)
        r = await J("({ removed: S.removes, flag: S.storage.node.children.find(n => n.id === 'b3').image })"); check('G URL change drops old image', 'img_b3' in r['removed'] and r['flag'] is None, r)
        # Phase H: removing a whole folder removes nested images
        await J("document.getElementById('bg').contentWindow.browser.bookmarks.removeTree('f1')"); await pg.wait_for_timeout(800)
        check('H folder removal drops nested img_b7', 'img_b7' not in await J("Object.keys(S.storage)"))
        print('console errors:', [e for e in errs if 'no receiver' not in e][:10])
        await b.close()
asyncio.run(main()); print('ALL PASS' if ok else 'SOME FAILED'); shutil.rmtree(H, ignore_errors=True); sys.exit(0 if ok else 1)
