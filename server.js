const express = require('express');
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function getParam(req, key) {
  return (req.query[key] ?? req.body?.[key] ?? '').toString().trim();
}

// ── Draw wallpaper ─────────────────────────────────────────────────────────
function generateWallpaper(screenWidth, screenHeight, achievedDates) {
  const W = parseInt(screenWidth) || 390;
  const H = parseInt(screenHeight) || 844;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Pure black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  const now        = new Date();
  const year       = now.getFullYear();
  const todayMonth = now.getMonth();  // 0-indexed
  const todayDate  = now.getDate();

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // ── Layout (based on 390×844 baseline, scales to any iPhone) ──
  const scale  = W / 390;

  const cols   = 3;
  const rows   = 4;

  // Top padding — leave room for clock area (roughly top 36% of screen)
  const startY = H * 0.36;
  const startX = 22 * scale;

  const cellW  = (W - startX * 2) / cols;
  const cellH  = (H - startY - 20 * scale) / rows;

  // Dot sizing — small and tightly packed like the screenshot
  const dotR   = 4.2 * scale;
  const dotGap = 2.5 * scale;
  const step   = dotR * 2 + dotGap;

  const labelFont = `${Math.round(11 * scale)}px -apple-system, Helvetica, Arial, sans-serif`;

  for (let mi = 0; mi < 12; mi++) {
    const col = mi % cols;
    const row = Math.floor(mi / cols);

    const ox = startX + col * cellW;
    const oy = startY + row * cellH;

    // Month label
    ctx.font      = labelFont;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.fillText(MONTHS[mi], ox, oy);

    const labelH     = Math.round(13 * scale);
    const gridStartX = ox;
    const gridStartY = oy + labelH + 4 * scale;

    const daysInMonth = new Date(year, mi + 1, 0).getDate();
    const firstDay    = new Date(year, mi, 1).getDay(); // 0 = Sunday

    for (let d = 1; d <= daysInMonth; d++) {
      const index = firstDay + d - 1;
      const dc    = index % 7;   // column in the week grid
      const dr    = Math.floor(index / 7); // row

      const cx = gridStartX + dc * step + dotR;
      const cy = gridStartY + dr * step + dotR;

      const dateKey    = `${year}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isAchieved = achievedDates.has(dateKey);
      const isToday    = (mi === todayMonth && d === todayDate);

      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);

      if (isAchieved) {
        // Achieved = bright white dot
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else {
        // Every other day (including today if not achieved) = same grey dot
        ctx.fillStyle = '#2e2e2e';
        ctx.fill();
      }
    }
  }

  return canvas.toBuffer('image/png');
}

// ── Data helpers ───────────────────────────────────────────────────────────
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'goal_records.txt');

function loadAchievedDates() {
  const set = new Set();
  if (!fs.existsSync(DATA_FILE)) return set;
  fs.readFileSync(DATA_FILE, 'utf8').split('\n').forEach(line => {
    const t = line.trim();
    if (t) set.add(t);
  });
  return set;
}

function saveAchievedDate(dateStr) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const set = loadAchievedDates();
  if (!set.has(dateStr)) {
    fs.appendFileSync(DATA_FILE, dateStr + '\n', 'utf8');
  }
}

// ── Main endpoint — matches original URL pattern exactly ──────────────────
app.all('/shortcuts/genpic.php', (req, res) => {
  try {
    const screenWidth  = getParam(req, 'screen_width')  || getParam(req, 'width')  || '390';
    const screenHeight = getParam(req, 'screen_height') || getParam(req, 'height') || '844';
    const achieved     = getParam(req, 'achieved');
    const dateStr      = getParam(req, 'date') || new Date().toISOString().split('T')[0];

    // Save if achieved
    if (achieved && achieved.toLowerCase() !== 'no' && achieved !== '') {
      saveAchievedDate(dateStr);
    }

    const achievedDates = loadAchievedDates();
    const imgBuffer     = generateWallpaper(screenWidth, screenHeight, achievedDates);
    const base64Img     = imgBuffer.toString('base64');

    const totalAchieved = achievedDates.size;
    const now           = new Date();
    const dayOfYear     = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const pct           = dayOfYear > 0 ? Math.round((totalAchieved / dayOfYear) * 100) : 0;

    // Response format must match exactly what the Shortcut regex parses
    const responseText = [
      `status=success`,
      `message=🎯 ${totalAchieved} days achieved so far this year (${pct}%). Keep it up!`,
      `link=https://lifesync-goals.onrender.com/stats`,
      `link_text=View my progress`,
      `image_base64=${base64Img}`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain');
    res.send(responseText);

  } catch (err) {
    console.error(err);
    res.setHeader('Content-Type', 'text/plain');
    res.send(`status=error\nmessage=Server error: ${err.message}\nlink=\nlink_text=\nimage_base64=`);
  }
});

// ── Stats page ─────────────────────────────────────────────────────────────
app.get('/stats', (req, res) => {
  const dates = loadAchievedDates();
  const list  = [...dates].sort();
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>LifeSync — Goal Stats</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #000;
      color: #fff;
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      padding: 2rem 1.5rem;
      max-width: 420px;
      margin: 0 auto;
    }
    h1 { font-size: 1.2rem; color: #888; margin-bottom: 1.5rem; letter-spacing: 0.05em; text-transform: uppercase; }
    .big { font-size: 4rem; font-weight: 700; line-height: 1; }
    .sub { color: #555; font-size: 0.9rem; margin-top: 0.4rem; margin-bottom: 2rem; }
    ul { list-style: none; }
    li {
      padding: 0.6rem 0;
      border-bottom: 1px solid #111;
      color: #aaa;
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    li::before {
      content: '';
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #fff;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <h1>LifeSync Goals</h1>
  <div class="big">${dates.size}</div>
  <div class="sub">days achieved this year</div>
  <ul>
    ${list.map(d => `<li>${d}</li>`).join('')}
  </ul>
</body>
</html>`);
});

app.get('/', (req, res) => res.send('LifeSync Goal Server is running ✓'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LifeSync server running on port ${PORT}`));
