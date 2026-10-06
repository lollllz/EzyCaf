FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci && rm -rf /var/lib/apt/lists/*
COPY client client
RUN npm run build -w client
COPY relay relay
ENV PORT=8080 RELAY_DATA_DIR=/data
VOLUME /data
EXPOSE 8080
CMD ["node", "relay/index.js"]
