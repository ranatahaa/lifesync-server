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
  var f = path.join(DATA_DIR, 'debug.json');
  res.setHeader('Content-Type', 'application/json');
  res.send(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '{}');
});

app.get('/stats', function(req, res) {
  res.send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>LifeSync</title></head><body style="background:#000;color:#fff;font-family:-apple-system,sans-serif;padding:2rem;text-align:center"><h1>LifeSync Goals</h1><p>Your progress is stored privately on your iPhone.</p></body></html>');
});

app.get('/', function(req, res) { res.send('LifeSync Goal Server is running'); });

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('LifeSync on port ' + PORT); });
