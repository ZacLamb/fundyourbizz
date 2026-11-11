// Runs during the Railway build: copies site photos into public/img/photos so they're served locally.
const fs = require('fs');
const path = require('path');
const photos = require('../lib/photos');

const dir = path.join(__dirname, '..', 'public', 'img', 'photos');
fs.mkdirSync(dir, { recursive: true });

(async () => {
  for (const [name, url] of Object.entries(photos)) {
    const dest = path.join(dir, `${name}.jpeg`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 10000) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      console.log(`photo ${name} saved`);
    } catch (e) {
      console.warn(`photo ${name} not downloaded (${e.message}); server will redirect to source`);
    }
  }
})();
