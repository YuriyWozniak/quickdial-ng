// Paints the dial's background colour before anything else, so a cold start doesn't flash white while
// the settings are still loading. The colour comes from the ?bg= link parameter (folder links), otherwise
// from the copy the background page keeps in localStorage (app.Settings.rememberBackground), otherwise
// the default. dial.js clears it again once the real settings are applied.
(function(){
	var color = null;
	try { color = new URL(window.location).searchParams.get('bg'); } catch(e){}
	if(!color) try { color = window.localStorage.getItem('dialBackgroundColor'); } catch(e){}
	document.documentElement.style.backgroundColor = color || '#3c4048';
})();
