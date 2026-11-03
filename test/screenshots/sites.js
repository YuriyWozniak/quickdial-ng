// Invented websites for the README screenshots (see README.md in this folder).
//
// Each site is a complete HTML page, 1280×960, in soft colours. make-screenshots.js renders it in
// Chromium and stores the capture as the tile's picture, the way Quick Dial NG captures a real page,
// so the tiles show real text and layout. Everything is made up: no real brands, logos, people or photos.
//
// Exports
//   SITES      [{ title, url, html }]  in the order they fill the grid
//   WALLPAPER  html of a 1920×1200 background picture (dusk over mountains)
//
// To add a site: append { title, url, html: page(css, body) } to SITES. Keep colours muted
// (low saturation, light backgrounds) and use photo() for pictures.
'use strict';

/**
 * A soft stand-in for a photo: sky gradient, sun and three layers of hills, as inline SVG that fills its box.
 * @param {number} h      hue of the sky (0–360)
 * @param {number} g      hue of the land
 * @param {number} seed   varies the hill shapes and sun position; also makes the gradient id unique
 * @param {string} extra  more SVG drawn on top (in the 400×300 view box), e.g. a lighthouse
 */
function photo(h, g, seed = 1, extra = '') {
	const hill = (y, amp, light, k) => {
		let d = `M0 ${y}`;
		for (let x = 0; x <= 400; x += 25) d += ` L${x} ${(y + Math.sin(x / (40 + k * 13) + seed * k) * amp + Math.sin(x / 17 + seed) * amp * .25).toFixed(1)}`;
		return `<path d="${d} L400 300 L0 300Z" fill="hsl(${g},${18 + k * 4}%,${light}%)"/>`;
	};
	return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;display:block">
		<defs><linearGradient id="s${seed}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h},38%,78%)"/><stop offset="1" stop-color="hsl(${h + 25},45%,90%)"/></linearGradient></defs>
		<rect width="400" height="300" fill="url(#s${seed})"/><circle cx="${90 + seed * 47 % 220}" cy="${95 + seed * 13 % 40}" r="26" fill="hsl(${h + 30},70%,95%)" opacity=".8"/>
		${hill(170, 22, 66, 1)}${hill(205, 18, 52, 2)}${hill(245, 14, 40, 3)}${extra}</svg>`;
}

const BASE = `*{box-sizing:border-box;margin:0;padding:0}body{width:1280px;height:960px;overflow:hidden;font:15px/1.5 "Segoe UI",system-ui,sans-serif;color:#2a2f36;background:#fff}
	.row{display:flex}.muted{color:#7b828c}.ph{border-radius:10px;overflow:hidden}b{font-weight:600}`;
/** A full page: the shared base styles, the site's own CSS, and its body HTML. */
const page = (css, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}${css}</style></head><body>${body}</body></html>`;
/** f(0) + f(1) + … + f(n-1) as one string. */
const repeat = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');

// The sites in grid order. url is what the tile's bookmark points to (shown in Properties).
const SITES = [
	{ title: 'Inbox', url: 'https://mailbox.example/', html: page(`
		header{height:64px;display:flex;align-items:center;gap:20px;padding:0 24px;border-bottom:1px solid #e6e9ee;background:#f7f8fa}
		.logo{font-weight:700;font-size:20px;color:#3f5f8a;width:200px}.search{flex:1;max-width:620px;height:40px;border-radius:20px;background:#eceff3;padding:9px 18px;color:#8a919b}
		nav{width:230px;padding:18px 14px;background:#f7f8fa;height:896px}.compose{background:#dfe7f2;color:#2f4b70;border-radius:14px;padding:14px 20px;font-weight:600;width:150px;margin-bottom:18px}
		nav div.i{padding:7px 14px;border-radius:16px;color:#4a525c}nav div.on{background:#e3e9f2;font-weight:600;color:#2f4b70}
		main{flex:1}.m{display:flex;gap:16px;padding:13px 22px;border-bottom:1px solid #eef0f3;align-items:center}.m.u{background:#fff}.m:not(.u){background:#fafbfc;color:#5d646e}
		.av{width:34px;height:34px;border-radius:50%;flex:none}.from{width:170px;flex:none}.subj{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.t{width:60px;text-align:right;font-size:13px;color:#8a919b}`,
		`<header><div class="logo">✉ Mailbox</div><div class="search">Search mail</div></header><div class="row"><nav><div class="compose">✎ Compose</div>
		<div class="i on">Inbox <span style="float:right">4</span></div><div class="i">Starred</div><div class="i">Snoozed</div><div class="i">Sent</div><div class="i">Drafts</div><div class="i">Travel</div><div class="i">Receipts</div></nav><main>` +
		[['Ana Kovač', 'Photos from the weekend', 'Here are the ones from the lake, the light was amazing on Sunday…', '09:41', 210],
		 ['Hiking Club', 'Saturday route: Mosor ridge', 'We meet at 7:30 at the usual place. Bring water and…', '08:15', 150],
		 ['Marko', 'Re: Router settings', 'That worked, thanks! The 5 GHz network is stable now…', 'Yesterday', 30],
		 ['City Library', 'Your reservation is ready', 'The book you reserved is waiting at the front desk until…', 'Yesterday', 90],
		 ['Olena', 'Recipe you asked for', 'Varenyky with potatoes and mushrooms, my grandmother\'s way…', 'Mon', 340],
		 ['Bank Notice', 'Monthly statement available', 'Your statement for October is now available online…', 'Mon', 260],
		 ['Ivan Petrenko', 'Conference slides', 'Attached are the slides from Tuesday. Let me know if…', 'Sun', 180],
		 ['Garden Store', 'Autumn bulbs are here', 'Plant now for spring colour: tulips, crocus and…', 'Sat', 120],
		 ['Luka', 'Ferry times', 'The 15:30 ferry is fully booked, the next one is at…', 'Fri', 20],
		 ['Weather Alerts', 'Bura wind warning', 'Strong north wind expected along the coast from…', 'Fri', 200],
		 ['Sofia', 'Book club – November', 'We are reading "The Glass Hours" this month…', 'Thu', 300],
		 ['Photo Lab', 'Your prints have shipped', 'Order 4412 is on its way and should arrive by…', 'Thu', 60]]
		.map((m, i) => `<div class="m ${i < 4 ? 'u' : ''}"><div class="av" style="background:hsl(${m[4]},28%,72%)"></div><div class="from">${i < 4 ? '<b>' + m[0] + '</b>' : m[0]}</div><div class="subj">${i < 4 ? '<b>' + m[1] + '</b>' : m[1]} <span class="muted">— ${m[2]}</span></div><div class="t">${m[3]}</div></div>`).join('') + '</main></div>') },

	{ title: 'Morning Post', url: 'https://morningpost.example/', html: page(`
		body{background:#fbfaf7;font-family:Georgia,"Times New Roman",serif;color:#26292d}.top{text-align:center;padding:22px 0 8px}.top h1{font-size:54px;font-weight:700;letter-spacing:-.5px}
		.date{display:flex;justify-content:space-between;font:13px "Segoe UI",sans-serif;color:#6b6f75;border-top:3px double #26292d;border-bottom:1px solid #26292d;margin:10px 40px 0;padding:8px 0}
		.cols{display:grid;grid-template-columns:2fr 1fr;gap:34px;padding:26px 40px}.lead h2{font-size:38px;line-height:1.15;margin:16px 0 10px}.lead p,.side p{color:#4a4f56;font-size:17px}
		.side .s{display:flex;gap:14px;padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid #dedad2}.side h3{font-size:19px;line-height:1.25}.kick{font:600 12px "Segoe UI",sans-serif;letter-spacing:.08em;color:#8b5e3c;text-transform:uppercase}`,
		`<div class="top"><h1>The Morning Post</h1></div><div class="date"><span>Tuesday, 3 November</span><span>World · Science · Culture · Travel · Opinion</span><span>Subscribe</span></div>
		<div class="cols"><div class="lead"><div class="ph" style="height:360px">${photo(205, 150, 3)}</div><div class="kick" style="margin-top:16px">Environment</div>
		<h2>Coastal towns plant a mile of dunes to hold back winter storms</h2><p>Volunteers and engineers worked through the autumn to rebuild the sand barriers that protect three villages, using grasses that once grew along the whole shore.</p></div>
		<div class="side">${[['Science', 'A quiet comet returns after 400 years', 40, 210], ['Culture', 'The small cinema that refused to close', 18, 30], ['Travel', 'Slow trains through the mountains', 120, 100], ['Food', 'Why autumn soups taste better', 30, 40]]
		.map((s, i) => `<div class="s"><div class="ph" style="width:120px;height:86px;flex:none">${photo(s[2], s[3], i + 5)}</div><div><div class="kick">${s[0]}</div><h3>${s[1]}</h3></div></div>`).join('')}</div></div>`) },

	{ title: 'Streamly', url: 'https://streamly.example/', html: page(`
		body{background:#f6f6f7}header{height:64px;display:flex;align-items:center;gap:24px;padding:0 28px;background:#fff;border-bottom:1px solid #e7e7ea}
		.logo{font-weight:700;font-size:21px;color:#b0504f}.search{flex:1;max-width:560px;height:40px;border:1px solid #dcdce0;border-radius:20px;padding:9px 18px;color:#8b8b95}
		.chips{display:flex;gap:10px;padding:16px 28px}.chips span{background:#e9e9ec;border-radius:8px;padding:6px 14px;font-size:14px}.chips span:first-child{background:#3a3d42;color:#fff}
		.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:22px 18px;padding:4px 28px}.v .ph{height:162px;position:relative}.d{position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.65);color:#fff;font-size:12px;padding:1px 6px;border-radius:4px}
		.v h4{font-size:15px;margin-top:9px;line-height:1.3}.v p{font-size:13px;color:#7b7f88}`,
		`<header><div class="logo">▶ Streamly</div><div class="search">Search</div></header><div class="chips"><span>All</span><span>Travel</span><span>Cooking</span><span>Music</span><span>Nature</span><span>Science</span><span>Woodworking</span></div><div class="grid">` +
		[['Walking the old Dalmatian coast road', 'Slow Roads', '24:10'], ['Sourdough for beginners, step by step', 'Bake at Home', '18:42'], ['Night sky timelapse, Velebit', 'Dark Skies', '6:05'], ['Restoring a 1960s radio', 'Workbench', '41:27'],
		 ['Learn ten guitar chords in a week', 'String Notes', '15:30'], ['How glaciers shape valleys', 'Earth Explained', '12:18'], ['Autumn forest sounds, 3 hours', 'Calm Places', '3:00:00'], ['Building a kayak from plywood', 'Workbench', '33:51']]
		.map((v, i) => `<div class="v"><div class="ph">${photo([200, 30, 230, 45, 260, 190, 35, 170][i], [140, 30, 220, 25, 200, 210, 30, 160][i], i + 9)}<span class="d">${v[2]}</span></div><h4>${v[0]}</h4><p>${v[1]} · ${(i * 37 % 90) + 8}K views</p></div>`).join('') + '</div>') },

	{ title: 'Repo', url: 'https://repo.example/', html: page(`
		header{height:60px;display:flex;align-items:center;gap:16px;padding:0 28px;background:#f6f8fa;border-bottom:1px solid #d8dee4}.logo{font-weight:700;font-size:18px}
		.wrap{padding:22px 40px}.name{font-size:22px}.name a{color:#3d6ea8}.tabs{display:flex;gap:26px;margin:16px 0 20px;border-bottom:1px solid #d8dee4;font-size:14px}.tabs span{padding-bottom:10px}.tabs .on{border-bottom:2px solid #c9805a;font-weight:600}
		.box{border:1px solid #d8dee4;border-radius:8px;overflow:hidden}.bar{background:#f6f8fa;padding:12px 16px;font-size:14px;display:flex;justify-content:space-between}
		.f{display:flex;padding:9px 16px;border-top:1px solid #eaeef2;font-size:14px}.f .n{width:260px;color:#3d6ea8}.f .c{flex:1;color:#6e7781}.f .w{color:#8c959f}
		.readme{margin-top:22px;border:1px solid #d8dee4;border-radius:8px;padding:20px 26px}.readme h2{font-size:26px;border-bottom:1px solid #eaeef2;padding-bottom:8px;margin-bottom:12px}.readme p{color:#4a525c;margin-bottom:8px}`,
		`<header><div class="logo">◆ Repo</div><span class="muted">Pull requests · Issues · Explore</span></header><div class="wrap"><div class="name"><a>olena</a> / <a><b>garden-planner</b></a> <span class="muted" style="font-size:13px;border:1px solid #d8dee4;border-radius:12px;padding:1px 8px">Public</span></div>
		<div class="tabs"><span class="on">Code</span><span>Issues 6</span><span>Pull requests 2</span><span>Actions</span><span>Wiki</span></div>
		<div class="box"><div class="bar"><span><b>olena</b> Add frost dates for coastal regions</span><span class="muted">2 days ago · 214 commits</span></div>` +
		[['📁 src', 'Move the calendar view into its own module'], ['📁 data', 'Add frost dates for coastal regions'], ['📁 tests', 'Cover sowing windows for the north'], ['📄 .gitignore', 'Initial commit'], ['📄 LICENSE', 'Initial commit'], ['📄 README.md', 'Explain how to add a new region'], ['📄 package.json', 'Update dependencies'], ['📄 planner.config.js', 'Default to metric units']]
		.map((f, i) => `<div class="f"><span class="n">${f[0]}</span><span class="c">${f[1]}</span><span class="w">${['2 days', '2 days', 'last week', '8 months', '8 months', '3 weeks', 'last month', '5 months'][i]} ago</span></div>`).join('') +
		`</div><div class="readme"><h2>Garden planner</h2><p>Plan what to sow and when, based on the frost dates where you live. Works offline and keeps your beds and notes in the browser.</p><p>Add your region in <code>data/regions</code>, then run the tests to check the sowing windows.</p></div></div>`) },

	{ title: 'Weather', url: 'https://weather.example/', html: page(`
		body{background:linear-gradient(#bcd3e6,#e7eef4);color:#2b3a48}.wrap{padding:30px 46px}.top{display:flex;justify-content:space-between}.city{font-size:30px;font-weight:600}
		.now{display:flex;align-items:center;gap:30px;margin:26px 0}.temp{font-size:120px;font-weight:300;line-height:1}.sun{width:110px;height:110px;border-radius:50%;background:#f3d9a4;box-shadow:0 0 0 18px rgba(243,217,164,.35)}
		.card{background:rgba(255,255,255,.55);border-radius:18px;padding:18px 22px;margin-bottom:18px}.hours{display:flex;justify-content:space-between;text-align:center}.hours div{font-size:15px}.hours b{display:block;font-size:20px;margin-top:6px}
		.dot{width:26px;height:26px;border-radius:50%;margin:8px auto 0;background:#f3d9a4}.cl{background:#d9e1e8}.days .d{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(43,58,72,.08)}
		.bar{flex:0 0 280px;height:6px;border-radius:3px;margin-top:10px;background:linear-gradient(90deg,#9fc1d9,#efc98f)}`,
		`<div class="wrap"><div class="top"><div><div class="city">Split</div><div class="muted" style="color:#56687a">Partly cloudy · feels like 16°</div></div><div style="color:#56687a">Tuesday 14:00</div></div>
		<div class="now"><div class="temp">18°</div><div class="sun"></div><div style="color:#56687a;font-size:17px">Wind 12 km/h NE<br>Humidity 58%<br>UV index 2</div></div>
		<div class="card hours">${repeat(8, i => `<div>${14 + i}:00<div class="dot ${i % 3 == 2 ? 'cl' : ''}"></div><b>${[18, 18, 17, 16, 15, 14, 13, 13][i]}°</b></div>`)}</div>
		<div class="card days">${['Today', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => `<div class="d"><span style="width:120px">${d}</span><span class="muted" style="color:#56687a">${[11, 10, 12, 9, 8, 10][i]}°</span><div class="bar"></div><span>${[18, 17, 19, 15, 14, 16][i]}°</span></div>`).join('')}</div></div>`) },

	{ title: 'Atlas Maps', url: 'https://atlasmaps.example/', html: page(`
		body{background:#eef0ea}.panel{position:absolute;left:24px;top:24px;width:380px;background:#fff;border-radius:14px;box-shadow:0 4px 18px rgba(0,0,0,.12);overflow:hidden}
		.panel .s{padding:14px 18px;border-bottom:1px solid #eceee8;color:#7b828c}.panel h3{font-size:22px;padding:16px 18px 2px}.panel p{padding:0 18px;color:#6a7178}.panel .ph{border-radius:0;height:170px}
		.btns{display:flex;gap:10px;padding:14px 18px 18px}.btns span{border:1px solid #cfd6dc;border-radius:18px;padding:5px 14px;font-size:14px;color:#3f5f8a}`,
		`<svg viewBox="0 0 1280 960" style="position:absolute;inset:0"><rect width="1280" height="960" fill="#eef0ea"/>
		<path d="M820 960 C 900 760 1060 700 1280 620 L1280 960Z" fill="#c9dbe6"/><ellipse cx="560" cy="700" rx="210" ry="120" fill="#d5e3cf"/><ellipse cx="1060" cy="230" rx="160" ry="90" fill="#d5e3cf"/>
		${[[0, 300, 1280, 420, 20, '#f3dfb8'], [470, 0, 640, 960, 16, '#fff'], [0, 820, 900, 560, 12, '#fff'], [1000, 0, 860, 960, 12, '#fff'], [300, 0, 380, 960, 8, '#fff'], [0, 130, 1280, 210, 8, '#fff'], [0, 620, 1280, 700, 8, '#fff']]
		.map(r => `<line x1="${r[0]}" y1="${r[1]}" x2="${r[2]}" y2="${r[3]}" stroke="#d9dcd3" stroke-width="${r[4] + 4}" stroke-linecap="round"/><line x1="${r[0]}" y1="${r[1]}" x2="${r[2]}" y2="${r[3]}" stroke="${r[5]}" stroke-width="${r[4]}" stroke-linecap="round"/>`).join('')}
		${repeat(26, i => `<rect x="${(i * 173) % 1180 + 40}" y="${(i * 97) % 880 + 40}" width="${30 + i % 4 * 10}" height="${22 + i % 3 * 10}" rx="3" fill="#e2e4dd"/>`)}
		<circle cx="760" cy="430" r="14" fill="#c25b4f"/><circle cx="760" cy="430" r="5" fill="#fff"/></svg>
		<div class="panel"><div class="s">🔍 Riva promenade</div><div class="ph">${photo(205, 190, 21)}</div><h3>Riva promenade</h3><p>Waterfront walkway · 4.7 ★ (2,310)</p><div class="btns"><span>Directions</span><span>Save</span><span>Share</span></div></div>`) },

	{ title: 'Market', url: 'https://market.example/', html: page(`
		body{background:#faf8f5}header{height:64px;display:flex;align-items:center;gap:24px;padding:0 32px;background:#fff;border-bottom:1px solid #ece7e0}.logo{font-weight:700;font-size:21px;color:#8b6b4a}
		.search{flex:1;max-width:540px;height:40px;border:1px solid #e0d9cf;border-radius:8px;padding:9px 16px;color:#9a9288}h2{font-size:26px;padding:24px 32px 14px}
		.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;padding:0 32px}.p{background:#fff;border:1px solid #eee8df;border-radius:12px;overflow:hidden}.p .img{height:200px;display:grid;place-items:center}
		.p .t{padding:12px 14px 2px;font-size:15px}.p .pr{padding:0 14px 14px;font-weight:700;color:#5d4a36;font-size:17px}`,
		`<header><div class="logo">Market</div><div class="search">Search for anything</div><span class="muted">Sign in · Basket (2)</span></header><h2>Autumn at home</h2><div class="grid">` +
		[['Stoneware mug, sand glaze', 34, 30, '<div style="width:90px;height:100px;background:#d8c8b0;border-radius:8px 8px 22px 22px;position:relative"><div style="position:absolute;right:-26px;top:22px;width:30px;height:46px;border:9px solid #d8c8b0;border-left:0;border-radius:0 22px 22px 0"></div></div>'],
		 ['Linen throw, olive', 59, 90, '<div style="width:150px;height:110px;background:repeating-linear-gradient(90deg,#a7ae8e 0 10px,#b2b99b 10px 20px);border-radius:6px;transform:rotate(-6deg)"></div>'],
		 ['Beeswax candles, set of 3', 18, 40, '<div style="display:flex;gap:12px;align-items:end">' + [120, 90, 70].map(h => `<div style="width:30px;height:${h}px;background:#ead9b1;border-radius:4px"></div>`).join('') + '</div>'],
		 ['Oak serving board', 42, 30, '<div style="width:170px;height:70px;background:#c9a77e;border-radius:35px 12px 12px 35px"></div>'],
		 ['Wool socks, two pairs', 16, 10, '<div style="width:70px;height:120px;background:#c98b80;border-radius:10px 10px 30px 10px"></div>'],
		 ['Ceramic plant pot', 27, 200, '<div style="width:110px;height:90px;background:#9db3b5;border-radius:4px 4px 30px 30px"></div>'],
		 ['Reading lamp, brass', 89, 45, '<div style="position:relative;width:120px;height:140px"><div style="position:absolute;left:30px;top:0;width:70px;height:40px;background:#c9ac70;border-radius:40px 40px 4px 4px"></div><div style="position:absolute;left:62px;top:38px;width:6px;height:90px;background:#b39558"></div><div style="position:absolute;left:35px;bottom:0;width:60px;height:10px;background:#b39558;border-radius:5px"></div></div>'],
		 ['Notebook, recycled paper', 9, 220, '<div style="width:100px;height:130px;background:#8fa1b8;border-radius:4px 10px 10px 4px;border-left:10px solid #7a8ba3"></div>']]
		.map(p => `<div class="p"><div class="img" style="background:hsl(${p[2]},25%,94%)">${p[3]}</div><div class="t">${p[0]}</div><div class="pr">€${p[1]}</div></div>`).join('') + '</div>') },

	{ title: 'Lighthouse – Wiki', url: 'https://wikinotes.example/', html: page(`
		body{display:flex;background:#f8f9fa}nav{width:210px;padding:24px 18px;font-size:14px}nav .logo{width:110px;height:110px;border-radius:50%;background:#e4e6e9;margin:0 auto 24px}nav div{color:#3d6ea8;margin-bottom:7px}
		main{flex:1;background:#fff;border-left:1px solid #e2e5e8;padding:24px 40px}h1{font:400 38px Georgia,serif;border-bottom:1px solid #c8ccd1;padding-bottom:6px}.from{font-size:13px;color:#6a7178;margin:6px 0 16px}
		.box{float:right;width:300px;border:1px solid #c8ccd1;background:#f8f9fa;margin:0 0 14px 22px;font-size:13px}.box .ph{border-radius:0;height:220px}.box td{padding:4px 8px;vertical-align:top}
		p{margin-bottom:12px;font-size:16px;line-height:1.6;color:#202122}h2{font:400 26px Georgia,serif;border-bottom:1px solid #c8ccd1;margin:14px 0 8px}a{color:#3d6ea8}`,
		`<nav><div class="logo"></div><div>Main page</div><div>Contents</div><div>Current events</div><div>Random article</div><div>About</div><div style="margin-top:16px">Help</div><div>Community</div></nav>
		<main><h1>Lighthouse</h1><div class="from">From Wiki Notes, the free encyclopedia</div><div class="box"><div class="ph">${photo(200, 210, 31, '<rect x="290" y="70" width="26" height="140" fill="#f4efe6"/><rect x="290" y="100" width="26" height="18" fill="#b7726a"/><rect x="290" y="150" width="26" height="18" fill="#b7726a"/><rect x="284" y="58" width="38" height="16" fill="#5b6470"/>')}</div><table><tr><td><b>Type</b></td><td>Navigational aid</td></tr><tr><td><b>First built</b></td><td>c. 280 BC</td></tr><tr><td><b>Light source</b></td><td>LED, formerly oil lamps</td></tr></table></div>
		<p>A <b>lighthouse</b> is a tower, building or other structure designed to emit light from a system of lamps and lenses, serving as a <a>navigational aid</a> for maritime pilots at sea or on inland waterways.</p>
		<p>Lighthouses mark dangerous coastlines, hazardous shoals, reefs and rocks, and safe entries to harbours; they can also assist in <a>aerial navigation</a>. Once widely used, the number of operational lighthouses has declined because of the expense of maintenance and the arrival of modern electronic systems.</p>
		<h2>History</h2><p>Before the development of clearly defined ports, mariners were guided by fires built on hilltops. Since elevating the fire would improve visibility, placing the fire on a platform became a practice that led to the development of the lighthouse.</p>
		<p>In antiquity, the lighthouse functioned more as an entrance marker to ports than as a warning signal for reefs and promontories, unlike many modern lighthouses.</p></main>`) },

	{ title: 'Calendar', url: 'https://calendar.example/', html: page(`
		header{height:64px;display:flex;align-items:center;gap:22px;padding:0 26px;border-bottom:1px solid #e6e8eb}.logo{font-weight:700;font-size:20px;color:#4f7a6f}
		.btn{border:1px solid #d6dadf;border-radius:6px;padding:5px 14px;font-size:14px}.wk{display:grid;grid-template-columns:64px repeat(7,1fr)}.dh{text-align:center;padding:10px 0;border-bottom:1px solid #e6e8eb;font-size:13px;color:#6a7178}.dh b{display:block;font-size:24px;color:#2a2f36;font-weight:400}
		.h{height:84px;border-bottom:1px solid #f0f1f3;border-right:1px solid #f0f1f3;position:relative}.lbl{font-size:12px;color:#8a919b;text-align:right;padding-right:8px}
		.e{position:absolute;left:4px;right:4px;border-radius:6px;padding:5px 8px;font-size:13px;line-height:1.3}`,
		`<header><div class="logo">▦ Calendar</div><span class="btn">Today</span><span style="font-size:22px">November 2026</span></header><div class="wk"><div></div>` +
		['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `<div class="dh">${d}<b ${i == 1 ? 'style="color:#fff;background:#4f7a6f;border-radius:50%;width:40px;height:40px;line-height:40px;margin:2px auto 0"' : ''}>${2 + i}</b></div>`).join('') +
		repeat(10, r => `<div class="h lbl">${8 + r}:00</div>` + repeat(7, c => {
			const ev = { '0,1': ['Team stand-up', 145, 40], '1,3': ['Dentist', 15, 84], '2,0': ['Project review', 210, 120], '3,4': ['Lunch with Ana', 35, 70], '4,2': ['Yoga', 100, 84], '5,1': ['Call with Ivan', 210, 50], '2,5': ['Farmers market', 80, 140], '6,3': ['Code review', 260, 84], '7,6': ['Family dinner', 15, 120], '1,5': ['Ferry to Hvar', 190, 160], '8,0': ['Gym', 100, 70], '6,1': ['Library', 35, 60] }[r + ',' + c];
			return `<div class="h">${ev ? `<div class="e" style="top:6px;height:${ev[2]}px;background:hsl(${ev[1]},32%,88%);border-left:3px solid hsl(${ev[1]},30%,55%);color:hsl(${ev[1]},30%,25%)"><b>${ev[0]}</b><br>${8 + r}:00</div>` : ''}</div>`; })) + '</div>') },

	{ title: 'Tunes', url: 'https://tunes.example/', html: page(`
		body{display:flex;background:#f5f4f7}nav{width:230px;padding:24px 20px;background:#efedf2;height:960px}.logo{font-weight:700;font-size:21px;color:#6d5a8f;margin-bottom:26px}nav div{margin-bottom:10px;color:#565062}
		main{flex:1;padding:28px 34px}.hero{display:flex;gap:28px;align-items:end;margin-bottom:26px}.hero .ph{width:220px;height:220px}.hero h1{font-size:44px;line-height:1.1}
		.tr{display:flex;align-items:center;gap:16px;padding:10px 12px;border-radius:8px;font-size:15px}.tr:nth-child(odd){background:#fff}.n{width:22px;color:#9a93a6}.tt{flex:1}.al{width:260px;color:#7d7689}.du{width:50px;text-align:right;color:#7d7689}`,
		`<nav><div class="logo">♪ Tunes</div><div><b>Home</b></div><div>Search</div><div>Library</div><div style="margin-top:22px;color:#8a8396">PLAYLISTS</div><div>Morning coffee</div><div>Long drive</div><div>Rainy day piano</div><div>Focus</div></nav>
		<main><div class="hero"><div class="ph">${photo(270, 250, 41)}</div><div><div class="muted">Playlist</div><h1>Rainy day piano</h1><div class="muted" style="margin-top:8px">32 songs · 1 h 54 min</div></div></div><div>` +
		[['Still Water', 'Quiet Rooms'], ['Under the Linden', 'North Letters'], ['Harbour Lights', 'Quiet Rooms'], ['Slow September', 'Paper Boats'], ['Window Seat', 'North Letters'], ['Small Hours', 'Grey Morning'], ['Lantern', 'Paper Boats'], ['After the Rain', 'Grey Morning'], ['Old Photographs', 'Quiet Rooms']]
		.map((t, i) => `<div class="tr"><span class="n">${i + 1}</span><span class="tt"><b>${t[0]}</b><br><span class="muted" style="font-size:13px">Mira Holm</span></span><span class="al">${t[1]}</span><span class="du">${3 + i % 3}:${10 + i * 7 % 50}</span></div>`).join('') + '</div></main>') },

	{ title: 'Photos', url: 'https://photos.example/', html: page(`
		header{height:60px;display:flex;align-items:center;gap:20px;padding:0 26px;border-bottom:1px solid #eceef0}.logo{font-weight:700;font-size:20px;color:#5f7d8c}
		.wrap{padding:18px 26px}h3{font-size:17px;margin:4px 0 10px}.g{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px}.g .ph{border-radius:4px;height:180px}`,
		`<header><div class="logo">◎ Photos</div><span class="muted">Photos · Albums · Shared</span></header><div class="wrap">` +
		[['Saturday, 31 October · Mosor', [260, 200, 320, 180]], ['Sunday, 25 October · Lake Bled', [200, 300, 240, 240]], ['Saturday, 17 October · Home', [300, 220, 260, 200]]]
		.map((s, k) => `<h3>${s[0]}</h3><div class="g">${s[1].map((w, i) => `<div class="ph" style="width:${w}px">${photo([30, 200, 210, 40][(i + k) % 4], [30, 140, 190, 90][(i + k * 2) % 4], 50 + k * 4 + i)}</div>`).join('')}</div>`).join('') + '</div>') },

	{ title: 'Simple Recipes', url: 'https://simplerecipes.example/', html: page(`
		body{background:#fdfbf7;color:#3b332b}header{text-align:center;padding:22px 0 14px;border-bottom:1px solid #ece4d8}header h1{font:700 34px Georgia,serif;color:#6b4f3a}
		header nav{font-size:14px;color:#8b7d6e;margin-top:6px}.wrap{display:grid;grid-template-columns:1.4fr 1fr;gap:32px;padding:26px 44px}
		.hero{height:400px;border-radius:14px;background:radial-gradient(circle at 50% 52%,#f2e3c9 0 120px,#e7d3b2 121px 150px,transparent 151px),#d9c6a7;display:grid;place-items:center}
		.soup{width:200px;height:200px;border-radius:50%;background:radial-gradient(circle at 40% 40%,#e2a66b,#c9824e)}h2{font:700 30px Georgia,serif;margin:16px 0 6px}
		.card{background:#fff;border:1px solid #eee6da;border-radius:12px;padding:18px 20px;margin-bottom:16px}.card li{margin:0 0 6px 18px}.meta{display:flex;gap:18px;color:#8b7d6e;font-size:14px}`,
		`<header><h1>Simple Recipes</h1><nav>Soups · Bread · Vegetables · Desserts · Seasonal</nav></header><div class="wrap"><div><div class="hero"><div class="soup"></div></div><h2>Roasted pumpkin soup with sage</h2>
		<div class="meta"><span>⏱ 45 min</span><span>Serves 4</span><span>★ 4.8 (312)</span></div><p style="margin-top:10px;color:#5d5248">Sweet roasted pumpkin, a little garlic and crisp sage leaves: the soup we make every week once the evenings get cold.</p></div>
		<div><div class="card"><b>Ingredients</b><ul style="margin-top:8px">${['1 small pumpkin', '1 onion', '2 cloves garlic', '800 ml vegetable stock', '8 sage leaves', 'Olive oil, salt, pepper'].map(x => `<li>${x}</li>`).join('')}</ul></div>
		<div class="card"><b>More autumn recipes</b>${['Apple and walnut cake', 'Mushroom barley risotto', 'Baked beets with feta'].map((x, i) => `<div style="display:flex;gap:12px;align-items:center;margin-top:12px"><div style="width:64px;height:48px;border-radius:8px;background:hsl(${[25, 35, 350][i]},35%,${[70, 62, 60][i]}%)"></div>${x}</div>`).join('')}</div></div></div>`) }
];

// Background picture for the "own theme over a picture" screenshot: dusk sky, a low sun and four
// mountain ridges, 1920×1200. Rendered as a page and captured as JPEG, like a photo a user would pick.
const WALLPAPER = (() => {
	const ridge = (color, base, amp, k) => {
		let d = 'M0 1200';
		for (let x = 0; x <= 1920; x += 40) d += ` L${x} ${(base + Math.sin(x / (180 + k * 60) + k * 2) * amp + Math.sin(x / 63 + k) * 18).toFixed(1)}`;
		return `<path d="${d} L1920 1200Z" fill="${color}"/>`;
	};
	return `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}body{width:1920px;height:1200px;overflow:hidden}</style></head><body>
		<svg width="1920" height="1200" viewBox="0 0 1920 1200"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#1a2a6c"/><stop offset=".45" stop-color="#b46a8f"/><stop offset=".7" stop-color="#fdbb6d"/><stop offset="1" stop-color="#fdd9a0"/></linearGradient></defs>
		<rect width="1920" height="1200" fill="url(#sky)"/><circle cx="1350" cy="700" r="120" fill="#fff0d2" opacity=".85"/>
		${ridge('#6d4a7a', 640, 90, 0)}${ridge('#4b3466', 760, 120, 1)}${ridge('#2e2350', 880, 150, 2)}${ridge('#1b1638', 1000, 170, 3)}</svg></body></html>`;
})();

module.exports = { SITES, WALLPAPER };
