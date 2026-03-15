const express = require('express');
const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const app = express();
app.use(express.raw({ type: '*/*', limit: '50mb' }));

var fontPath = path.join(__dirname, 'DejaVuSans-Bold.ttf');
if (fs.existsSync(fontPath)) GlobalFonts.registerFromPath(fontPath, 'AppFont');

function generateWallpaper(W, H, achievedDates) {
  var PW = W * 3;
  var PH = H * 3;
  var canvas = createCanvas(PW, PH);
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, PW, PH);

  var year = new Date().getFullYear();
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Layout: calendar from 36% to 86% of screen height
  var calTop = H * 0.36 * 3;
  var calBot = H * 0.86 * 3;
  var calH   = calBot - calTop;
  var rowH   = calH / 4;

  // Dot step: fit 7 dots horizontally across PW/3, 6 dots vertically across rowH*0.8
  var maxStepW = (PW * 0.90) / (3 * 7);
  var maxStepH = (rowH * 0.80) / 6;
  var step = Math.min(maxStepW, maxStepH);
  var dotR = step * 0.43;

  // Center the whole calendar
  var gridW = 3 * 7 * step;
  var startX = (PW - gridW) / 2;

  var labelH = step * 1.1;
  var labelGap = step * 0.2;
  var fontName = fs.existsSync(fontPath) ? 'AppFont' : 'sans-serif';

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold ' + Math.round(labelH) + 'px ' + fontName;

  for (var mi = 0; mi < 12; mi++) {
    var col = mi % 3;
    var row = Math.floor(mi / 3);
    var ox = startX + col * 7 * step;
    var oy = calTop + row * rowH;

    ctx.fillStyle = '#ffffff';
    ctx.fillText(MONTHS[mi], ox, oy);

    var gx = ox;
    var gy = oy + labelH + labelGap;
    var days = new Date(year, mi + 1, 0).getDate();
    var fd   = new Date(year, mi, 1).getDay();

    for (var d = 1; d <= days; d++) {
      var i  = fd + d - 1;
      var cx = gx + (i % 7) * step + dotR;
      var cy = gy + Math.floor(i / 7) * step + dotR;
      var k  = year + '-' + String(mi+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = achievedDates.has(k) ? '#ffffff' : '#484848';
      ctx.fill();
    }
  }
  return canvas.toBuffer('image/png');
}

var DATA_DIR  = path.join(__dirname, 'data');
var DATA_FILE = path.join(DATA_DIR, 'records.txt');
var DBG_FILE  = path.join(DATA_DIR, 'debug.json');

function load() {
  var s = new Set();
  if (!fs.existsSync(DATA_FILE)) return s;
  fs.readFileSync(DATA_FILE, 'utf8').split('\n').forEach(function(l) {
    var t = l.trim();
    if (t) s.add(t);
  });
  return s;
}

function save(d) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  var s = load();
  if (!s.has(d)) fs.appendFileSync(DATA_FILE, d + '\n');
}

app.all('/shortcuts/genpic.php', function(req, res) {
  try {
    var W = parseInt(req.headers['screen-wi'] || req.headers['screen-width'] || '390');
    var H = parseInt(req.headers['screen-hei'] || req.headers['screen-height'] || '844');

    // Get date from URL param — this is sent by the shortcut and is always correct
    var dateStr = (req.query.date || '').toString().trim();

    // Parse body — each line is "YYYY-MM-DD HH:MM:SS 1"
    // The LAST line date is today's achieved date
    var body = req.body ? (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body)) : '';
    var achieved = false;

    if (body.trim().length > 0) {
      achieved = true;
      var lines = body.trim().split('\n').filter(function(l) { return l.trim(); });
      var last = lines[lines.length - 1].trim();
      var m = last.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) dateStr = m[1];
    }

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DBG_FILE, JSON.stringify({ W: W, H: H, date: dateStr, achieved: achieved, lastBody: body.slice(-100), t: new Date().toISOString() }));

    if (achieved && dateStr) save(dateStr);

    var dates  = load();
    var img    = generateWallpaper(W, H, dates);
    var b64    = img.toString('base64');
    var total  = dates.size;
    var doy    = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    var pct    = doy > 0 ? Math.round(total / doy * 100) : 0;

    res.setHeader('Content-Type', 'text/plain');
    res.send('status=success\nmessage=' + total + ' days achieved (' + pct + '%)\nlink=https://lifesync-server-production.up.railway.app/stats\nlink_text=View stats\nimage_base64=' + b64);
  } catch (e) {
    console.error(e);
    res.setHeader('Content-Type', 'text/plain');
    res.send('status=error\nmessage=' + e.message + '\nlink=\nlink_text=\nimage_base64=');
  }
});

app.get('/debug', function(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.send(fs.existsSync(DBG_FILE) ? fs.readFileSync(DBG_FILE) : '{}');
});

app.get('/stats', function(req, res) {
  var dates = load();
  var items = Array.from(dates).sort().map(function(d) { return '<li>' + d + '</li>'; }).join('');
  res.send('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LifeSync</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#000;color:#fff;font-family:-apple-system,sans-serif;padding:2rem 1.5rem;max-width:420px;margin:0 auto}h1{color:#888;font-size:1.2rem;margin-bottom:1.5rem}.n{font-size:4rem;font-weight:700}.s{color:#555;font-size:.9rem;margin-bottom:2rem}ul{list-style:none}li{padding:.5rem 0;border-bottom:1px solid #111;color:#aaa}</style></head><body><h1>LifeSync Goals</h1><div class="n">' + dates.size + '</div><div class="s">days achieved</div><ul>' + items + '</ul></body></html>');
});

app.get('/', function(req, res) { res.send('LifeSync running'); });

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('LifeSync on port ' + PORT); });
