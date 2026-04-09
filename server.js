const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.json({ limit: '50mb' }));
app.use(express.text({ type: 'text/*', limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

var fontPath = path.join(__dirname, 'DejaVuSans-Bold.ttf');
if (fs.existsSync(fontPath)) GlobalFonts.registerFromPath(fontPath, 'AppFont');

var DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function getDeviceId(req) {
  var userId = (req.headers['user-id'] || '').trim();
  var w = req.headers['screen-wi'] || req.headers['screen-width'] || '0';
  var h = req.headers['screen-hei'] || req.headers['screen-height'] || '0';
  var ios = req.headers['ios-version'] || '';

  if (userId.length >= 8) {
    var combined = userId + ':' + w + ':' + h + ':' + ios;
    return 'u_' + crypto.createHash('md5').update(combined).digest('hex');
  }

  var ua = req.headers['user-agent'] || '';
  var raw = w + ':' + h + ':' + ios + ':' + ua;
  return 'f_' + crypto.createHash('md5').update(raw).digest('hex').substring(0, 12);
}

function loadDeviceDates(deviceId) {
  var filePath = path.join(DATA_DIR, 'device_' + deviceId + '.txt');
  if (!fs.existsSync(filePath)) return new Set();
  var content = fs.readFileSync(filePath, 'utf8');
  var dates = new Set();
  content.trim().split('\n').forEach(function(line) {
    var m = line.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) dates.add(m[1]);
  });
  return dates;
}

function saveDeviceDate(deviceId, dateStr) {
  var filePath = path.join(DATA_DIR, 'device_' + deviceId + '.txt');
  var existing = '';
  if (fs.existsSync(filePath)) {
    existing = fs.readFileSync(filePath, 'utf8');
  }
  if (existing.indexOf(dateStr) === -1) {
    fs.appendFileSync(filePath, dateStr + '\n');
  }
}

// Calculate streak stats from a set of date strings
function calcStats(achievedDates) {
  var now = new Date();
  var year = now.getFullYear();
  var doy = Math.floor((now - new Date(year, 0, 0)) / 86400000);

  var sorted = Array.from(achievedDates).sort();
  var total = sorted.length;
  var pct = doy > 0 ? Math.round(total / doy * 100) : 0;

  // Current streak (counting backwards from today)
  var streak = 0;
  var checkDate = new Date(now);
  // Start from today
  for (var i = 0; i < 400; i++) {
    var key = checkDate.getFullYear() + '-' + String(checkDate.getMonth() + 1).padStart(2, '0') + '-' + String(checkDate.getDate()).padStart(2, '0');
    if (achievedDates.has(key)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (i === 0) {
      // Today not yet marked — check if yesterday starts a streak
      checkDate.setDate(checkDate.getDate() - 1);
      continue;
    } else {
      break;
    }
  }

  // Best streak
  var best = 0;
  var current = 0;
  for (var s = 0; s < sorted.length; s++) {
    if (s === 0) {
      current = 1;
    } else {
      var prev = new Date(sorted[s - 1]);
      var curr = new Date(sorted[s]);
      var diff = Math.round((curr - prev) / 86400000);
      if (diff === 1) {
        current++;
      } else {
        current = 1;
      }
    }
    if (current > best) best = current;
  }

  // This month's days
  var thisMonth = now.getMonth() + 1;
  var monthDays = 0;
  sorted.forEach(function(d) {
    var parts = d.split('-');
    if (parseInt(parts[0]) === year && parseInt(parts[1]) === thisMonth) monthDays++;
  });

  return { total: total, pct: pct, streak: streak, best: best, monthDays: monthDays, year: year };
}

function generateWallpaper(W, H, achievedDates, theme) {
  var isLight = theme === 'light';
  var bgColor         = isLight ? '#ffffff' : '#000000';
  var labelColor      = isLight ? '#000000' : '#ffffff';
  var achievedColor   = isLight ? '#000000' : '#ffffff';
  var unachievedColor = isLight ? '#cccccc' : '#484848';
  var PW = W * 3;
  var PH = H * 3;
  var canvas = createCanvas(PW, PH);
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, PW, PH);
  var year = new Date().getFullYear();
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var p = 3;
  var calTop    = H * 0.36 * p;
  var calBottom = H * 0.86 * p;
  var calH = calBottom - calTop;
  var rowH = calH / 4;
  var labelSize = 11 * p;
  var labelGap  = 5 * p;
  var dotsH = rowH - labelSize - labelGap - 4 * p;
  var dotsW = (W * 0.30) * p;
  var stepW = dotsW / 7;
  var stepH = dotsH / 6;
  var step  = Math.min(stepW, stepH);
  var dotR  = step * 0.43;
  var monthW = 7 * step;
  var gap = PW * 0.04;
  var calLeft = (PW - (3 * monthW + 2 * gap)) / 2;
  var fontName = fs.existsSync(fontPath) ? 'AppFont' : 'sans-serif';
  ctx.textBaseline = 'top';
  for (var mi = 0; mi < 12; mi++) {
    var col = mi % 3;
    var row = Math.floor(mi / 3);
    var ox = calLeft + col * (monthW + gap);
    var oy = calTop + row * rowH;
    ctx.font = 'bold ' + labelSize + 'px ' + fontName;
    ctx.fillStyle = labelColor;
    ctx.fillText(MONTHS[mi], ox, oy);
    var gx = ox;
    var gy = oy + labelSize + labelGap;
    var days = new Date(year, mi + 1, 0).getDate();
    var fd   = new Date(year, mi, 1).getDay();
    for (var d = 1; d <= days; d++) {
      var idx = fd + d - 1;
      var cx  = gx + (idx % 7) * step + dotR;
      var cy  = gy + Math.floor(idx / 7) * step + dotR;
      var key = year + '-' + String(mi+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = achievedDates.has(key) ? achievedColor : unachievedColor;
      ctx.fill();
    }
  }
  return canvas.toBuffer('image/png');
}

function getTodayDate(header) {
  var now = new Date();
  if (header && header.match(/^\d{4}-\d{2}-\d{2}$/)) return header;
  var pk = new Date(now.getTime() + 5 * 3600000);
  return pk.getUTCFullYear() + '-' + String(pk.getUTCMonth()+1).padStart(2,'0') + '-' + String(pk.getUTCDate()).padStart(2,'0');
}

function extractBodyText(req) {
  if (req.file && req.file.buffer) return req.file.buffer.toString('utf8');
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    return req.files.map(function(f) { return f.buffer.toString('utf8'); }).join('\n');
  }
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (req.body.records) return String(req.body.records);
    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      var val = String(req.body[keys[i]]);
      if (val.match(/\d{4}-\d{2}-\d{2}/)) return val;
    }
  }
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  return '';
}

