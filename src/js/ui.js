// Quick Dial NG — shared UI helpers (the popup frame, tabs, unsaved-changes tracking, reading files,
// picking, dropping and pasting images, the accent colour and in-page dialogs). Used by the Settings and Properties pages and,
// loaded on demand, by the dial page. Styles live in /css/ui.css (the pages add /css/page.css).
/* exported QDUI */
// eslint-disable-next-line no-var -- a window property: the pages and the dial (loaded on demand) use it
var QDUI = (function(){
	'use strict';

	// ---------- popup frame ----------
	// The dial shows the Properties page in a modal frame (openPopup); the page inside reaches its frame through
	// window.frameElement.popup (closePopup, fitPopup).
	let shownPopup = null;
	function PopupPanel(width, height){
		const self = this;
		this.overlay = document.createElement('div');
		this.overlay.className = 'qd qd-overlay';
		this.panel = document.createElement('div');
		this.panel.className = 'qd-frame';
		this.panel.style.width = width + 'px';
		this.panel.style.height = height + 'px';
		this.overlay.appendChild(this.panel);
		this._onContextMenu = function(e){ e.preventDefault(); };
		this._onKeyDown = function(e){ if(e.key == 'Escape') self.close(); }; // when focus is outside the frame
		this.overlay.addEventListener('mousedown', e => { // keep focus in the frame
			if(e.target === self.overlay){ e.preventDefault(); const frame = self.panel.querySelector('iframe'); if(frame) frame.focus(); }
		});
		this.popup = function(){
			if(shownPopup) shownPopup.close(true);
			shownPopup = self;
			window.addEventListener('contextmenu', self._onContextMenu, false);
			window.addEventListener('keydown', self._onKeyDown, false);
			document.body.appendChild(self.overlay);
		};
		this.fit = function(){ // Called by the page inside: shrink the frame to its content (never above the requested height)
			const frame = self.panel.querySelector('iframe'), frameDocument = frame && frame.contentDocument;
			if(!frameDocument) return;
			const content = frameDocument.querySelector('.qd-content');
			let needed = 2;
			if(content) content.style.flex = '0 0 auto'; // natural height instead of "fill the frame"
			for(const element of frameDocument.body.children) needed += element.offsetHeight;
			if(content) content.style.flex = '';
			self.panel.style.height = Math.min(height, Math.ceil(needed)) + 'px';
		};
		this.close = function(immediate){
			if(self._closed) return;
			self._closed = true;
			if(shownPopup === self) shownPopup = null;
			window.removeEventListener('contextmenu', self._onContextMenu, false);
			window.removeEventListener('keydown', self._onKeyDown, false);
			if(immediate) self.overlay.remove();
			else { self.overlay.classList.add('is-closing'); setTimeout(() => { self.overlay.remove(); }, 120); }
		};
	}
	function openPopup(src, width, height){ // A page (src) in a modal frame; one at a time
		const popup = new PopupPanel(width, height);
		const iframe = document.createElement('iframe');
		iframe.src = src;
		iframe.popup = popup;
		popup.panel.appendChild(iframe);
		popup.popup();
		iframe.focus();
	}
	function closePopup(){
		if(window.frameElement && window.frameElement.popup) window.frameElement.popup.close();
		else window.close();
	}
	function fitPopup(){ // After the content changed: the frame takes the content's height
		const popup = window.frameElement && window.frameElement.popup;
		if(popup && popup.fit) popup.fit();
	}

	// ---------- tabs ----------
	// Buttons with role="tab" and aria-controls="<panel id>" inside `list`.
	function initTabs(list, onChange){
		const buttons = Array.prototype.slice.call(list.querySelectorAll('[role=tab]'));
		function select(btn, focus){
			if(typeof btn == 'string') btn = buttons.filter(b => b.id == btn || b.getAttribute('aria-controls') == btn)[0];
			if(!btn) return;
			buttons.forEach(button => {
				const selected = button === btn;
				button.setAttribute('aria-selected', selected ? 'true' : 'false');
				button.tabIndex = selected ? 0 : -1;
				document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
			});
			if(focus) btn.focus();
			if(onChange) onChange(btn);
		}
		buttons.forEach((button, i) => {
			button.addEventListener('click', () => { select(button); });
			button.addEventListener('keydown', e => {
				let next = null;
				if(e.key == 'ArrowRight' || e.key == 'ArrowDown') next = buttons[(i + 1) % buttons.length];
				else if(e.key == 'ArrowLeft' || e.key == 'ArrowUp') next = buttons[(i - 1 + buttons.length) % buttons.length];
				else if(e.key == 'Home') next = buttons[0];
				else if(e.key == 'End') next = buttons[buttons.length - 1];
				if(next){ e.preventDefault(); select(next, true); }
			});
		});
		return { select: select };
	}

	// ---------- unsaved changes ----------
	// Marks the form dirty on any input/change (except elements marked data-no-dirty),
	// enables the Apply button (and the optional Discard button) and shows a status line in the footer.
	function trackChanges(applyButton, statusEl, discardButton){
		let dirty = false, timer = null, ready = false;
		function render(){
			applyButton.disabled = !dirty;
			if(discardButton) discardButton.disabled = !dirty;
			statusEl.classList.toggle('is-dirty', dirty);
			if(dirty){ statusEl.classList.remove('is-saved'); statusEl.textContent = QDCommon.text('statusUnsaved'); }
		}
		function mark(){ if(!ready) return; dirty = true; clearTimeout(timer); render(); }
		function onEvent(e){ if(e.target.closest && e.target.closest('[data-no-dirty]')) return; mark(); }
		function done(text, applied){ // back to clean, with a short note in the status line
			dirty = false; render();
			statusEl.textContent = text;
			statusEl.classList.toggle('is-saved', applied);
			clearTimeout(timer);
			timer = setTimeout(() => { if(!dirty){ statusEl.textContent = ''; statusEl.classList.remove('is-saved'); } }, 2500);
		}
		document.addEventListener('input', onEvent, true);
		document.addEventListener('change', onEvent, true);
		render();
		return {
			mark: mark,
			start: function(){ ready = true; }, // Call after the form has been filled in
			isDirty: function(){ return dirty; },
			markSaved: function(text){ done(text || QDCommon.text('statusApplied'), true); },
			markDiscarded: function(text){ done(text || QDCommon.text('statusDiscarded'), false); }
		};
	}

	// ---------- files and images ----------
	// (How a picture fills its box: QDCommon.applyImageMode in js/common.js, shared with the dial.)

	// Reads a file the user picked: resolves with its text (asText) or a data URL, or null when it can't be read
	function readFile(file, asText){
		return new Promise(resolve => {
			const fileReader = new FileReader();
			fileReader.onload = e => { resolve(e.target.result); };
			fileReader.onerror = () => { resolve(null); };
			if(asText) fileReader.readAsText(file);
			else fileReader.readAsDataURL(file);
		});
	}

	// A picture chosen with `input` (a file input, hidden behind the `choose` label) is passed to apply(dataUrl).
	// The label opens the file dialog with Enter and Space too, and the same file can be chosen twice in a row.
	// imageDrop() hands dropped and pasted files to the same input.
	function imagePicker(input, choose, apply){
		if(choose) choose.addEventListener('keydown', e => { if(e.key == 'Enter' || e.key == ' '){ e.preventDefault(); input.click(); } });
		input.addEventListener('click', () => { input.value = null; });
		input.addEventListener('change', () => {
			const file = input.files[0];
			if(!file) return;
			readFile(file).then(dataUrl => {
				input.value = null;
				if(dataUrl) apply(dataUrl);
			});
		});
	}

	// Lets the user drop an image file on `zone` (and optionally paste one anywhere on the page);
	// the file is handed to `input` as if it had been chosen in the file dialog.
	function imageDrop(zone, input, options){
		options = options || {};
		let depth = 0;
		function isImage(transfer){
			if(!transfer) return false;
			if(transfer.items && transfer.items.length) return Array.prototype.some.call(transfer.items, i => i.kind == 'file' && /^image\//.test(i.type));
			return transfer.types && Array.prototype.indexOf.call(transfer.types, 'Files') >= 0;
		}
		function give(files){
			const file = Array.prototype.filter.call(files || [], f => /^image\//.test(f.type))[0];
			if(!file) return false;
			const transfer = new DataTransfer();
			transfer.items.add(file);
			input.files = transfer.files;
			input.dispatchEvent(new Event('change', { bubbles: true }));
			return true;
		}
		zone.addEventListener('dragenter', e => { if(!isImage(e.dataTransfer)) return; e.preventDefault(); depth++; zone.classList.add('is-dragover'); });
		zone.addEventListener('dragover', e => { if(!isImage(e.dataTransfer)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
		zone.addEventListener('dragleave', () => { if(--depth <= 0){ depth = 0; zone.classList.remove('is-dragover'); } });
		zone.addEventListener('drop', e => { e.preventDefault(); depth = 0; zone.classList.remove('is-dragover'); give(e.dataTransfer.files); });
		if(options.paste){
			document.addEventListener('paste', e => {
				const target = e.target;
				if(target && (target.tagName == 'INPUT' || target.tagName == 'TEXTAREA') && !(e.clipboardData.files && e.clipboardData.files.length)) return; // normal text paste
				if(give(e.clipboardData && e.clipboardData.files)) e.preventDefault();
			});
		}
	}

	// ---------- accent colour ----------
	// The theme's accent (#rrggbb, or null for the default) for buttons, switches, tabs and focus rings.
	// ui.css derives the hover, pressed, soft and dark-mode shades from it.
	function setAccent(hex){
		const root = document.documentElement;
		if(!hex || !/^#[0-9a-f]{6}$/i.test(hex)){
			root.classList.remove('qd-accented');
			root.style.removeProperty('--qd-user-accent');
			root.style.removeProperty('--qd-user-accent-text');
			return;
		}
		const rgb = parseInt(hex.slice(1), 16);
		const lin = function(channel){ channel /= 255; return channel <= .03928 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4); };
		const lum = .2126 * lin(rgb >> 16 & 255) + .7152 * lin(rgb >> 8 & 255) + .0722 * lin(rgb & 255);
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
	function dialog(options){
		return new Promise(resolve => {
			const fields = options.fields || (options.value !== undefined ? [{ value: options.value, placeholder: options.placeholder }] : []);
			const overlay = document.createElement('div');
			overlay.className = 'qd qd-overlay';
			const box = document.createElement('div');
			box.className = 'qd-dialog';
			box.setAttribute('role', options.danger ? 'alertdialog' : 'dialog');
			box.setAttribute('aria-modal', 'true');
			const heading = document.createElement('h1'); heading.className = 'qd-title'; heading.textContent = options.title || ''; heading.id = 'qd-dialog-title';
			box.setAttribute('aria-labelledby', heading.id);
			box.appendChild(heading);
			if(options.message){ const message = document.createElement('p'); message.className = 'qd-dialog-message'; message.textContent = options.message; box.appendChild(message); }
			const inputs = fields.map((field, i) => {
				const input = document.createElement('input');
				input.type = 'text';
				input.value = field.value || '';
				input.spellcheck = false;
				input.id = 'qd-dialog-field-' + i;
				if(field.placeholder) input.placeholder = field.placeholder;
				if(field.label){
					const label = document.createElement('label'); label.className = 'qd-dialog-label'; label.htmlFor = input.id; label.textContent = field.label;
					box.appendChild(label);
				}
				box.appendChild(input);
				return input;
			});
			let error = null;
			if(inputs.length){
				error = document.createElement('div'); error.className = 'qd-dialog-error';
				box.appendChild(error);
				box.addEventListener('input', () => { inputs.forEach(i => { i.classList.remove('is-invalid'); }); error.textContent = ''; });
			}
			const actions = document.createElement('div'); actions.className = 'qd-dialog-actions';
			const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'qd-btn'; cancel.textContent = options.cancelText || QDCommon.text('buttonCancel');
			const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'qd-btn ' + (options.danger ? 'is-danger' : 'is-primary'); ok.textContent = options.okText || QDCommon.text('buttonOk');
			actions.appendChild(cancel); actions.appendChild(ok);
			box.appendChild(actions);
			overlay.appendChild(box);

			const previousFocus = document.activeElement;
			function finish(result){
				window.removeEventListener('keydown', onKey, true);
				overlay.classList.add('is-closing');
				setTimeout(() => { overlay.remove(); }, 120);
				if(previousFocus && previousFocus.focus) try { previousFocus.focus(); } catch(e) {}
				resolve(result);
			}
			function accept(){
				if(!inputs.length) return finish(true);
				let result;
				if(options.fields){
					result = {};
					options.fields.forEach((field, i) => { result[field.name] = inputs[i].value.trim(); });
				} else result = inputs[0].value.trim();
				const problem = options.validate ? options.validate(result) : (inputs[0].value.trim() ? '' : QDCommon.text('dialogEnterValue'));
				if(problem){ inputs[0].classList.add('is-invalid'); error.textContent = problem; inputs[0].focus(); return; }
				finish(options.transform ? options.transform(result) : result);
			}
			function onKey(e){ // Capture phase on window: runs before the page's own shortcuts
				if(e.key == 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); finish(null); }
				else if(e.key == 'Enter' && !(e.target && e.target.tagName == 'BUTTON')){ e.preventDefault(); e.stopImmediatePropagation(); accept(); }
				else if(e.key == 'Tab'){ // keep focus inside the dialog
					const focusable = box.querySelectorAll('input, button'), first = focusable[0], last = focusable[focusable.length - 1];
					if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
					else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
				}
			}
			ok.onclick = accept;
			cancel.onclick = function(){ finish(null); };
			overlay.addEventListener('mousedown', e => { if(e.target === overlay) finish(null); });
			overlay.addEventListener('contextmenu', e => { e.preventDefault(); });
			window.addEventListener('keydown', onKey, true);
			document.body.appendChild(overlay);
			if(inputs.length){ inputs[0].focus(); inputs[0].select(); } else (options.danger ? cancel : ok).focus();
		});
	}

	// ---------- page texts ----------
	// The pages' texts live in the language files (_locales), not in the HTML: an element marked data-i18n="key"
	// gets that text, data-i18n-title, data-i18n-placeholder and data-i18n-aria-label set those attributes.
	// The page also gets its language and writing direction (right to left for Hebrew).
	const TEXT_ATTRIBUTES = ['title', 'placeholder', 'aria-label'];
	function localize(root){
		root = root || document;
		for(const element of root.querySelectorAll('[data-i18n]')) setRichText(element, QDCommon.text(element.getAttribute('data-i18n')));
		for(const attr of TEXT_ATTRIBUTES){
			for(const element of root.querySelectorAll('[data-i18n-' + attr + ']')) element.setAttribute(attr, QDCommon.text(element.getAttribute('data-i18n-' + attr)));
		}
		if(root === document){
			document.documentElement.lang = QDCommon.language();
			document.documentElement.dir = QDCommon.direction();
		}
	}
	// A text may hold <b>...</b>, <code>...</code> and <br>: they become those elements (built one by one, never
	// parsed as HTML); anything else in it is shown as it is.
	const RICH_TEXT = /<(b|code)>(.*?)<\/\1>|<br>/g;
	function setRichText(element, text){
		element.replaceChildren();
		let last = 0;
		for(const match of text.matchAll(RICH_TEXT)){
			element.append(text.slice(last, match.index));
			if(match[1]){ const part = document.createElement(match[1]); part.textContent = match[2]; element.append(part); }
			else element.append(document.createElement('br'));
			last = match.index + match[0].length;
		}
		element.append(text.slice(last));
	}

	return { openPopup, closePopup, fitPopup, initTabs, trackChanges, readFile, imagePicker, imageDrop, setAccent, dialog, localize, setRichText };
})();