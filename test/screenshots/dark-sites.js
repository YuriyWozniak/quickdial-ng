// Invented websites for the zoned dials of the screenshots (see README.md in this folder): the kinds of
// sites people keep on a dial, mostly in dark mode, as many sites are used. Each is a complete
// 1280×960 page that make-screenshots.js captures as a tile picture, like sites.js. Everything is
// made up: no real brands, logos, people or photos.
//
// Exports
//   DARK_SITES  { key: { title, url, html } }  the sites by key; make-screenshots.js places them on the grid
//
// Most pages are built from the same parts: shell() draws the header, the side menu and the main area,
// the other functions fill the main area. Colours come from DARK or LIGHT.
'use strict';
const { photo, page, repeat } = require('./sites.js');

const DARK = { background: '#1b1b1f', panel: '#232328', raised: '#2d2d34', line: '#35353d', text: '#e6e6ea', muted: '#9b9ba6' };
const LIGHT = { background: '#ffffff', panel: '#f6f7f9', raised: '#eceef2', line: '#e1e4e8', text: '#24292f', muted: '#6e7781' };

/**
 * A web app page: header with logo and search, side menu, main area.
 * @param {object} colors   DARK or LIGHT
 * @param {object} options  brand (name), accent (#rrggbb), menu (item names), search (placeholder),
 *                          main (html of the main area), menuWidth (px), button (text of the button above the menu)
 */
function shell(colors, { brand, accent, menu = [], search = 'Search', main, menuWidth = 220, button }) {
	const css = `body{background:${colors.background};color:${colors.text}}.muted{color:${colors.muted}}
		header{height:62px;display:flex;align-items:center;gap:22px;padding:0 22px;border-bottom:1px solid ${colors.line}}
		.logo{display:flex;align-items:center;gap:10px;font-weight:600;font-size:19px;width:${menuWidth - 22}px}.logo i{width:30px;height:30px;border-radius:8px;background:${accent}}
		.search{flex:1;max-width:640px;height:40px;border-radius:20px;background:${colors.raised};padding:9px 20px;color:${colors.muted}}
		.me{margin-left:auto;width:34px;height:34px;border-radius:50%;background:hsl(200,25%,55%)}
		nav{width:${menuWidth}px;flex:none;padding:16px 12px;height:898px;border-right:1px solid ${colors.line}}
		nav .btn{display:inline-block;background:${accent};color:#fff;border-radius:14px;padding:12px 20px;font-weight:600;margin:0 0 16px 6px}
		nav div{padding:7px 14px;border-radius:16px;color:${colors.muted};font-size:14px}nav div.on{background:${colors.raised};color:${colors.text};font-weight:600}
		main{flex:1;padding:18px 24px;overflow:hidden}.card{background:${colors.panel};border:1px solid ${colors.line};border-radius:12px}`;
	return page(css, `<header><div class="logo"><i></i>${brand}</div><div class="search">${search}</div><div class="me"></div></header>
		<div class="row"><nav>${button ? `<span class="btn">${button}</span>` : ''}${menu.map((m, i) => `<div class="${i ? '' : 'on'}">${m}</div>`).join('')}</nav><main>${main}</main></div>`);
}

/** Rows of a list: [avatar hue, bold part, the rest, right column]; the first `unread` rows are bold. */
const listRows = (colors, rows, unread = 0) => rows.map((r, i) => `<div style="display:flex;gap:14px;align-items:center;padding:11px 8px;border-bottom:1px solid ${colors.line};${i < unread ? '' : `color:${colors.muted}`}">
	<div style="width:30px;height:30px;border-radius:50%;flex:none;background:hsl(${r[0]},26%,${colors === DARK ? 42 : 72}%)"></div>
	<div style="width:180px;flex:none;${i < unread ? 'font-weight:600' : ''}">${r[1]}</div><div style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r[2]}</div>
	<div style="width:90px;text-align:right;font-size:13px;color:${colors.muted}">${r[3]}</div></div>`).join('');

/** A grid of pictures with a caption under each: items [[sky hue, land hue, caption, small text]]. */
const mediaGrid = (colors, items, columns, height, seed) => `<div style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:18px 14px">${items.map((m, i) =>
	`<div><div class="ph" style="height:${height}px">${photo(m[0], m[1], seed + i)}</div>${m[2] ? `<div style="margin-top:8px;font-size:15px;line-height:1.3">${m[2]}</div><div style="font-size:13px;color:${colors.muted}">${m[3] || ''}</div>` : ''}</div>`).join('')}</div>`;