app.all('/shortcuts/genpic.php', upload.any(), function(req, res) {
  try {
    var W = parseInt(req.headers['screen-wi'] || req.headers['screen-width'] || '390');
    var H = parseInt(req.headers['screen-hei'] || req.headers['screen-height'] || '844');

    var deviceId = getDeviceId(req);
    var localDateHeader = (req.headers['local-date'] || '').trim();
    var rawDateHeader = (req.headers['date'] || '').trim();
    var dateStr = '';
    if (localDateHeader.match(/^\d{4}-\d{2}-\d{2}$/)) {
      dateStr = localDateHeader;
    } else if (rawDateHeader.match(/^\d{4}-\d{2}-\d{2}/)) {
      dateStr = rawDateHeader.substring(0, 10);
    } else {
      dateStr = getTodayDate(null);
    }

    var body = extractBodyText(req);
    var achievedDates = new Set();

    if (body.trim().length > 0) {
      body.trim().split('\n').forEach(function(line) {
        var m = line.trim().match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) {
          achievedDates.add(m[1]);
          saveDeviceDate(deviceId, m[1]);
        }
      });
    }

    saveDeviceDate(deviceId, dateStr);
    var serverDates = loadDeviceDates(deviceId);
    serverDates.forEach(function(d) { achievedDates.add(d); });
    achievedDates.add(dateStr);

    fs.writeFileSync(path.join(DATA_DIR, 'debug.json'), JSON.stringify({
      W: W, H: H, date: dateStr, deviceId: deviceId,
      userIdHeader: req.headers['user-id'] || 'none',
      contentType: req.headers['content-type'] || 'none',
      bodyLength: body.length,
      bodyPreview: body.substring(0, 300),
      serverDatesCount: serverDates.size,
      totalDates: achievedDates.size,
      allDates: Array.from(achievedDates).sort(),
      time: new Date().toISOString()
    }));

    var theme = (req.query.theme || 'dark').toString().trim();
    var img   = generateWallpaper(W, H, achievedDates, theme);
    var b64   = img.toString('base64');

    var stats = calcStats(achievedDates);
    var now2 = new Date();
    var daysLeftInYear = Math.ceil((new Date(now2.getFullYear(), 11, 31) - now2) / 86400000);
    var statsLink = 'https://lifesync-server-production.up.railway.app/stats?days=' + stats.total + '&streak=' + stats.streak + '&best=' + stats.best + '&pct=' + stats.pct + '&month=' + stats.monthDays + '&year=' + stats.year + '&left=' + daysLeftInYear;

    res.setHeader('Content-Type', 'text/plain');
    res.send('status=success\nmessage=' + stats.total + ' days achieved (' + stats.pct + '%). Keep it up!\nlink=' + statsLink + '\nlink_text=View my stats\nimage_base64=' + b64);
  } catch (e) {
    console.error(e);
    res.setHeader('Content-Type', 'text/plain');
    res.send('status=error\nmessage=' + e.message + '\nlink=\nlink_text=\nimage_base64=');
  }
});

