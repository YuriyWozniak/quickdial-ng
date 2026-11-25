// The Settings page's Themes tab (loaded after settings.js): the built-in and saved themes as cards to use, export or
// delete; saving, exporting and importing the theme the form shows. Form elements are reached by their id, as in settings.js.
app.Themes = { list: [], cards: [] };
// Tab Themes: the cards are drawn when the list arrives (app.load)
app.Themes.setup = function(){
	BtnThemeSave.onclick = app.Themes.saveCurrent;
	BtnThemeExport.onclick = app.Themes.exportCurrent;
	BtnThemeImport.onclick = function(){
		ThemeFile.value = null;
		ThemeFile.click();
	};
	ThemeFile.onchange = function(){
		if(ThemeFile.files[0]) app.readJsonFile(ThemeFile.files[0]).then(app.Themes.importFile);
	};
};
app.Themes.all = function(){ return QDThemes.BUILTIN.concat(app.Themes.list); };
// What the user sees of a theme: a built-in one's name and description come from the language files
app.Themes.displayName = theme => theme.builtin ? QDCommon.text(theme.nameKey) : theme.name;
app.Themes.displayDescription = theme => theme.builtin ? QDCommon.text(theme.descriptionKey) : theme.description || '';
// A built-in theme's name, as stored (English) or as shown in this language
app.Themes.isBuiltinName = function(name){
	const lower = String(name).trim().toLowerCase();
	return QDThemes.isBuiltinName(name) || QDThemes.BUILTIN.some(t => app.Themes.displayName(t).toLowerCase() == lower);
};
app.Themes.find = function(name){
	name = String(name).trim().toLowerCase();
	return app.Themes.list.filter(t => t.name.toLowerCase() == name)[0] || null;
};
app.Themes.store = function(list, callback){
	QDClient.setThemes(list).then(saved => {
		app.Themes.list = saved || [];
		app.Themes.render();
		if(callback) callback();
	});
};
app.Themes.render = function(){
	ThemeList.replaceChildren();
	app.Themes.cards = app.Themes.all().map(theme => {
		function makeElement(tag, cls, text){ const e = document.createElement(tag); if(cls) e.className = cls; if(text) e.textContent = text; return e; }
		function button(text, title, onclick, cls){ const control = makeElement('button', 'qd-btn is-small' + (cls ? ' ' + cls : ''), text); control.type = 'button'; control.title = title; control.onclick = onclick; return control; }
		const card = makeElement('article', 'qd-theme');
		const preview = makeElement('div', 'qd-theme-preview');
		preview.style.backgroundColor = theme.style.backgroundColor;
		preview.style.backgroundImage = QDThemes.background(null, theme.style.backgroundGradient);
		// Export and Delete are icons: their names are their tooltips and what a screen reader says
		function iconButton(label, title, icon, onclick){
			const control = makeElement('button', 'qd-icon-btn');
			control.type = 'button';
			control.title = title;
			control.setAttribute('aria-label', label);
			control.appendChild(app.Themes.icon(icon));
			control.onclick = onclick;
			return control;
		}
		const ratio = QDCommon.tileRatio(app.settings.grid);
		[false, true].forEach(hover => {
			const slot = makeElement('div', 'qd-tile-slot'), tile = makeElement('div', 'qd-tile');
			tile.appendChild(makeElement('div', 'qd-tile-img'));
			tile.appendChild(makeElement('div', 'qd-tile-title', QDCommon.text(hover ? 'tileHover' : 'tileExample')));
			slot.appendChild(tile);
			preview.appendChild(slot);
			QDThemes.paintTile(tile, theme.style.grid.cells, hover, ratio, app.SAMPLE_TILE_WIDTH, app.SAMPLE_TILE_MAX_HEIGHT);
		});
		card.appendChild(preview);
		const body = makeElement('div', 'qd-theme-body');
		const name = makeElement('h3', 'qd-theme-name', app.Themes.displayName(theme));
		if(theme.builtin) name.appendChild(makeElement('span', 'qd-badge', QDCommon.text('themeBuiltIn')));
		body.appendChild(name);
		const description = makeElement('p', 'qd-theme-desc', app.Themes.displayDescription(theme));
		description.title = description.textContent; // the card shows three lines of it
		body.appendChild(description);
		const actions = makeElement('div', 'qd-theme-actions');
		const use = button(QDCommon.text('themeUse'), QDCommon.text('themeUseHint'), () => { app.Themes.use(theme); });
		const current = makeElement('span', 'qd-theme-in-use'); // in place of Use, on the theme the form shows
		current.append(app.Themes.icon(app.Themes.ICONS.check), QDCommon.text('themeInUse'));
		actions.append(use, current);
		actions.appendChild(iconButton(QDCommon.text('themeExport'), QDCommon.text('themeExportHint'), app.Themes.ICONS.download, () => {
			app.download(QDThemes.toFile({ name: theme.name, description: app.Themes.displayDescription(theme), style: theme.style }), QDThemes.fileName(theme.name));
		}));
		if(!theme.builtin) actions.appendChild(iconButton(QDCommon.text('themeDelete'), QDCommon.text('themeDeleteHint'), app.Themes.ICONS.trash, () => { app.Themes.remove(theme); }));
		body.appendChild(actions);
		card.appendChild(body);
		ThemeList.appendChild(card);
		return { theme: theme, card: card, current: current, use: use };
	});
	app.Themes.markCurrent(app.formSettings());
};
app.Themes.markCurrent = function(settings){ // highlights the theme the form currently matches
	const style = QDThemes.extract(settings);
	app.Themes.cards.forEach(entry => {
		const isCurrent = QDThemes.equal(style, entry.theme.style);
		entry.card.classList.toggle('is-current', isCurrent);
		entry.current.hidden = !isCurrent;
		entry.use.hidden = entry.use.disabled = isCurrent;
	});
};
// The icons of the theme cards: the inside of a 16×16 stroked SVG
app.Themes.ICONS = Object.freeze({
	check: '<path d="M3 8.5 6.5 12 13 4.5"/>',
	download: '<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/>',
	trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'
});
app.Themes.icon = function(paths){ // built from our own markup above, never from data
	const svg = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
		+ paths + '</svg>', 'image/svg+xml').documentElement;
	return document.importNode(svg, true);
};
app.Themes.use = function(theme){
	const s = QDThemes.apply(app.formSettings(), theme.style);
	app.fillForm(s);
	app.updatePreviews();
	app.changes.mark();
	// A theme drawn for icons offers site icons for new tiles, unless they get icons already
	const offersIcons = theme.suggestsIcons && +GridNewTilePicture.value == QDCommon.TilePicture.page;
	const shown = QDCommon.text('themeShownHere', app.Themes.displayName(theme));
	app.showStatus(ThemeStatus, offersIcons ? shown + ' ' + QDCommon.text('themeSuitsIcons') : shown, false, false,
		offersIcons ? [{ label: QDCommon.text('themeUseSiteIcons'), onclick: app.Themes.useSiteIcons }] : null);
};
// The banner's "Use site icons for new tiles": sets New tiles get (applied with the theme), and offers Apply to tiles
app.Themes.useSiteIcons = function(){
	const report = (text, isBusy, isError) => app.showStatus(ThemeStatus, text, isError, isBusy);
	GridNewTilePicture.value = String(QDCommon.TilePicture.siteIcon);
	app.changes.mark();
	app.showStatus(ThemeStatus, QDCommon.text('themeSiteIconsChosen'), false, false,
		[{ label: QDCommon.text('settingsApplyTilePicture'), onclick: () => app.applyTilePicture(report) }]);
};
// Asks for a name and description: resolves to { name, description } or null
app.Themes.ask = function(title, okText, forSaving){
	const style = QDThemes.extract(app.formSettings());
	const match = app.Themes.all().filter(t => QDThemes.equal(style, t.style))[0];
	return QDUI.dialog({
		title: title,
		message: QDCommon.text('themeDialogMessage'),
		fields: [
			{ name: 'name', label: QDCommon.text('themeName'), value: match && !match.builtin ? match.name : QDCommon.text('themeNamePlaceholder'), placeholder: QDCommon.text('themeNamePlaceholder') },
			{ name: 'description', label: QDCommon.text('themeDescription'), value: match && !match.builtin ? match.description : '', placeholder: QDCommon.text('themeDescriptionPlaceholder') }
		],
		okText: okText,
		validate: function(answer){
			if(!answer.name) return QDCommon.text('themeNameMissing');
			if(answer.name.length > QDThemes.NAME_MAX_LENGTH) return QDCommon.text('themeNameTooLong', QDThemes.NAME_MAX_LENGTH);
			if(forSaving && app.Themes.isBuiltinName(answer.name)) return QDCommon.text('themeNameBuiltIn', answer.name);
			return '';
		}
	});
};
// Adds a theme to the list; a theme with the same name is replaced after confirmation
app.Themes.add = function(theme, done){
	const existing = app.Themes.find(theme.name);
	(existing ? QDUI.dialog({ title: QDCommon.text('themeReplaceTitle', existing.name), message: QDCommon.text('themeReplaceMessage'), okText: QDCommon.text('themeReplace'), danger: true }) : Promise.resolve(true)).then(ok => {
		if(!ok) return;
		app.Themes.store([theme].concat(app.Themes.list.filter(t => t !== existing)), done);
	});
};
app.Themes.saveCurrent = function(){
	app.Themes.ask(QDCommon.text('themeSaveTitle'), QDCommon.text('themeSave'), true).then(answer => {
		if(!answer) return;
		const theme = { name: answer.name, description: answer.description, style: QDThemes.extract(app.formSettings()) };
		app.Themes.add(theme, () => { app.showStatus(ThemeStatus, QDCommon.text('themeSaved', theme.name)); });
	});
};
app.Themes.exportCurrent = function(){
	app.Themes.ask(QDCommon.text('themeExportTitle'), QDCommon.text('themeExportButton'), false).then(answer => {
		if(!answer) return;
		app.download(QDThemes.toFile({ name: answer.name, description: answer.description, style: QDThemes.extract(app.formSettings()) }), QDThemes.fileName(answer.name));
	});
};
app.Themes.importFile = function(data){
	let theme;
	try { theme = QDThemes.fromFile(data); }
	catch(e){ app.showStatus(ThemeStatus, QDCommon.text(data ? e.message : 'themeFileInvalid'), true); return; }
	if(app.Themes.isBuiltinName(theme.name)) theme.name = QDCommon.text('themeImportedName', theme.name);
	app.Themes.add(theme, () => { app.showStatus(ThemeStatus, QDCommon.text('themeImported', theme.name)); });
};
app.Themes.remove = function(theme){
	QDUI.dialog({ title: QDCommon.text('themeDeleteTitle', theme.name), message: QDCommon.text('themeDeleteMessage'), okText: QDCommon.text('themeDelete'), danger: true }).then(ok => {
		if(ok) app.Themes.store(app.Themes.list.filter(t => t !== theme));
	});
};