/** Number cards: [[label, value, note]]. */
const statCards = (colors, stats) => `<div style="display:grid;grid-template-columns:repeat(${stats.length},1fr);gap:14px;margin-bottom:18px">${stats.map(s =>
	`<div class="card" style="padding:14px 16px"><div style="font-size:13px;color:${colors.muted}">${s[0]}</div><div style="font-size:30px;font-weight:600">${s[1]}</div><div style="font-size:13px;color:${colors.muted}">${s[2] || ''}</div></div>`).join('')}</div>`;

/** A table in a card: head and rows (arrays of cells); a cell starting with "●" is a coloured status. */
const table = (colors, head, rows) => `<div class="card" style="overflow:hidden;font-size:14px"><div style="display:flex;padding:10px 16px;background:${colors.raised};font-weight:600">${head.map((h, i) =>
	`<span style="flex:${i ? 1 : 2}">${h}</span>`).join('')}</div>${rows.map(r => `<div style="display:flex;padding:9px 16px;border-top:1px solid ${colors.line}">${r.map((v, i) =>
	`<span style="flex:${i ? 1 : 2};${String(v).startsWith('●') ? `color:${/fail|down|stop/i.test(v) ? '#d9706a' : '#5fb98b'}` : ''}">${v}</span>`).join('')}</div>`).join('')}</div>`;

/** A small line chart in a card. */
const chart = (colors, accent, title, seed, height = 200) => {
	let d = '';
	for (let x = 0; x <= 600; x += 20) d += `${x ? 'L' : 'M'}${x} ${(height * .55 + Math.sin(x / 47 + seed) * height * .2 + Math.sin(x / 13 + seed * 3) * height * .08).toFixed(1)} `;
	return `<div class="card" style="padding:14px 16px;margin-bottom:18px"><div style="font-weight:600;margin-bottom:6px">${title}</div><svg viewBox="0 0 600 ${height}" style="width:100%;height:${height}px;display:block">
		${repeat(4, i => `<line x1="0" x2="600" y1="${(i + 1) * height / 5}" y2="${(i + 1) * height / 5}" stroke="${colors.line}"/>`)}
		<path d="${d}L600 ${height} L0 ${height}Z" fill="${accent}" opacity=".18"/><path d="${d}" fill="none" stroke="${accent}" stroke-width="2.5"/></svg></div>`;
};

const MAILS = [[210, 'Ana Kovač', 'Photos from the weekend — the light on the lake was amazing on Sunday', '09:41'], [150, 'Hiking Club', 'Saturday route: Mosor ridge — we meet at 7:30 at the usual place', '08:15'],
	[30, 'Marko', 'Re: Router settings — that worked, the 5 GHz network is stable now', 'Yesterday'], [90, 'City Library', 'Your reservation is ready at the front desk', 'Yesterday'],
	[340, 'Olena', 'Recipe you asked for — varenyky my grandmother\'s way', 'Mon'], [260, 'Bank Notice', 'Your monthly statement is available', 'Mon'],
	[180, 'Ivan Petrenko', 'Conference slides from Tuesday', 'Sun'], [120, 'Garden Store', 'Autumn bulbs are here: tulips, crocus and more', 'Sat'],
	[20, 'Luka', 'Ferry times — the 15:30 is fully booked', 'Fri'], [200, 'Weather Alerts', 'Bura wind warning along the coast', 'Fri'],
	[300, 'Sofia', 'Book club — November: "The Glass Hours"', 'Thu'], [60, 'Photo Lab', 'Your prints have shipped', 'Thu'], [240, 'Hosting', 'Certificate renewed for 3 sites', 'Wed'],
	[100, 'Petro', 'Saturday football at 10?', 'Wed'], [320, 'Museum', 'Members\' evening: new exhibition', 'Tue']];

