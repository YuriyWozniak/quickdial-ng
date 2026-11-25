// Quick Dial NG — background page: the icon sets of the icon picker (Properties › Picture › Icon). None comes with the
// extension. iconsets.json (made by release/make-icon-sets.js) says where each one is (a file of a release of this project
// on GitHub: each set names its own, so an unchanged set stays where it was), its size and its fingerprint (SHA-256).
// A set is downloaded only when the user asks for it, and refused when it doesn't match. Downloaded sets are kept in
// storage.local, outside backups (they can be downloaded again), and used offline from then on. A set downloaded for an
// older iconsets.json is kept, and offered for an update. Tiles never need a set: the chosen icon is drawn into the
// tile's own picture (SiteIcons.drawIcon).
app.IconSets = {};
app.IconSets.CATALOG = '/iconsets.json';
app.IconSets.infoKey = set => 'iconSetInfo.' + set; // storage: { sha256, source } of a downloaded set
app.IconSets.iconsKey = set => 'iconSetIcons.' + set; // storage: the set itself, as in its file
app.IconSets.State = Object.freeze({
	missing: 'missing', // not downloaded
	ready: 'ready', // downloaded, the one iconsets.json names
	old: 'old' // downloaded for an older iconsets.json: usable, and can be updated
});
app.IconSets.HASH = 'SHA-256';
// The answers for a file that isn't there (any more): an old release taken down once few copies still use it. The error
// is marked gone, and the picker asks the user to update Quick Dial NG, whose iconsets.json names the current files.
app.IconSets.GONE = Object.freeze([404, 410]);
app.IconSets._catalog = null; // promise of iconsets.json
app.IconSets._downloads = {}; // set -> promise of the download under way

app.IconSets.catalog = function(){
	if(!app.IconSets._catalog) app.IconSets._catalog = fetch(app.IconSets.CATALOG).then(response => {
		if(!response.ok) throw new Error(app.IconSets.CATALOG + ': HTTP ' + response.status);
		return response.json();
	}).catch(e => {
		app.IconSets._catalog = null; // Read again next time
		throw e;
	});
	return app.IconSets._catalog;
};
// The sets: [{ name, source, homepage, license, licenseUrl, count, bytes, state, downloading }], in iconsets.json's order.
// source and count are those of the set as it will be downloaded.
app.IconSets.list = async function(){
	const catalog = await app.IconSets.catalog(), names = Object.keys(catalog.sets);
	const stored = await browser.storage.local.get(names.map(app.IconSets.infoKey));
	return names.map(name => {
		const set = catalog.sets[name], info = stored[app.IconSets.infoKey(name)];
		const state = !info ? app.IconSets.State.missing : (info.sha256 == set.sha256 ? app.IconSets.State.ready : app.IconSets.State.old);
		return { name, source: set.source, homepage: set.homepage, license: set.license, licenseUrl: set.licenseUrl,
			count: set.count, bytes: set.bytes, state, downloading: name in app.IconSets._downloads };
	});
};
// A downloaded set, as in its file ({ source, license, icons, ... }), or null
app.IconSets.get = function(name){
	const key = app.IconSets.iconsKey(name);
	return browser.storage.local.get(key).then(stored => stored[key] || null);
};
// Downloads a set and keeps it. Resolves when it is kept; rejects with the reason (an Error, with gone: true when the file
// isn't there any more) when it can't be.
// Asked again while under way, it answers the same download.
app.IconSets.download = function(name){
	const downloads = app.IconSets._downloads;
	if(!downloads[name]) downloads[name] = app.IconSets._download(name).finally(() => { delete downloads[name]; });
	return downloads[name];
};
app.IconSets._download = async function(name){
	const catalog = await app.IconSets.catalog(), set = catalog.sets[name];
	if(!set) throw new Error('no icon set ' + name);
	const response = await fetch(set.url, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
	if(app.IconSets.GONE.includes(response.status)) throw Object.assign(new Error('HTTP ' + response.status), { gone: true });
	if(!response.ok) throw new Error('HTTP ' + response.status);
	const length = Number(response.headers.get('content-length'));
	if(length && length != set.bytes) throw new Error(QDCommon.text('propertiesIconSetBadFile'));
	const bytes = await response.arrayBuffer();
	if(bytes.byteLength != set.bytes || await app.IconSets.fingerprint(bytes) != set.sha256) throw new Error(QDCommon.text('propertiesIconSetBadFile'));
	const data = JSON.parse(new TextDecoder().decode(bytes));
	if(!data || !Array.isArray(data.icons)) throw new Error(QDCommon.text('propertiesIconSetBadFile'));
	await browser.storage.local.set({ [app.IconSets.iconsKey(name)]: data });
	await browser.storage.local.set({ [app.IconSets.infoKey(name)]: { sha256: set.sha256, source: data.source } }); // Last: only a whole set counts as downloaded
};
// A file's SHA-256, in hexadecimal
app.IconSets.fingerprint = function(bytes){
	return crypto.subtle.digest(app.IconSets.HASH, bytes).then(hash => Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''));
};
app.IconSets.remove = function(name){
	return browser.storage.local.remove([app.IconSets.infoKey(name), app.IconSets.iconsKey(name)]);
};
