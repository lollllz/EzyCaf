import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
const target = path.resolve('client/dist/downloads');
fs.mkdirSync(target, { recursive: true });
const output = fs.createWriteStream(path.join(target, 'EzyCaf-customer-service.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });
const complete = new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); archive.on('error', reject); });
archive.pipe(output);
for (const file of ['package.json', 'package-lock.json', 'server/package.json', 'client/package.json', 'relay/index.js', 'relay/package.json', 'relay/compose.yaml', 'relay/Caddyfile', 'relay/.env.example', 'relay/DEPLOYMENT.md']) archive.file(file, { name: file });
archive.directory('client/dist/assets', 'client/dist/assets');
archive.file('client/dist/index.html', { name: 'client/dist/index.html' });
archive.append(`FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && npm ci --omit=dev && rm -rf /var/lib/apt/lists/*
COPY client/dist client/dist
COPY relay relay
ENV PORT=8080 RELAY_DATA_DIR=/data
VOLUME /data
EXPOSE 8080
CMD ["node", "relay/index.js"]
`, { name: 'relay/Dockerfile' });
await archive.finalize(); await complete;
console.log('Customer deployment bundle created.');