/** A server status dashboard in the given colours; `name` is its heading. */
const dashboard = (colors, accent, name, seed, rows) => shell(colors, { brand: name, accent, search: 'Search hosts, logs, sites', menu: ['Overview', 'Sites', 'Services', 'Backups', 'Certificates', 'Logs', 'Users', 'Settings'],
	main: statCards(colors, [['Uptime', '42 days', 'since the last update'], ['CPU', `${12 + seed * 3}%`, '2 cores'], ['Memory', `${48 + seed}%`, 'of 4 GB'], ['Disk', `${61 - seed}%`, 'of 80 GB']]) +
		chart(colors, accent, 'Requests per minute, last 24 hours', seed, 180) +
		table(colors, ['Service', 'Status', 'Version', 'Last check'], rows) });

const SERVICES = [['Web server', '● running', '1.26', '1 min ago'], ['PHP pool', '● running', '8.4', '1 min ago'], ['Database', '● running', '11.4', '1 min ago'],
	['Mail relay', '● running', '3.8', '2 min ago'], ['Firewall', '● running', '—', '2 min ago'], ['Backup job', '● running', 'nightly', '6 h ago'], ['Old forum', '● stopped', '2.1', '3 days ago']];

const DARK_SITES = {
	mail: { title: 'Mailbox', url: 'https://mailbox.example/', html: shell(DARK, { brand: 'Mailbox', accent: '#c25b4f', search: 'Search mail', button: '✎ Compose',
		menu: ['Inbox', 'Starred', 'Snoozed', 'Sent', 'Drafts', 'Travel', 'Receipts', 'More'], main: listRows(DARK, MAILS, 4) }) },

	drive: { title: 'Drive', url: 'https://drive.example/', html: shell(DARK, { brand: 'Drive', accent: '#3f7fc9', search: 'Search in Drive', button: '+ New',
		menu: ['Home', 'My files', 'Shared with me', 'Recent', 'Starred', 'Trash', 'Storage'],
		main: `<div style="font-size:24px;margin:4px 0 16px">Welcome to Drive</div><div style="font-size:14px;color:${DARK.muted};margin-bottom:10px">Suggested files</div>
			<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px">${['Budget 2026', 'Trip plan', 'Garden beds', 'Club members'].map((n, i) =>
			`<div class="card" style="overflow:hidden"><div style="height:120px;background:${['#2f4a3a', '#3a3550', '#4a3e2c', '#2c3f52'][i]}"></div><div style="padding:10px 12px;font-size:14px">${n}</div></div>`).join('')}</div>` +
			table(DARK, ['Name', 'Owner', 'Modified', 'Size'], [['Finances 2026.xlsx', 'me', 'Nov 18', '84 KB'], ['Photos for the album', 'me', 'Nov 12', '—'], ['Router manual.pdf', 'Marko', 'Oct 30', '2.1 MB'],
				['Recipes.docx', 'Olena', 'Oct 21', '120 KB'], ['Taxes', 'me', 'Oct 2', '—'], ['Club schedule.xlsx', 'Hiking Club', 'Sep 28', '36 KB']]) }) },

	translate: { title: 'Translate', url: 'https://translate.example/', html: shell(DARK, { brand: 'Translate', accent: '#4f8fd9', search: 'Search', menuWidth: 160, menu: ['Text', 'Images', 'Documents', 'Websites'],
		main: `<div style="display:flex;gap:10px;margin:6px 0 14px;font-size:14px">${['Detect language', 'Ukrainian', 'English', 'Croatian'].map((l, i) => `<span style="padding:6px 14px;border-radius:16px;${i == 1 ? 'background:#2c3f5c;color:#9cc2f2' : `color:${DARK.muted}`}">${l}</span>`).join('')}
			<span style="margin-left:auto;padding:6px 14px;border-radius:16px;background:#2c3f5c;color:#9cc2f2">English</span></div>
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><div class="card" style="height:300px;padding:20px;font-size:24px;line-height:1.4">Доброго ранку! Чи можна забронювати столик на чотирьох на суботу о сьомій вечора?</div>
			<div class="card" style="height:300px;padding:20px;font-size:24px;line-height:1.4;background:${DARK.raised}">Good morning! Can I book a table for four on Saturday at seven in the evening?</div></div>
			<div style="margin-top:22px;font-size:14px;color:${DARK.muted}">History</div>${listRows(DARK, [[210, 'Dobar dan', 'Good afternoon', 'Croatian'], [30, 'Дякую за допомогу', 'Thank you for your help', 'Ukrainian'], [150, 'Gdje je trajekt?', 'Where is the ferry?', 'Croatian']])}` }) },

	photos: { title: 'Photos', url: 'https://photos.example/', html: shell(DARK, { brand: 'Photos', accent: '#d08a3c', search: 'Search your photos', menuWidth: 200, menu: ['Photos', 'Explore', 'Sharing', 'Albums', 'Favourites', 'Archive'],
		main: `<div style="font-size:22px;margin:2px 0 4px">July 2021</div><div style="font-size:13px;color:${DARK.muted};margin-bottom:12px">Fri, 2 Jul · Lake Bled</div>` +
			mediaGrid(DARK, [[200, 150], [30, 30], [210, 190], [40, 90], [190, 140], [220, 200], [30, 160], [200, 210]], 4, 180, 60) +
			`<div style="font-size:13px;color:${DARK.muted};margin:16px 0 12px">Sat, 3 Jul · Vintgar gorge</div>` + mediaGrid(DARK, [[180, 120], [205, 150], [35, 40], [210, 170]], 4, 180, 70) }) },

	video: { title: 'Streamly', url: 'https://streamly.example/', html: shell(DARK, { brand: 'Streamly', accent: '#c94b4b', search: 'Search', menuWidth: 90, menu: ['⌂', '◷', '▤', '♡'],
		main: `<div style="display:flex;gap:10px;margin-bottom:16px">${['All', 'Gaming', 'Travel', 'Live', 'Music', 'Cooking', 'Science', 'Recently uploaded'].map((c, i) =>
			`<span style="background:${i ? DARK.raised : DARK.text};color:${i ? DARK.text : DARK.background};border-radius:8px;padding:6px 14px;font-size:14px">${c}</span>`).join('')}</div>` +
			mediaGrid(DARK, [[230, 260, 'Night sky over the mountains, 4K timelapse', 'Dark Skies · 210K views'], [30, 30, 'Sourdough for beginners, step by step', 'Bake at Home · 88K views'],
				[200, 140, 'Walking the old coast road', 'Slow Roads · 47K views'], [260, 220, 'Ten guitar chords in a week', 'String Notes · 1.2M views'],
				[45, 25, 'Restoring a 1960s radio', 'Workbench · 330K views'], [190, 210, 'How glaciers shape valleys', 'Earth Explained · 95K views'],
				[35, 30, 'Autumn forest sounds, 3 hours', 'Calm Places · 2M views'], [170, 160, 'Building a kayak from plywood', 'Workbench · 61K views']], 4, 165, 9) }) },

	music: { title: 'Tunes', url: 'https://tunes.example/', html: shell(DARK, { brand: 'Tunes', accent: '#8a5cc2', search: 'Search songs, albums, artists', menuWidth: 200, menu: ['Home', 'Explore', 'Library', 'Morning coffee', 'Long drive', 'Rainy day piano'],
		main: `<div class="ph" style="height:250px;position:relative">${photo(275, 255, 41)}<div style="position:absolute;left:26px;bottom:22px;color:#fff"><div style="font-size:14px;opacity:.85">Mira Holm</div><div style="font-size:40px;font-weight:600">Listen again</div></div></div>
			<div style="font-size:18px;font-weight:600;margin:18px 0 12px">Quick picks</div>` +
			mediaGrid(DARK, [[270, 250, 'Still Water', 'Quiet Rooms'], [20, 30, 'Harbour Lights', 'Paper Boats'], [200, 210, 'Window Seat', 'North Letters'], [320, 280, 'Small Hours', 'Grey Morning'], [40, 30, 'Lantern', 'Paper Boats']], 5, 150, 80) }) },

	vault: { title: 'Vault', url: 'https://vault.example/', html: shell(DARK, { brand: 'Vault', accent: '#3d8f7a', search: 'Search entries', menuWidth: 210, menu: ['All entries', 'Favourites', 'Email', 'Banking', 'Servers', 'Shopping', 'Notes', 'Trash'],
		main: `<div style="display:flex;gap:18px"><div style="width:340px">${['Mailbox', 'Hosting panel', 'Router admin', 'Cloud drive', 'Library card', 'Ferry tickets', 'Photo lab', 'Code host', 'Wi-Fi guest'].map((n, i) =>
			`<div style="display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:8px;${i == 1 ? 'background:#24453c' : ''}"><div style="width:30px;height:30px;border-radius:7px;background:hsl(${i * 47 % 360},30%,40%)"></div><div><div>${n}</div><div style="font-size:13px;color:${DARK.muted}">${['ana', 'admin', 'admin', 'olena', '0412…', 'luka', 'ana', 'olena', 'guest'][i]}</div></div></div>`).join('')}</div>
			<div class="card" style="flex:1;padding:22px"><div style="font-size:26px;font-weight:600;margin-bottom:18px">Hosting panel</div>${[['User name', 'admin'], ['Password', '••••••••••••••'], ['Website', 'panel.hosting.example'], ['Two-step code', '482 913'], ['Notes', 'Renew the plan in March'], ['Modified', '12 Nov 2026']].map(f =>
			`<div style="padding:10px 0;border-bottom:1px solid ${DARK.line}"><div style="font-size:13px;color:${DARK.muted}">${f[0]}</div><div style="font-size:17px">${f[1]}</div></div>`).join('')}</div></div>` }) },

	cloud: { title: 'Cloud Files', url: 'https://cloudfiles.example/', html: shell(DARK, { brand: 'Cloud Files', accent: '#3a76c4', search: 'Search everything', button: '+ Add new', menu: ['My files', 'Recent', 'Photos', 'Shared', 'Recycle bin'],
		main: `<div style="font-size:22px;margin:2px 0 14px">My files</div>` + table(DARK, ['Name', 'Modified', 'File size', 'Sharing'], [
			['<span style="color:#e6b450">▰</span> Attachments', 'Nov 3', '12 items', 'Private'], ['<span style="color:#e6b450">▰</span> Documents', 'Oct 28', '84 items', 'Private'],
			['<span style="color:#e6b450">▰</span> Music', 'Oct 2', '310 items', 'Private'], ['<span style="color:#e6b450">▰</span> Pictures', 'Nov 19', '2,410 items', 'Shared'],
			['<span style="color:#e6b450">▰</span> Backups', 'Nov 20', '31 items', 'Private'], ['<span style="color:#e6b450">▰</span> Projects', 'Nov 15', '18 items', 'Private'],
			['<span style="color:#8fb3e0">▤</span> Car insurance.pdf', 'Sep 9', '420 KB', 'Private'], ['<span style="color:#8fb3e0">▤</span> Flat plan.png', 'Aug 30', '1.4 MB', 'Shared'],
			['<span style="color:#8fb3e0">▤</span> Notes.txt', 'Aug 2', '3 KB', 'Private']]) }) },

	server: { title: 'Server panel', url: 'https://panel.myserver.example/', html: dashboard(LIGHT, '#3f7fc9', 'Server panel', 1, SERVICES) },

	router: { title: 'Router', url: 'http://192.168.1.1/', html: shell(DARK, { brand: 'Router', accent: '#5a8f5a', search: 'Find a setting', menu: ['Overview', 'Internet', 'Wi-Fi', 'Devices', 'Port forwarding', 'Firewall', 'System'],
		main: statCards(DARK, [['Internet', 'Online', 'fibre, 500/100'], ['Devices', '14', '9 on Wi-Fi'], ['Wi-Fi 5 GHz', 'Channel 44', '80 MHz']]) +
			table(DARK, ['Device', 'Address', 'Connection', 'Status'], [['Desktop PC', '192.168.1.20', 'Cable', '● online'], ['Laptop', '192.168.1.31', '5 GHz', '● online'],
				['Old phone (hub)', '192.168.1.40', '2.4 GHz', '● online'], ['Printer', '192.168.1.50', '2.4 GHz', '● online'], ['TV', '192.168.1.60', 'Cable', '● down'], ['Guest phone', '192.168.2.11', 'Guest', '● online']]) }) },

	addons: { title: 'Add-on Hub', url: 'https://addonhub.example/developers/', html: page(`body{background:#f4f6f8}.top{height:150px;background:#2d8fd5;color:#fff;padding:26px 40px}.top h1{font-size:36px;font-weight:600}
		.wrap{padding:22px 40px}.card{background:#fff;border:1px solid #e1e4e8;border-radius:10px;padding:18px 20px;margin-bottom:14px;display:flex;gap:18px;align-items:center}`,
		`<div class="top"><div style="font-size:14px;opacity:.85">Add-on Hub</div><h1>Developer Hub</h1><div style="opacity:.9">Manage my submissions</div></div><div class="wrap">${[['Speed tiles', 'Approved · version 0.6.0', '1,240 users'],
			['Tab notes', 'Awaiting review · version 1.2', '310 users'], ['Calm reader', 'Approved · version 2.0.1', '4,870 users']].map((a, i) =>
			`<div class="card"><div style="width:56px;height:56px;border-radius:12px;background:hsl(${[150, 210, 30][i]},35%,55%)"></div><div style="flex:1"><div style="font-size:18px;font-weight:600">${a[0]}</div><div class="muted">${a[1]}</div></div><div class="muted">${a[2]}</div><span style="border:1px solid #2d8fd5;color:#2d8fd5;border-radius:6px;padding:6px 14px">Edit listing</span></div>`).join('')}</div>`) },

	repo: { title: 'Repo', url: 'https://repo.example/', html: shell(DARK, { brand: 'Repo', accent: '#7a7f88', search: 'Type / to search', menu: ['Home', 'Issues', 'Pull requests', 'Projects', 'Explore'],
		main: `<div style="font-size:22px;margin:4px 0 16px">Good afternoon, Olena</div><div class="card" style="padding:14px 16px;margin-bottom:16px;color:${DARK.muted}">Ask anything or type a command</div>` +
			table(DARK, ['Recent activity', 'Repository', 'When'], [['Merged: frost dates for the coast', 'garden-planner', '2 h'], ['Opened: offline mode', 'garden-planner', '5 h'],
				['Release 0.6.0', 'speed-tiles', 'yesterday'], ['Pushed 3 commits to develop', 'speed-tiles', 'yesterday'], ['Starred calm-reader', 'calm-reader', 'Mon'], ['Closed: dark mode colours', 'speed-tiles', 'Sun']]) }) },

	secureMail: { title: 'Secure Mail', url: 'https://securemail.example/', html: shell(DARK, { brand: 'Secure Mail', accent: '#6d4aff', search: 'Search messages', button: 'New message',
		menu: ['Inbox', 'Drafts', 'Sent', 'Starred', 'Archive', 'Spam', 'Mailing lists'], main: listRows(DARK, MAILS.slice(5).concat(MAILS.slice(0, 5)), 3) }) },

	assistant: { title: 'Assistant', url: 'https://assistant.example/', html: page(`body{background:#262624;color:#e8e6df;display:flex}nav{width:250px;background:#1f1e1d;height:960px;padding:18px 14px}
		nav div{padding:7px 10px;border-radius:8px;color:#b5b2a8;font-size:14px}main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px}
		.box{width:640px;height:110px;border:1px solid #45443f;border-radius:18px;background:#30302e;padding:16px 20px;color:#8f8c84}`,
		`<nav><div style="color:#e8e6df;font-weight:600;font-size:17px;margin-bottom:14px">✳ Assistant</div><div>+ New chat</div><div>Chats</div><div>Projects</div><div style="margin-top:16px;font-size:12px">Recent</div>${['Router port forwarding', 'Sourdough timing', 'Ferry timetable', 'Photo album layout', 'Garden planner tests', 'Letter to the library'].map(t => `<div>${t}</div>`).join('')}</nav>
		<main><div style="font:400 36px Georgia,serif">Good afternoon, Olena</div><div class="box">How can I help you today?</div><div style="display:flex;gap:10px;font-size:14px">${['Write', 'Learn', 'Code', 'Plan a trip'].map(t => `<span style="border:1px solid #45443f;border-radius:10px;padding:6px 14px">${t}</span>`).join('')}</div></main>`) }
};

// The pages of the "Servers" folder: dashboards in both colours
const SERVER_PAGES = [['backup', 'Backup server', DARK, '#5a8f9a'], ['monitor', 'Monitoring', DARK, '#c28a3c'], ['webStats', 'Web statistics', LIGHT, '#3f9a6a'],
	['dns', 'DNS zones', LIGHT, '#7a5fc2'], ['logs', 'Log viewer', DARK, '#5f7fc2'], ['mailQueue', 'Mail queue', DARK, '#c25b72']];
SERVER_PAGES.forEach(([key, title, colors, accent], i) => {
	DARK_SITES[key] = { title, url: `https://${key.toLowerCase()}.myserver.example/`, html: dashboard(colors, accent, title, i + 2, SERVICES.slice(i % 3, i % 3 + 5)) };
});

module.exports = { DARK_SITES };
