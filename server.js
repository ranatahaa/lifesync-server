const express = require(‘express’);
const { createCanvas } = require(’@napi-rs/canvas’);

const app = express();

// Read raw body so we can parse the file contents sent by the Shortcut
app.use(express.raw({ type: ‘*/*’, limit: ‘10mb’ }));

// ── Draw wallpaper ─────────────────────────────────────────────────────────
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
const step   = dotR * 2 + 2.5 * scale;

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

const gridStartX = ox;
const gridStartY = oy + Math.round(13 * scale) + 4 * scale;

const daysInMonth = new Date(year, mi + 1, 0).getDate();
const firstDay    = new Date(year, mi, 1).getDay();

for (let d = 1; d <= daysInMonth; d++) {
  const index = firstDay + d - 1;
  const cx    = gridStartX + (index % 7) * step + dotR;
  const cy    = gridStartY + Math.floor(index / 7) * step + dotR;

  // Check if this date is in the achieved set (handle any format)
  const isAchieved = [...achievedDates].some(entry => {
    try {
      const date = new Date(entry.trim());
      if (!isNaN(date)) {
        return date.getFullYear() === year &&
               date.getMonth() === mi &&
               date.getDate() === d;
      }
    } catch(e) {}
    return false;
  });

  ctx.beginPath();
  ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
  ctx.fillStyle = isAchieved ? '#ffffff' : '#2e2e2e';
  ctx.fill();
}
```

}

return canvas.toBuffer(‘image/png’);
}

// ── Main endpoint ──────────────────────────────────────────────────────────
app.all(’/shortcuts/genpic.php’, (req, res) => {
try {
// Get screen dimensions from headers (Shortcut sends them here)
const screenWidth  = req.headers[‘screen-width’]  ||
req.headers[‘screen-wi…’]  || ‘390’;
const screenHeight = req.headers[‘screen-height’] ||
req.headers[‘screen-hei…’] || ‘844’;

```
// Parse the file body — this is the records file from the iPhone
// It contains one date per line for each achieved day
const achievedDates = new Set();
if (req.body) {
  const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
  console.log('Body received:', text.substring(0, 300));
  text.split('\n').forEach(line => {
    const t = line.trim();
    if (t) achievedDates.add(t);
  });
}

console.log('Screen:', screenWidth, 'x', screenHeight);
console.log('Achieved dates count:', achievedDates.size);
console.log('Achieved dates:', [...achievedDates]);

const imgBuffer = generateWallpaper(screenWidth, screenHeight, achievedDates);
const base64Img = imgBuffer.toString('base64');

const responseText = [
  `status=success`,
  `message=🎯 ${achievedDates.size} days achieved this year. Keep it up!`,
  `link=https://lifesync-server-production.up.railway.app/stats`,
  `link_text=View my progress`,
  `image_base64=${base64Img}`,
].join('\n');

res.setHeader('Content-Type', 'text/plain');
res.send(responseText);
```

} catch (err) {
console.error(‘Error:’, err);
res.setHeader(‘Content-Type’, ‘text/plain’);
res.send(`status=error\nmessage=Server error: ${err.message}\nlink=\nlink_text=\nimage_base64=`);
}
});

app.get(’/’, (req, res) => res.send(‘LifeSync Goal Server is running ✓’));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LifeSync server running on port ${PORT}`));
