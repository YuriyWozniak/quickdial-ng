// Simulated Firefox WebExtension API shared by all frames (state lives in the top window)
window.S = { storage: {}, writes: [], removes: [], frames: [], nextId: 100, listeners: {} };
S.bm = { id: 'root________', title: '', children: [
  { id: 'menu________', title: 'menu', children: [] },
  { id: 'toolbar_____', title: 'toolbar', children: [] } ] };
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
function findNode(id, n = S.bm, parent = null) { if (n.id === id) return { node: n, parent }; for (const c of n.children || []) { const r = findNode(id, c, n); if (r) return r; } return null; }
function evt(name, owner) { S.listeners[name] = S.listeners[name] || []; return { addListener: f => { f.__owner = owner; if (!S.listeners[name].includes(f)) S.listeners[name].push(f); }, removeListener: f => { S.listeners[name] = S.listeners[name].filter(x => x !== f); }, hasListener: f => S.listeners[name].includes(f) }; }
function fire(name, ...a) { for (const f of [...(S.listeners[name] || [])]) try { f(...a); } catch (e) { console.error('listener', name, e); } }
window.fire = fire;
window.makeBrowser = function (win, role) {
  S.frames.push({ win, role });
  return {
    storage: { local: {
      get: keys => { const ks = keys == null ? Object.keys(S.storage) : (typeof keys === 'string' ? [keys] : keys); const r = {}; for (const k of ks) if (k in S.storage) r[k] = clone(S.storage[k]); return Promise.resolve(r); },
      set: o => { for (const k in o) { S.storage[k] = clone(o[k]); S.writes.push({ k, len: JSON.stringify(o[k]).length }); } return Promise.resolve(); },
      remove: ks => { for (const k of [].concat(ks)) { delete S.storage[k]; S.removes.push(k); } return Promise.resolve(); },
      clear: () => { S.storage = {}; return Promise.resolve(); } } },
    bookmarks: {
      // Like Firefox, a bookmark id that doesn't exist (any more) rejects
      getSubTree: id => findNode(id) ? Promise.resolve([clone(findNode(id).node)]) : Promise.reject(new Error('no bookmark ' + id)),
      create: ({ parentId, title, url }) => { const p = findNode(parentId).node; const n = { id: 'n' + (S.nextId++), title, parentId, type: url ? 'bookmark' : 'folder' }; if (url) n.url = url; else n.children = []; p.children.push(n); setTimeout(() => fire('bm.onCreated', n.id, clone(n)), 0); const r = clone(n); delete r.children; return Promise.resolve(r); }, // Firefox returns new folders without a children list
      update: (id, ch) => { if (!findNode(id)) return Promise.reject(new Error('no bookmark ' + id)); const n = findNode(id).node; Object.assign(n, ch); setTimeout(() => fire('bm.onChanged', id, ch), 0); return Promise.resolve(clone(n)); },
      move: (id, { parentId, index }) => { if (!findNode(id) || !findNode(parentId)) return Promise.reject(new Error('no bookmark ' + id)); const f = findNode(id); const oldParentId = f.parent.id, oldIndex = f.parent.children.indexOf(f.node); f.parent.children.splice(oldIndex, 1);
        const p = findNode(parentId).node; p.children.splice(index == null ? p.children.length : index, 0, f.node); f.node.parentId = parentId;
        setTimeout(() => fire('bm.onMoved', id, { parentId, oldParentId, index: p.children.indexOf(f.node), oldIndex }), 0); return Promise.resolve(clone(f.node)); },
      removeTree: id => { const f = findNode(id); if (!f) return Promise.reject(new Error('no bookmark ' + id)); f.parent.children = f.parent.children.filter(c => c.id !== id); setTimeout(() => fire('bm.onRemoved', id, { parentId: f.parent.id }), 0); return Promise.resolve(); },
      onCreated: evt('bm.onCreated', role), onChanged: evt('bm.onChanged', role), onMoved: evt('bm.onMoved', role), onRemoved: evt('bm.onRemoved', role), onImportBegan: evt('bm.onImportBegan', role), onImportEnded: evt('bm.onImportEnded', role) },
    runtime: {
      onMessage: evt('rt.onMessage.' + role, role),
      sendMessage: msg => {
        const target = role === 'bg' ? 'dial' : 'bg';
        const ls = S.listeners['rt.onMessage.' + target] || [];
        if (!ls.length) return Promise.reject(new Error('no receiver'));
        return new Promise((resolve, reject) => { let done = false; for (const f of ls) { const r = f(clone(msg), {}, v => { done = true; resolve(clone(v)); }); if (r && r.then) { done = true; r.then(v => resolve(clone(v)), reject); } } setTimeout(() => { if (!done) resolve(undefined); }, 50); }); },
      getBackgroundPage: () => Promise.resolve((S.frames.filter(f => f.role === 'bg').pop() || {}).win),
      getURL: p => p,
      getManifest: () => ({ version: '0.0.0' }) },
    tabs: { query: () => Promise.resolve([]), update: () => Promise.resolve({}), create: () => Promise.resolve({ id: 1 }), remove: () => Promise.resolve(), getCurrent: () => Promise.resolve({ id: 1 }), sendMessage: () => Promise.resolve(), captureVisibleTab: () => Promise.reject(new Error('n/a')), get: () => Promise.resolve({ status: 'complete' }) },
    // S.menus: the titles; S.menuItems: everything passed to create (onclick included), so tests can click an item
    contextMenus: { create: o => { (S.menus = S.menus || []).push(o.title); (S.menuItems = S.menuItems || []).push(o); return o.id || S.menuItems.length; },
      removeAll: () => { S.menus = []; S.menuItems = []; return Promise.resolve(); }, onClicked: evt('cm.onClicked', role) },
    browserAction: { onClicked: evt('ba.onClicked', role) },
    i18n: { getMessage: k => k } };
};
