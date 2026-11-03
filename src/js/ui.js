// Quick Dial NG — shared UI helpers (tabs, unsaved-changes tracking, image drop/paste,
// image-mode previews and in-page dialogs). Used by the Settings and Properties pages and,
// loaded on demand, by the dial page. Styles live in /css/ui.css.
var QDUI = (function(){
	'use strict';

	// ---------- popup frame ----------
	function closePopup(){
		if(window.frameElement && window.frameElement.popup) window.frameElement.popup.close();
		else window.close();
	}

	// ---------- tabs ----------
	// Buttons with role="tab" and aria-controls="<panel id>" inside `list`.
	function tabs(list, onChange){
		var buttons = Array.prototype.slice.call(list.querySelectorAll('[role=tab]'));
		function select(btn, focus){
			if(typeof btn == 'string') btn = buttons.filter(function(b){ return b.id == btn || b.getAttribute('aria-controls') == btn; })[0];
			if(!btn) return;
			buttons.forEach(function(b){
				var on = b === btn;
				b.setAttribute('aria-selected', on ? 'true' : 'false');
				b.tabIndex = on ? 0 : -1;
				document.getElementById(b.getAttribute('aria-controls')).hidden = !on;
			});
			if(focus) btn.focus();
			if(onChange) onChange(btn);
		}
		buttons.forEach(function(b, i){
			b.addEventListener('click', function(){ select(b); });
			b.addEventListener('keydown', function(e){
				var n = null;
				if(e.key == 'ArrowRight') n = buttons[(i + 1) % buttons.length];
				else if(e.key == 'ArrowLeft') n = buttons[(i - 1 + buttons.length) % buttons.length];
				else if(e.key == 'Home') n = buttons[0];
				else if(e.key == 'End') n = buttons[buttons.length - 1];
				if(n){ e.preventDefault(); select(n, true); }
			});
		});
		return { select: select };
	}

	// ---------- unsaved changes ----------
	// Marks the form dirty on any input/change (except elements marked data-no-dirty),
	// enables the Apply button and shows a status line in the footer.
	function changes(applyButton, statusEl){
		var dirty = false, timer = null, ready = false;
		function render(){
			applyButton.disabled = !dirty;
			statusEl.classList.toggle('is-dirty', dirty);
			if(dirty){ statusEl.classList.remove('is-saved'); statusEl.textContent = 'Unsaved changes'; }
		}
		function mark(){ if(!ready) return; dirty = true; clearTimeout(timer); render(); }
		function onEvent(e){ if(e.target.closest && e.target.closest('[data-no-dirty]')) return; mark(); }
		document.addEventListener('input', onEvent, true);
		document.addEventListener('change', onEvent, true);
		render();
		return {
			mark: mark,
			start: function(){ ready = true; }, // Call after the form has been filled in
			isDirty: function(){ return dirty; },
			saved: function(text){
				dirty = false; render();
				statusEl.textContent = text || 'Changes applied';
				statusEl.classList.add('is-saved');
				clearTimeout(timer);
				timer = setTimeout(function(){ if(!dirty){ statusEl.textContent = ''; statusEl.classList.remove('is-saved'); } }, 2500);
			}
		};
	}

	// ---------- images ----------
	// Same mapping as the dial page: -1 default, 0 stretch, 1 cover, 2 contain, 3 center.
	function applyMode(el, mode){
		var s = el.style;
		switch(+mode){
			case 0: s.backgroundRepeat = 'no-repeat'; s.backgroundSize = '100% 100%'; s.backgroundPosition = 'center'; break;
			case 1: s.backgroundRepeat = 'no-repeat'; s.backgroundSize = 'cover'; s.backgroundPosition = 'center'; break;
			case 2: s.backgroundRepeat = 'no-repeat'; s.backgroundSize = 'contain'; s.backgroundPosition = 'center'; break;
			case 3: s.backgroundRepeat = 'no-repeat'; s.backgroundSize = 'auto'; s.backgroundPosition = 'center'; break;
			default: s.backgroundRepeat = 'no-repeat'; s.backgroundSize = '100% 100%'; s.backgroundPosition = 'center';
		}
	}

	// Lets the user drop an image file on `zone` (and optionally paste one anywhere on the page);
	// the file is handed to `input` as if it had been chosen in the file dialog.
	function imageDrop(zone, input, options){
		options = options || {};
		var depth = 0;
		function isImage(dt){
			if(!dt) return false;
			if(dt.items && dt.items.length) return Array.prototype.some.call(dt.items, function(i){ return i.kind == 'file' && /^image\//.test(i.type); });
			return dt.types && Array.prototype.indexOf.call(dt.types, 'Files') >= 0;
		}
		function give(files){
			var file = Array.prototype.filter.call(files || [], function(f){ return /^image\//.test(f.type); })[0];
			if(!file) return false;
			var dt = new DataTransfer();
			dt.items.add(file);
			input.files = dt.files;
			input.dispatchEvent(new Event('change', { bubbles: true }));
			return true;
		}
		zone.addEventListener('dragenter', function(e){ if(!isImage(e.dataTransfer)) return; e.preventDefault(); depth++; zone.classList.add('is-dragover'); });
		zone.addEventListener('dragover', function(e){ if(!isImage(e.dataTransfer)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
		zone.addEventListener('dragleave', function(){ if(--depth <= 0){ depth = 0; zone.classList.remove('is-dragover'); } });
		zone.addEventListener('drop', function(e){ e.preventDefault(); depth = 0; zone.classList.remove('is-dragover'); give(e.dataTransfer.files); });
		if(options.paste){
			document.addEventListener('paste', function(e){
				var t = e.target;
				if(t && (t.tagName == 'INPUT' || t.tagName == 'TEXTAREA') && !(e.clipboardData.files && e.clipboardData.files.length)) return; // normal text paste
				if(give(e.clipboardData && e.clipboardData.files)) e.preventDefault();
			});
		}
	}

	// ---------- accent colour ----------
	// The theme's accent (#rrggbb, or null for the default) for buttons, switches, tabs and focus rings.
	// ui.css derives the hover, pressed, soft and dark-mode shades from it.
	function setAccent(hex){
		var root = document.documentElement;
		if(!hex || !/^#[0-9a-f]{6}$/i.test(hex)){
			root.classList.remove('qd-accented');
			root.style.removeProperty('--qd-user-accent');
			root.style.removeProperty('--qd-user-accent-text');
			return;
		}
		var n = parseInt(hex.slice(1), 16);
		var lin = function(v){ v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
		var lum = .2126 * lin(n >> 16 & 255) + .7152 * lin(n >> 8 & 255) + .0722 * lin(n & 255);
		root.style.setProperty('--qd-user-accent', hex);
		root.style.setProperty('--qd-user-accent-text', lum > .4 ? '#15141a' : '#ffffff'); // whichever reads better on it
		root.classList.add('qd-accented');
	}

	// ---------- dialogs ----------
	// QDUI.dialog({ title, message, value, placeholder, fields, okText, cancelText, danger, validate, transform })
	// - plain confirmation: resolves to true
	// - `value` (one text field): resolves to the entered text
	// - `fields` ([{ name, label, value, placeholder }]): resolves to { name: text, ... }
	// `validate` gets the same result and returns an error message ('' when fine). Cancel resolves to null.
	function dialog(o){
		return new Promise(function(resolve){
			var fields = o.fields || (o.value !== undefined ? [{ value: o.value, placeholder: o.placeholder }] : []);
			var overlay = document.createElement('div');
			overlay.className = 'qd qd-overlay';
			var box = document.createElement('div');
			box.className = 'qd-dialog';
			box.setAttribute('role', o.danger ? 'alertdialog' : 'dialog');
			box.setAttribute('aria-modal', 'true');
			var h = document.createElement('h1'); h.className = 'qd-title'; h.textContent = o.title || ''; h.id = 'qd-dialog-title';
			box.setAttribute('aria-labelledby', h.id);
			box.appendChild(h);
			if(o.message){ var m = document.createElement('p'); m.className = 'qd-dialog-message'; m.textContent = o.message; box.appendChild(m); }
			var inputs = fields.map(function(f, i){
				var input = document.createElement('input');
				input.type = 'text';
				input.value = f.value || '';
				input.spellcheck = false;
				input.id = 'qd-dialog-field-' + i;
				if(f.placeholder) input.placeholder = f.placeholder;
				if(f.label){
					var label = document.createElement('label'); label.className = 'qd-dialog-label'; label.htmlFor = input.id; label.textContent = f.label;
					box.appendChild(label);
				}
				box.appendChild(input);
				return input;
			});
			var error = null;
			if(inputs.length){
				error = document.createElement('div'); error.className = 'qd-dialog-error';
				box.appendChild(error);
				box.addEventListener('input', function(){ inputs.forEach(function(i){ i.classList.remove('is-invalid'); }); error.textContent = ''; });
			}
			var actions = document.createElement('div'); actions.className = 'qd-dialog-actions';
			var cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'qd-btn'; cancel.textContent = o.cancelText || 'Cancel';
			var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'qd-btn ' + (o.danger ? 'is-danger' : 'is-primary'); ok.textContent = o.okText || 'OK';
			actions.appendChild(cancel); actions.appendChild(ok);
			box.appendChild(actions);
			overlay.appendChild(box);

			var previousFocus = document.activeElement;
			function finish(result){
				window.removeEventListener('keydown', onKey, true);
				overlay.classList.add('is-closing');
				setTimeout(function(){ overlay.remove(); }, 120);
				if(previousFocus && previousFocus.focus) try { previousFocus.focus(); } catch(e) {}
				resolve(result);
			}
			function accept(){
				if(!inputs.length) return finish(true);
				var result;
				if(o.fields){
					result = {};
					o.fields.forEach(function(f, i){ result[f.name] = inputs[i].value.trim(); });
				} else result = inputs[0].value.trim();
				var problem = o.validate ? o.validate(result) : (inputs[0].value.trim() ? '' : 'Please enter a value.');
				if(problem){ inputs[0].classList.add('is-invalid'); error.textContent = problem; inputs[0].focus(); return; }
				finish(o.transform ? o.transform(result) : result);
			}
			function onKey(e){ // Capture phase on window: runs before the page's own shortcuts
				if(e.key == 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); finish(null); }
				else if(e.key == 'Enter' && !(e.target && e.target.tagName == 'BUTTON')){ e.preventDefault(); e.stopImmediatePropagation(); accept(); }
				else if(e.key == 'Tab'){ // keep focus inside the dialog
					var f = box.querySelectorAll('input, button'), first = f[0], last = f[f.length - 1];
					if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
					else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
				}
			}
			ok.onclick = accept;
			cancel.onclick = function(){ finish(null); };
			overlay.addEventListener('mousedown', function(e){ if(e.target === overlay) finish(null); });
			overlay.addEventListener('contextmenu', function(e){ e.preventDefault(); });
			window.addEventListener('keydown', onKey, true);
			document.body.appendChild(overlay);
			if(inputs.length){ inputs[0].focus(); inputs[0].select(); } else (o.danger ? cancel : ok).focus();
		});
	}

	return { closePopup: closePopup, tabs: tabs, changes: changes, applyMode: applyMode, imageDrop: imageDrop, setAccent: setAccent, dialog: dialog };
})();