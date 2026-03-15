const express = require('express');
const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const app = express();
app.use(express.raw({ type: '*/*', limit: '50mb' }));

var fontPath = path.join(__dirname, 'DejaVuSans-Bold.ttf');
if (fs.existsSync(fontPath)) {
  GlobalFonts.registerFromPath(fontPath, 'AppFont');
}

function generateWallpaper(screenWidth, screenHeight, achievedDates) {
  var W = parseInt(screenWidth) || 390;
  var H = parseInt(screenHeight) || 844;
  var PW = W * 3;
  var PH = H * 3;
  var canvas = createCanvas(PW, PH);
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, PW, PH);
  var now = new Date();
  var year = now.getFullYear();
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var p = 3;
  var calTop    = H * 0.36 * p;
  var calBottom = H * 0.86 * p;
  var calH = calBottom - calTop;
  var rowH = calH / 4;
  var labelSize = 11 * p;
  var labelGap  = 5 * p;
  var dotsH = rowH - labelSize - labelGap - 4 * p;
  var dotsW = (W / 3 - 16) * p;
  var stepW = dotsW / 7;
  var stepH = dotsH / 6;
  var step  = Math.min(stepW, stepH);
  var dotR  = step * 0.43;
  var monthW = 7 * step;
  var gap = (PW * 0.92 - 3 * monthW) / 2;
  var calLeft = (PW - (3 * monthW + 2 * gap)) / 2;
  ctx.textBaseline = 'top';
  var fontName = fs.existsSync(fontPath) ? 'AppFont' : 'sans-serif';
  for (var mi = 0; mi < 12; mi++) {
    var col = mi % 3;
    var row = Math.floor(mi / 3);
    var ox = calLeft + col * (monthW + gap);
    var oy = calTop + row * rowH;
    ctx.font = 'bold ' + labelSize + 'px ' + fontName;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(MONTHS[mi], ox, oy);
    var gx = ox;
    var gy = oy + labelSize + labelGap;
    var daysInMonth = new Date(year, mi + 1, 0).getDate();
    var firstDay    = new Date(year, mi, 1).getDay();
    for (var d = 1; d <= daysInMonth; d++) {
      var idx = firstDay + d - 1;
      var dc  = idx % 7;
      var dr  = Math.floor(idx / 7);
      var cx  = gx + dc * step + dotR;
      var cy  = gy + dr * step + dotR;
      var key = year + '-' + String(mi+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = achievedDates.has(key) ? '#ffffff' : '#484848';
      ctx.fill();
    }
  }
  return canvas.toBuffer('image/png');
}

var DATA_DIR = path.join(__dirname, 'data');
var DATA_FILE = path.join(DATA_DIR, 'goal_records.txt');
var DBG_FILE  = path.join(DATA_DIR, 'debug.json');

function loadAchievedDates() {
  var set = new Set();
  if (!fs.existsSync(DATA_FILE)) return set;
  fs.readFileSync(DATA_FILE, 'utf8').split('\n').forEach(function(line) {
    var t = line.trim();
    if (t) set.add(t);
  });
  return set;
}

function saveAchievedDate(dateStr) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  var set = loadAchievedDates();
  if (!set.has(dateStr)) {
    fs.appendFileSync(DATA_FILE, dateStr + '\n', 'utf8');
  }
}

app.all('/shortcuts/genpic.php', function(req, res) {
  try {
    // Screen size comes from headers
    var screenWidth  = req.headers['screen-wi'] || req.headers['screen-width'] || '390';
    var screenHeight = req.headers['screen-hei'] || req.headers['screen-height'] || '844';

    // Date comes from the 'date' header — sent by shortcut as yyyy-MM-dd
    var dateStr = req.headers['date'] || '';

    // Parse body — if body has content, goal was achieved
    var body = req.body ? (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body)) : '';
    var achieved = body.trim().length > 0;

    // Fallback date if header not set
    if (!dateStr || !dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      var n = new Date();
      dateStr = n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
    } else {
      dateStr = dateStr.substring(0, 10);
    }

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DBG_FILE, JSON.stringify({ screenWidth: screenWidth, screenHeight: screenHeight, achieved: achieved, date: dateStr, lastLine: body.trim().split('\n').pop(), time: new Date().toISOString() }));

    if (achieved) saveAchievedDate(dateStr);

    var achievedDates = loadAchievedDates();
    var imgBuffer     = generateWallpaper(screenWidth, screenHeight, achievedDates);
    var base64Img     = imgBuffer.toString('base64');
    var totalAchieved = achievedDates.size;
    var now2          = new Date();
    var dayOfYear     = Math.floor((now2 - new Date(now2.getFullYear(), 0, 0)) / 86400000);
    var pct           = dayOfYear > 0 ? Math.round((totalAchieved / dayOfYear) * 100) : 0;
    var responseText  = 'status=success\nmessage=' + totalAchieved + ' days achieved (' + pct + '%). Keep it up!\nlink=https://lifesync-server-production.up.railway.app/stats\nlink_text=View my progress\nimage_base64=' + base64Img;
    res.setHeader('Content-Type', 'text/plain');
    res.send(responseText);
  } catch (err) {
    console.error(err);
    res.setHeader('Content-Type', 'text/plain');
    res.send('status=error\nmessage=Server error: ' + err.message + '\nlink=\nlink_text=\nimage_base64=');
  }
});

app.get('/debug', function(req, res) {
  var data = '{}';
  if (fs.existsSync(DBG_FILE)) data = fs.readFileSync(DBG_FILE, 'utf8');
  res.setHeader('Content-Type', 'application/json');
  res.send(data);
});

app.get('/stats', function(req, res) {
  var dates = loadAchievedDates();
  var list  = Array.from(dates).sort();
  var items = list.map(function(d) { return '<li>' + d + '</li>'; }).join('');
  res.send('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LifeSync Goals</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#000;color:#fff;font-family:-apple-system,Helvetica,Arial,sans-serif;padding:2rem 1.5rem;max-width:420px;margin:0 auto}h1{font-size:1.2rem;color:#888;margin-bottom:1.5rem}.big{font-size:4rem;font-weight:700}.sub{color:#555;font-size:.9rem;margin-bottom:2rem}ul{list-style:none}li{padding:.6rem 0;border-bottom:1px solid #111;color:#aaa}</style></head><body><h1>LifeSync Goals</h1><div class="big">' + dates.size + '</div><div class="sub">days achieved this year</div><ul>' + items + '</ul></body></html>');
});

app.get('/', function(req, res) { res.send('LifeSync Goal Server is running'); });

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('LifeSync server running on port ' + PORT); });
