const express = require(‘express’);
const fs = require(‘fs’);
const path = require(‘path’);
const { createCanvas } = require(’@napi-rs/canvas’);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function getParam(req, key) {
return (req.query[key] !== undefined ? req.query[key] : (req.body && req.body[key] !== undefined ? req.body[key] : ‘’)).toString().trim();
}

function generateWallpaper(screenWidth, screenHeight, achievedDates) {
const W = parseInt(screenWidth) || 390;
const H = parseInt(screenHeight) || 844;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext(‘2d’);

ctx.fillStyle = ‘#000000’;
ctx.fillRect(0, 0, W, H);

const now = new Date();
const year = now.getFullYear();
const MONTHS = [‘Jan’,‘Feb’,‘Mar’,‘Apr’,‘May’,‘Jun’,‘Jul’,‘Aug’,‘Sep’,‘Oct’,‘Nov’,‘Dec’];

const scale = W / 390;
const dotR   = 5.5 * scale;
const dotGap = 3.0 * scale;
const step   = dotR * 2 + dotGap;
const monthGridW = 7 * step;
const labelSize = Math.round(12 * scale);
const labelGap  = 5 * scale;
const monthGridH = 6 * step;
const blockH = labelSize + labelGap + monthGridH;
const padX = (W - 3 * monthGridW) / 4;
const startY = H * 0.36;
const totalCalH = 4 * blockH;
const rowGap = (H - startY - totalCalH) / 5;

ctx.textBaseline = ‘top’;

for (var mi = 0; mi < 12; mi++) {
var col = mi % 3;
var row = Math.floor(mi / 3);
var ox = padX + col * (monthGridW + padX);
var oy = startY + row * (blockH + rowGap);

```
ctx.font = 'bold ' + labelSize + 'px Helvetica, Arial, sans-serif';
ctx.fillStyle = '#ffffff';
ctx.fillText(MONTHS[mi], ox, oy);

var gridStartX = ox;
var gridStartY = oy + labelSize + labelGap;
var daysInMonth = new Date(year, mi + 1, 0).getDate();
var firstDay    = new Date(year, mi, 1).getDay();

for (var d = 1; d <= daysInMonth; d++) {
  var index = firstDay + d - 1;
  var dc    = index % 7;
  var dr    = Math.floor(index / 7);
  var cx    = gridStartX + dc * step + dotR;
  var cy    = gridStartY + dr * step + dotR;
  var dateKey    = year + '-' + String(mi + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  var isAchieved = achievedDates.has(dateKey);

  ctx.beginPath();
  ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
  ctx.fillStyle = isAchieved ? '#ffffff' : '#3a3a3a';
  ctx.fill();
}
```

}

return canvas.toBuffer(‘image/png’);
}

var DATA_DIR = path.join(__dirname, ‘data’);
var DATA_FILE = path.join(DATA_DIR, ‘goal_records.txt’);

function loadAchievedDates() {
var set = new Set();
if (!fs.existsSync(DATA_FILE)) return set;
fs.readFileSync(DATA_FILE, ‘utf8’).split(’\n’).forEach(function(line) {
var t = line.trim();
if (t) set.add(t);
});
return set;
}

function saveAchievedDate(dateStr) {
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
var set = loadAchievedDates();
if (!set.has(dateStr)) {
fs.appendFileSync(DATA_FILE, dateStr + ‘\n’, ‘utf8’);
}
}

app.all(’/shortcuts/genpic.php’, function(req, res) {
try {
var screenWidth = getParam(req, ‘screen_width’) || ‘390’;
var screenHeight = getParam(req, ‘screen_height’) || ‘844’;
var achieved = getParam(req, ‘achieved’);
var dateStr = getParam(req, ‘date’) || new Date().toISOString().split(‘T’)[0];

```
if (achieved && achieved.toLowerCase() !== 'no' && achieved !== '') {
  saveAchievedDate(dateStr);
}

var achievedDates = loadAchievedDates();
var imgBuffer = generateWallpaper(screenWidth, screenHeight, achievedDates);
var base64Img = imgBuffer.toString('base64');
var totalAchieved = achievedDates.size;
var now = new Date();
var dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
var pct = dayOfYear > 0 ? Math.round((totalAchieved / dayOfYear) * 100) : 0;

var responseText = 'status=success\nmessage=' + totalAchieved + ' days achieved (' + pct + '%). Keep it up!\nlink=https://lifesync-server-production.up.railway.app/stats\nlink_text=View my progress\nimage_base64=' + base64Img;

res.setHeader('Content-Type', 'text/plain');
res.send(responseText);
```

} catch (err) {
console.error(err);
res.setHeader(‘Content-Type’, ‘text/plain’);
res.send(’status=error\nmessage=Server error: ’ + err.message + ‘\nlink=\nlink_text=\nimage_base64=’);
}
});

app.get(’/stats’, function(req, res) {
var dates = loadAchievedDates();
var list = Array.from(dates).sort();
var items = list.map(function(d) { return ‘<li>’ + d + ‘</li>’; }).join(’’);
res.send(’<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LifeSync Goals</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#000;color:#fff;font-family:-apple-system,Helvetica,Arial,sans-serif;padding:2rem 1.5rem;max-width:420px;margin:0 auto}h1{font-size:1.2rem;color:#888;margin-bottom:1.5rem;letter-spacing:.05em;text-transform:uppercase}.big{font-size:4rem;font-weight:700;line-height:1}.sub{color:#555;font-size:.9rem;margin-top:.4rem;margin-bottom:2rem}ul{list-style:none;padding:0}li{padding:.6rem 0;border-bottom:1px solid #111;color:#aaa;font-size:.9rem;display:flex;align-items:center;gap:.6rem}li::before{content:””;width:8px;height:8px;border-radius:50%;background:#fff;flex-shrink:0}</style></head><body><h1>LifeSync Goals</h1><div class="big">’ + dates.size + ‘</div><div class="sub">days achieved this year</div><ul>’ + items + ‘</ul></body></html>’);
});

app.get(’/’, function(req, res) {
res.send(‘LifeSync Goal Server is running’);
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
console.log(’LifeSync server running on port ’ + PORT);
});
