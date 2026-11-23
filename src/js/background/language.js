// Quick Dial NG — background page: the language of the texts. Firefox's own by default (browser.i18n); the
// Language setting (settings.language: a QDCommon.LANGUAGES key, '' or missing for Firefox's) overrides it for
// the dial, Settings, Properties and the menus. Firefox's Add-ons manager still shows the extension's name and
// description in Firefox's language: it reads them itself.
// The chosen language's texts are read from its messages.json and kept in localStorage (QDCommon.LANGUAGE_KEY),
// where every page reads them before it draws (QDCommon.useLanguage).
app.Language = {};
app.Language._loaded = null; // { language, messages } read in this session; null: Firefox's language
app.Language._request = 0; // The latest apply: an older one that finishes later is ignored

// Makes the texts follow settings.language: here, in the copy for the pages, and so in the menus built next.
// Call it before telling the pages the settings changed. Promise, never rejects: a language that can't be
// read leaves Firefox's.
app.Language.apply = function(){
	const request = ++app.Language._request;
	if(app.Settings._loadFailed) return Promise.resolve(); // The defaults in use are not the user's: keep the copy the pages have
	const language = app.settings && app.settings.language;
	if(!language || !Object.prototype.hasOwnProperty.call(QDCommon.LANGUAGES, language)){
		app.Language._use(null);
		return Promise.resolve();
	}
	if(app.Language._loaded && app.Language._loaded.language == language) return Promise.resolve();
	return Promise.resolve()
		.then(() => fetch(browser.runtime.getURL('_locales/' + language + '/messages.json')))
		.then(response => response.json())
		.then(file => {
			const messages = {};
			for(const key in file) messages[key] = file[key].message;
			if(request == app.Language._request) app.Language._use({ language, messages });
		}, e => {
			console.error('Quick Dial NG: the texts in ' + language + ' could not be read; Firefox\'s language is used', e);
			if(request == app.Language._request) app.Language._use(null);
		});
};
app.Language._use = function(chosen){
	app.Language._loaded = chosen;
	QDCommon.useLanguage(chosen);
	try {
		if(chosen) localStorage.setItem(QDCommon.LANGUAGE_KEY, JSON.stringify(chosen));
		else localStorage.removeItem(QDCommon.LANGUAGE_KEY);
	} catch(e){}
};
