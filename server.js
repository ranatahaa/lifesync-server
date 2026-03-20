const express = require('express');
const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const app = express();
app.use(express.raw({ type: '*/*', limit: '50mb' }));
app.use(express.text({ type: 'text/*', limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

var fontPath = path.join(__dirname, 'DejaVuSans-Bold.ttf');
if (fs.existsSync(fontPath)) GlobalFonts.registerFromPath(fontPath, 'AppFont');

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

// Helper: get today's date string in the user's timezone (default: Asia/Karachi UTC+5)
function getTodayDate(tzOffsetHeader) {
  var now = new Date();

  // If a custom header provides the user's local date directly (YYYY-MM-DD), use it
  if (tzOffsetHeader && tzOffsetHeader.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return tzOffsetHeader;
  }

  // If a numeric UTC offset in minutes is provided (e.g. "-300" for UTC+5)
  // Shortcuts can send this as the difference: localTime - UTC in minutes
  if (tzOffsetHeader && tzOffsetHeader.match(/^-?\d+$/)) {
    var offsetMin = parseInt(tzOffsetHeader);
    var local = new Date(now.getTime() + offsetMin * 60000);
    return local.getUTCFullYear() + '-' +
      String(local.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(local.getUTCDate()).padStart(2, '0');
  }

  // Fallback: use UTC+5 (Pakistan Standard Time) since that's where you are
  var pkTime = new Date(now.getTime() + 5 * 3600000);
  return pkTime.getUTCFullYear() + '-' +
    String(pkTime.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(pkTime.getUTCDate()).padStart(2, '0');
}

app.all('/shortcuts/genpic.php', function(req, res) {
  try {
    var W = parseInt(req.headers['screen-wi'] || req.headers['screen-width'] || '390');
    var H = parseInt(req.headers['screen-hei'] || req.headers['screen-height'] || '844');

    // ---- FIX 1: Robust date reading ----
    // Try multiple headers: 'local-date' (custom, best), 'tz-offset', then 'date'
    var localDateHeader = (req.headers['local-date'] || '').trim();
    var tzOffsetHeader  = (req.headers['tz-offset'] || '').trim();
    var rawDateHeader   = (req.headers['date'] || '').trim();

    var dateStr = '';

    // Priority 1: Custom 'local-date' header with YYYY-MM-DD
    if (localDateHeader.match(/^\d{4}-\d{2}-\d{2}$/)) {
      dateStr = localDateHeader;
    }
    // Priority 2: Use tz-offset to compute local date
    else if (tzOffsetHeader) {
      dateStr = getTodayDate(tzOffsetHeader);
    }
    // Priority 3: Try parsing the raw 'date' header (could be YYYY-MM-DD or HTTP date)
    else if (rawDateHeader.match(/^\d{4}-\d{2}-\d{2}/)) {
      dateStr = rawDateHeader.substring(0, 10);
    }
    // Priority 4: Fallback to server time adjusted to PKT (UTC+5)
    else {
      dateStr = getTodayDate(null);
    }

    // Body contains the user's local records file
    var body = '';
    if (req.body) {
      if (Buffer.isBuffer(req.body)) {
        body = req.body.toString('utf8');
      } else if (typeof req.body === 'string') {
        body = req.body;
      } else if (typeof req.body === 'object') {
        var keys = Object.keys(req.body);
        if (keys.length > 0) {
          body = keys.join('\n');
          var vals = keys.map(function(k) { return req.body[k]; }).join('\n');
          if (vals.match(/\d{4}-\d{2}-\d{2}/)) body = vals;
        }
      }
    }

    // Save debug info
    var DATA_DIR = path.join(__dirname, 'data');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, 'debug.json'), JSON.stringify({
      W: W,
      H: H,
      date: dateStr,
      localDateHeader: localDateHeader,
      tzOffsetHeader: tzOffsetHeader,
      rawDateHeader: rawDateHeader,
      bodyLength: body.length,
      bodyPreview: body.substring(0, 500),
      time: new Date().toISOString()
    }));

    // ---- FIX 2: Parse dates from body, ALWAYS add today ----
    var achievedDates = new Set();

    // Parse all existing dates from the body
    if (body.trim().length > 0) {
      body.trim().split('\n').forEach(function(line) {
        var m = line.trim().match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) achievedDates.add(m[1]);
      });
    }

    // ALWAYS add today's date (the goal was achieved if they're calling this endpoint)
    achievedDates.add(dateStr);

    var theme = (req.query.theme || 'dark').toString().trim();
    var img   = generateWallpaper(W, H, achievedDates, theme);
    var b64   = img.toString('base64');
    var total = achievedDates.size;
    var now   = new Date();
    var doy   = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    var pct   = doy > 0 ? Math.round(total / doy * 100) : 0;

    res.setHeader('Content-Type', 'text/plain');
    res.send('status=success\nmessage=' + total + ' days achieved (' + pct + '%). Keep it up!\nlink=https://lifesync-server-production.up.railway.app/stats\nlink_text=View my progress\nimage_base64=' + b64);
  } catch (e) {
    console.error(e);
    res.setHeader('Content-Type', 'text/plain');
    res.send('status=error\nmessage=' + e.message + '\nlink=\nlink_text=\nimage_base64=');
  }
});

app.get('/debug', function(req, res) {
  var f = path.join(__dirname, 'data', 'debug.json');
  res.setHeader('Content-Type', 'application/json');
  res.send(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '{}');
});

app.get('/stats', function(req, res) {
  res.send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>LifeSync</title></head><body style="background:#000;color:#fff;font-family:-apple-system,sans-serif;padding:2rem;text-align:center"><h1>LifeSync Goals</h1><p>Your progress is stored privately on your iPhone.</p></body></html>');
});

app.get('/', function(req, res) { res.send('LifeSync Goal Server is running'); });

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('LifeSync on port ' + PORT); });
