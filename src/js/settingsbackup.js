// The Settings page's Backup tab (loaded after settings.js): export, import, and the snippet that exports the original
// Quick Dial's data. Form elements are reached by their id, as in settings.js.
app.Backup = {
	COPIED_LABEL_TIME: 2000 // ms the Copy export snippet button says Copied
};
// Tab Backup: export, import (the page reloads after an import and shows what it did: ?result=)
app.Backup.setup = function(){
	BtnExport.onclick = function(){
		QDClient.exportData().then(data => {
			app.download(data, QDCommon.BACKUP_FORMAT + '-backup-' + new Date().toISOString().slice(0, 'yyyy-mm-dd'.length) + '.json');
		});
	};
	BtnImport.onclick = function(){
		ImportFile.value = null;
		ImportFile.click();
	};
	ImportFile.onchange = function(){
		if(ImportFile.files[0]) app.readJsonFile(ImportFile.files[0]).then(app.Backup.importFile);
	};
	BtnCopySnippet.onclick = function(){
		navigator.clipboard.writeText(app.Backup.exportSnippet).then(() => {
			BtnCopySnippet.textContent = QDCommon.text('backupCopied');
			setTimeout(() => { BtnCopySnippet.textContent = QDCommon.text('backupCopySnippet'); }, app.Backup.COPIED_LABEL_TIME);
		}, () => { prompt(QDCommon.text('backupCopyPrompt'), app.Backup.exportSnippet); });
	};
	const result = new URLSearchParams(location.search).get('result');
	if(result) app.showStatus(ImportStatus, result);
};
// A Quick Dial NG backup or an original Quick Dial export (data: the file's content, null when it isn't JSON)
app.Backup.importFile = function(data){
	if(!data || !data.settings || !data.node || !data.settings.grid){
		app.showStatus(ImportStatus, QDCommon.text(data && data.format == QDThemes.FILE_FORMAT ? 'backupFileIsTheme' : 'backupFileInvalid'), true);
		return;
	}
	QDUI.dialog({
		title: QDCommon.text(data.format == QDCommon.BACKUP_FORMAT ? 'backupImportNgTitle' : 'backupImportOriginalTitle'),
		message: QDCommon.text('backupImportMessage'),
		okText: QDCommon.text('backupImportButton'),
		danger: true
	}).then(ok => {
		if(!ok) return;
		BtnImport.disabled = true;
		app.showStatus(ImportStatus, QDCommon.text('backupImporting'), false, true);
		QDClient.importData(data).then(result => {
			const text = QDCommon.text('backupImportResult', QDCommon.countText('countTiles', result.tiles), QDCommon.countText('countFolders', result.folders + 1),
				QDCommon.countText('countPictures', result.images), result.matched, result.created);
			location.search = '?tab=backup&result=' + encodeURIComponent(text); // Reload so the form shows the imported settings
		}, err => {
			BtnImport.disabled = false;
			app.showStatus(ImportStatus, QDCommon.text('backupImportFailed', err.message), true);
		});
	});
};
app.Backup.exportSnippet = "(async()=>{const a=(await browser.runtime.getBackgroundPage()).app;const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([JSON.stringify({version:4,settings:a.settings,node:a.node})],{type:'application/json'}));l.download='quickdial-export.json';document.body.appendChild(l);l.click();})()";