app.get('/debug', function(req, res) {
  var f = path.join(DATA_DIR, 'debug.json');
  res.setHeader('Content-Type', 'application/json');
  res.send(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '{}');
});

app.get('/stats', function(req, res) {
  var days = parseInt(req.query.days) || 0;
  var streak = parseInt(req.query.streak) || 0;
  var best = parseInt(req.query.best) || 0;
  var pct = parseInt(req.query.pct) || 0;
  var month = parseInt(req.query.month) || 0;
  var year = parseInt(req.query.year) || new Date().getFullYear();
  var daysLeft = parseInt(req.query.left) || Math.ceil((new Date(new Date().getFullYear(), 11, 31) - new Date()) / 86400000);

  var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var currentMonth = monthNames[new Date().getMonth()];

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LifeSync — Your Stats</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: #050505;
    color: #f0f0f0;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  .container {
    max-width: 480px;
    margin: 0 auto;
    padding: 48px 24px 64px;
  }

  /* Header */
  .header {
    text-align: center;
    margin-bottom: 40px;
  }

  .logo {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #5a5a5a;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .logo-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f0f0f0;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .header h1 {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.1;
    margin-bottom: 8px;
  }

  .header p {
    color: #5a5a5a;
    font-size: 0.9rem;
  }

  /* Hero stat */
  .hero-stat {
    text-align: center;
    padding: 36px 24px;
    background: #0c0c0c;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 20px;
    margin-bottom: 16px;
  }

  .hero-number {
    font-size: 4.5rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1;
    color: #ffffff;
    font-variant-numeric: tabular-nums;
  }

  .hero-label {
    font-size: 0.82rem;
    color: #5a5a5a;
    margin-top: 8px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .hero-sub {
    font-size: 1.1rem;
    color: #a0a0a0;
    margin-top: 12px;
    font-weight: 600;
  }

  /* Stat grid */
  .stat-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }

  .stat-card {
    background: #0c0c0c;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    padding: 24px 20px;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: #ffffff;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .stat-unit {
    font-size: 1rem;
    font-weight: 500;
    color: #5a5a5a;
  }

  .stat-name {
    font-size: 0.78rem;
    color: #5a5a5a;
    margin-top: 6px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* Progress bar */
  .progress-card {
    background: #0c0c0c;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    padding: 24px 20px;
    margin-bottom: 16px;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 14px;
  }

  .progress-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: #a0a0a0;
  }

  .progress-pct {
    font-size: 1.2rem;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.02em;
  }

  .progress-bar-bg {
    width: 100%;
    height: 8px;
    background: rgba(255,255,255,0.06);
    border-radius: 100px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: #ffffff;
    border-radius: 100px;
    transition: width 1.5s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .progress-sub {
    font-size: 0.75rem;
    color: #777777;
    margin-top: 10px;
    text-align: right;
  }

  /* Motivational message */
  .message-card {
    background: #0c0c0c;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    padding: 24px 20px;
    text-align: center;
    margin-bottom: 32px;
  }

  .message-emoji {
    font-size: 1.8rem;
    margin-bottom: 10px;
  }

  .message-text {
    font-size: 0.92rem;
    color: #a0a0a0;
    line-height: 1.6;
  }

  .message-text strong {
    color: #f0f0f0;
  }

  /* Footer */
  .footer {
    text-align: center;
  }

  .footer a {
    display: inline-block;
    color: #050505;
    background: #f0f0f0;
    padding: 13px 28px;
    border-radius: 100px;
    font-size: 0.88rem;
    font-weight: 600;
    text-decoration: none;
    transition: transform 0.3s, box-shadow 0.3s;
    margin-bottom: 16px;
  }

  .footer a:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(255,255,255,0.1);
  }

  .footer p {
    font-size: 0.72rem;
    color: #777777;
  }

  /* Animate in */
  .fade-in {
    opacity: 0;
    transform: translateY(16px);
    animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .fade-in:nth-child(1) { animation-delay: 0.1s; }
  .fade-in:nth-child(2) { animation-delay: 0.2s; }
  .fade-in:nth-child(3) { animation-delay: 0.3s; }
  .fade-in:nth-child(4) { animation-delay: 0.4s; }
  .fade-in:nth-child(5) { animation-delay: 0.5s; }
  .fade-in:nth-child(6) { animation-delay: 0.6s; }
  .fade-in:nth-child(7) { animation-delay: 0.7s; }

  @keyframes fadeIn {
    to { opacity: 1; transform: translateY(0); }
  }

  /* Count-up animation */
  .count-up {
    font-variant-numeric: tabular-nums;
  }
</style>
</head>
<body>
<div class="container">
  <div class="header fade-in">
    <div class="logo"><span class="logo-dot"></span> LifeSync</div>
    <h1>Your ${year} Stats</h1>
    <p>Keep showing up. Every dot counts.</p>
  </div>

  <div class="hero-stat fade-in">
    <div class="hero-number count-up" data-target="${days}">${days}</div>
    <div class="hero-label">Days Crushed</div>
    <div class="hero-sub">${pct}% of ${year} so far</div>
  </div>

  <div class="stat-grid fade-in">
    <div class="stat-card">
      <div class="stat-value count-up" data-target="${streak}">${streak}</div>
      <div class="stat-name">Current Streak</div>
    </div>
    <div class="stat-card">
      <div class="stat-value count-up" data-target="${best}">${best}</div>
      <div class="stat-name">Best Streak</div>
    </div>
  </div>

  <div class="stat-grid fade-in">
    <div class="stat-card">
      <div class="stat-value count-up" data-target="${month}">${month}</div>
      <div class="stat-name">This Month</div>
    </div>
    <div class="stat-card">
      <div class="stat-value"><span class="count-up" data-target="${pct}">${pct}</span><span class="stat-unit">%</span></div>
      <div class="stat-name">Consistency</div>
    </div>
  </div>

  <div class="progress-card fade-in">
    <div class="progress-header">
      <span class="progress-title">Year Progress</span>
      <span class="progress-pct">${days} / 365</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="width: 0%" id="progressBar"></div>
    </div>
    <div class="progress-sub">${daysLeft} days left in ${year}</div>
  </div>

  <div class="message-card fade-in">
    <div class="message-emoji">${streak >= 7 ? '&#128293;' : streak >= 3 ? '&#9889;' : days > 0 ? '&#128170;' : '&#127793;'}</div>
    <div class="message-text">${
      streak >= 30 ? '<strong>' + streak + '-day streak!</strong> You are absolutely unstoppable.' :
      streak >= 14 ? '<strong>' + streak + ' days strong.</strong> Two weeks of consistency. That\'s rare.' :
      streak >= 7 ? '<strong>' + streak + '-day streak!</strong> A full week. Most people never get here.' :
      streak >= 3 ? '<strong>' + streak + ' days in a row.</strong> Momentum is building.' :
      days > 0 ? '<strong>You\'ve shown up ' + days + ' times.</strong> That\'s ' + days + ' times you chose growth.' :
      'Your journey starts with a single dot. <strong>Make today count.</strong>'
    }</div>
  </div>

  <div class="footer fade-in">
    <a href="https://lifesyncdots.com">Visit LifeSync</a>
    <p>Data stays on your device. This page reads from your shortcut only.</p>
  </div>
</div>

<script>
// Animate progress bar
setTimeout(function() {
  document.getElementById('progressBar').style.width = '${Math.min(pct, 100)}%';
}, 600);

// Count-up animation
document.querySelectorAll('.count-up').forEach(function(el) {
  var target = parseInt(el.dataset.target) || 0;
  if (target === 0) return;
  var duration = 1200;
  var start = performance.now();
  el.textContent = '0';
  function update(now) {
    var elapsed = now - start;
    var progress = Math.min(elapsed / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  setTimeout(function() { requestAnimationFrame(update); }, 400);
});
</script>
</body>
</html>`);
});

app.get('/', function(req, res) { res.send('LifeSync Goal Server is running'); });

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('LifeSync on port ' + PORT); });
