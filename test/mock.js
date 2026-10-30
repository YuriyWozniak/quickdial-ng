// Simulated Firefox WebExtension API shared by all frames (state lives in the top window)
window.S = { storage: {}, writes: [], removes: [], frames: [], nextId: 100, listeners: {} };
S.bm = { id: 'root________', title: '', children: [
  { id: 'menu________', title: 'menu', children: [] },
  { id: 'toolbar_____', title: 'toolbar', children: [] } ] };
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
function find(id, n = S.bm, parent = null) { if (n.id === id) return { node: n, parent }; for (const c of n.children || []) { const r = find(id, c, n); if (r) return r; } return null; }
function evt(name, owner) { S.listeners[name] = S.listeners[name] || []; return { addListener: f => { f.__owner = owner; if (!S.listeners[name].includes(f)) S.listeners[name].push(f); }, removeListener: f => { S.listeners[name] = S.listeners[name].filter(x => x !== f); }, hasListener: f => S.listeners[name].includes(f) }; }
function fire(name, ...a) { for (const f of [...(S.listeners[name] || [])]) try { f(...a); } catch (e) { console.error('listener', name, e); } }
window.fire = fire;
window.makeBrowser = function (win, role) {
  S.frames.push({ win, role });
  return {
    storage: { local: {
      get: keys => { let ks = keys == null ? Object.keys(S.storage) : (typeof keys === 'string' ? [keys] : keys); const r = {}; for (const k of ks) if (k in S.storage) r[k] = clone(S.storage[k]); return Promise.resolve(r); },
      set: o => { for (const k in o) { S.storage[k] = clone(o[k]); S.writes.push({ k, len: JSON.stringify(o[k]).length }); } return Promise.resolve(); },
      remove: ks => { for (const k of [].concat(ks)) { delete S.storage[k]; S.removes.push(k); } return Promise.resolve(); },
      clear: () => { S.storage = {}; return Promise.resolve(); } } },
    bookmarks: {
      getSubTree: id => Promise.resolve([clone(find(id).node)]),
      create: ({ parentId, title, url }) => { const p = find(parentId).node; const n = { id: 'n' + (S.nextId++), title, parentId, type: url ? 'bookmark' : 'folder' }; if (url) n.url = url; else n.children = []; p.children.push(n); setTimeout(() => fire('bm.onCreated', n.id, clone(n)), 0); return Promise.resolve(clone(n)); },
      update: (id, ch) => { const n = find(id).node; Object.assign(n, ch); setTimeout(() => fire('bm.onChanged', id, ch), 0); return Promise.resolve(clone(n)); },
      removeTree: id => { const f = find(id); f.parent.children = f.parent.children.filter(c => c.id !== id); setTimeout(() => fire('bm.onRemoved', id, { parentId: f.parent.id }), 0); return Promise.resolve(); },
      onCreated: evt('bm.onCreated', role), onChanged: evt('bm.onChanged', role), onMoved: evt('bm.onMoved', role), onRemoved: evt('bm.onRemoved', role), onImportBegan: evt('bm.onImportBegan', role), onImportEnded: evt('bm.onImportEnded', role) },
    runtime: {
      onMessage: evt('rt.onMessage.' + role, role),
      sendMessage: msg => {
        const target = role === 'bg' ? 'dial' : 'bg';
        const ls = S.listeners['rt.onMessage.' + target] || [];
        if (!ls.length) return Promise.reject(new Error('no receiver'));
        return new Promise((resolve, reject) => { let done = false; for (const f of ls) { const r = f(clone(msg), {}, v => { done = true; resolve(clone(v)); }); if (r && r.then) { done = true; r.then(v => resolve(clone(v)), reject); } } setTimeout(() => { if (!done) resolve(undefined); }, 50); }); },
      getBackgroundPage: () => Promise.resolve((S.frames.filter(f => f.role === 'bg').pop() || {}).win),
      getURL: p => p },
    tabs: { query: () => Promise.resolve([]), update: () => Promise.resolve({}), create: () => Promise.resolve({ id: 1 }), remove: () => Promise.resolve(), getCurrent: () => Promise.resolve({ id: 1 }), sendMessage: () => Promise.resolve(), captureVisibleTab: () => Promise.reject(new Error('n/a')), get: () => Promise.resolve({ status: 'complete' }) },
    contextMenus: { create: () => 1, removeAll: () => Promise.resolve(), onClicked: evt('cm.onClicked', role) },
    browserAction: { onClicked: evt('ba.onClicked', role) },
    i18n: { getMessage: k => k } };
};
