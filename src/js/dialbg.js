// Paints the dial's background colour before anything else, so a cold start doesn't flash white while
// the settings are still loading. The colour comes from the ?bg= link parameter (folder links), otherwise
// from the copy the background page keeps in localStorage (app.Settings.rememberBackground), otherwise
// the default. dial.js clears it again once the real settings are applied.
// It runs before the other scripts load, so it keeps its own copies of two values.
(function(){
	const DIAL_COLOR_KEY = 'dialBackgroundColor'; // app.Settings.DIAL_COLOR_KEY
	const DEFAULT_COLOR = '#3c4048'; // the Classic theme's page colour (QDThemes.CLASSIC.backgroundColor)
	let color = null;
	try { color = new URL(window.location).searchParams.get('bg'); } catch(e){}
	if(!color) try { color = window.localStorage.getItem(DIAL_COLOR_KEY); } catch(e){}
	document.documentElement.style.backgroundColor = color || DEFAULT_COLOR;
})();
