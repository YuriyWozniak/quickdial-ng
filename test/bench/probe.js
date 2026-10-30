// Quick Dial NG benchmark: new tab side. Times are ms since the tab's navigation start.
(function(){
	var marks = {};
	var mark = function(k){ if(!(k in marks)) marks[k] = +performance.now().toFixed(1); };
	var wrap = function(obj, name, k){ var f = obj[name]; obj[name] = function(){ var r = f.apply(this, arguments); mark(k); return r; }; };
	wrap(app.Settings, '_changed', 'settingsApplied');
	wrap(dial, 'populateGrid', 'gridPopulated');
	document.addEventListener('DOMContentLoaded', function(){ mark('domContentLoaded'); });
	function imagesSet(){ var n = 0; if(dial.Grid) for(var a of dial.Grid.querySelectorAll('a')) if((a.firstChild.style.backgroundImage||'').indexOf('data:image') >= 0) n++; return n; }
	(function poll(){
		if(imagesSet() >= 13){
			mark('imagesSet');
			var urls = []; for(var a of dial.Grid.querySelectorAll('a')){ var m = (a.firstChild.style.backgroundImage||'').match(/url\("?(data:[^")]+)/); if(m) urls.push(m[1]); }
			Promise.all(urls.map(function(u){ var i = new Image(); i.src = u; return i.decode(); })).then(function(){
				mark('imagesDecoded');
				requestAnimationFrame(function(){ requestAnimationFrame(function(){
					mark('painted');
					var nav = performance.getEntriesByType('navigation')[0];
					if(nav) marks.responseEnd = +nav.responseEnd.toFixed(1);
					browser.runtime.sendMessage({ benchDial: marks });
				}); });
			});
		} else setTimeout(poll, 1);
	})();
})();
