const express = require(‘express’);
const fs = require(‘fs’);
const path = require(‘path’);
const { createCanvas } = require(’@napi-rs/canvas’);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function getParam(req, key) {
return (req.query[key] ?? req.body?.[key] ?? ‘’).toString().trim();
}

function generateWallpaper(screenWidth, screenHeight, achievedDates) {
const W = parseInt(screenWidth) || 390;
const H = parseInt(screenHeight) || 844;

const canvas = createCanvas(W, H);
const ctx = canvas.getContext(‘2d’);

ctx.fillStyle = ‘#000000’;
ctx.fillRect(0, 0, W, H);

const now        = new Date();
const year       = now.getFullYear();

const MONTHS = [‘Jan’,‘Feb’,‘Mar’,‘Apr’,‘May’,‘Jun’,‘Jul’,‘Aug’,‘Sep’,‘Oct’,‘Nov’,‘Dec’];

const scale  = W / 390;
const startY = H * 0.36;
const startX = 22 * scale;
const cellW  = (W - startX * 2) / 3;
const cellH  = (H - startY - 20 * scale) / 4;
const dotR   = 4.2 * scale;
const dotGap = 2.5 * scale;
const step   = dotR * 2 + dotGap;

ctx.font = `${Math.round(11 * scale)}px sans-serif`;
ctx.textBaseline = ‘top’;

for (let mi = 0; mi < 12; mi++) {
const col = mi % 3;
const row = Math.floor(mi / 3);
const ox  = startX + col * cellW;
const oy  = startY + row * cellH;

```
ctx.fillStyle = '#ffffff';
ctx.fillText(MONTHS[mi], ox, oy);

const labelH     = Math.round(13 * scale);
const gridStartX = ox;
const gridStartY = oy + labelH + 4 * scale;

const daysInMonth = new Date(year, mi + 1, 0).getDate();
const firstDay    = new Date(year, mi, 1).getDay();

for (let d = 1; d <= daysInMonth; d++) {
  const index = firstDay + d - 1;
  const dc    = index % 7;
  const dr    = Math.floor(index / 7);
  const cx    = gridStartX + dc * step + dotR;
  const cy    = gridStartY + dr * step + dotR;

  const dateKey    = `${year}-${String(mi+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const isAchieved = achievedDates.has(dateKey);

  ctx.beginPath();
  ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
  ctx.fillStyle = isAchieved ? '#ffffff' : '#2e2e2e';
  ctx.fill();
}
```

}

return canvas.toBuffer(‘image/png’);
}

const DATA_DIR  = path.join(__dirname, ‘data’);
const DATA_FILE = path.join(DATA_DIR, ‘goal_records.txt’);

function loadAchievedDates() {
const set = new Set();
if (!fs.existsSync(DATA_FILE)) return set;
fs.readFileSync(DATA_FILE, ‘utf8’).split(’\n’).forEach(line => {
const t = line.trim();
if (t) set.add(t);
});
return set;
}

function saveAchievedDate(dateStr) {
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const set = loadAchievedDates();
if (!set.has(dateStr)) {
fs.appendFileSync(DATA_FILE, dateStr + ‘\n’, ‘utf8’);
}
}

app.all(’/shortcuts/genpic.php’, (req, res) => {
try {
const screenWidth  = getParam(req, ‘screen_width’)  || ‘390’;
const screenHeight = getParam(req, ‘screen_height’) || ‘844’;
const fileContents = getParam(req, ‘records’);

```
// The shortcut sends the iPhone file contents as "records"
// Each line looks like "2026-03-15 01:17:32" — extract just the date part
if (fileContents && fileContents.trim() !== '') {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const lines    = fileContents.split('\n');
  const existing = loadAchievedDates();
  for (const line of lines) {
    const t        = line.trim();
    const datePart = t.substring(0, 10); // grab yyyy-MM-dd
    if (datePart.match(/^\d{4}-\d{2}-\d{2}$/) && !existing.has(datePart)) {
      fs.appendFileSync(DATA_FILE, datePart + '\n', 'utf8');
      existing.add(datePart);
    }
  }
} else {
  // Fallback: just save today
  const today = new Date().toISOString().split('T')[0];
  saveAchievedDate(today);
}

const achievedDates = loadAchievedDates();
const imgBuffer     = generateWallpaper(screenWidth, screenHeight, achievedDates);
const base64Img     = imgBuffer.toString('base64');

const totalAchieved = achievedDates.size;
const now           = new Date();
const dayOfYear     = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
const pct           = dayOfYear > 0 ? Math.round((totalAchieved / dayOfYear) * 100) : 0;

const responseText = [
  `status=success`,
  `message=🎯 ${totalAchieved} days achieved so far this year (${pct}%). Keep it up!`,
  `link=https://lifesync-server-production.up.railway.app/stats`,
  `link_text=View my progress`,
  `image_base64=${base64Img}`,
].join('\n');

res.setHeader('Content-Type', 'text/plain');
res.send(responseText);
```

} catch (err) {
console.error(err);
res.setHeader(‘Content-Type’, ‘text/plain’);
res.send(`status=error\nmessage=Server error: ${err.message}\nlink=\nlink_text=\nimage_base64=`);
}
});

app.get(’/stats’, (req, res) => {
const dates = loadAchievedDates();
const list  = […dates].sort();
res.send(`<!DOCTYPE html>

<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>LifeSync Goals</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#000;color:#fff;font-family:-apple-system,Helvetica,Arial,sans-serif;padding:2rem 1.5rem;max-width:420px;margin:0 auto}
    h1{font-size:1.2rem;color:#888;margin-bottom:1.5rem;letter-spacing:.05em;text-transform:uppercase}
    .big{font-size:4rem;font-weight:700;line-height:1}
    .sub{color:#555;font-size:.9rem;margin-top:.4rem;margin-bottom:2rem}
    ul{list-style:none;padding:0}
    li{padding:.6rem 0;border-bottom:1px solid #111;color:#aaa;font-size:.9rem;display:flex;align-items:center;gap:.6rem}
    li::before{content:'';width:8px;height:8px;border-radius:50%;background:#fff;flex-shrink:0}
  </style>
</head>
<body>
  <h1>LifeSync Goals</h1>
  <div class="big">${dates.size}</div>
  <div class="sub">days achieved this year</div>
  <ul>${list.map(d=>`<li>${d}</li>`).join('')}</ul>
</body>
</html>`);
});

app.get(’/’, (req, res) => res.send(‘LifeSync Goal Server is running ✓’));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LifeSync server running on port ${PORT}`));
