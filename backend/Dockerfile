FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && \
    cp -R node_modules /tmp/prod_modules && \
    npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY migrations/ ./migrations/
RUN npm run build

FROM node:20-alpine

WORKDIR /app

# Install hytale-downloader CLI
RUN apk add --no-cache wget unzip && \
    wget -q https://downloader.hytale.com/hytale-downloader.zip -O /tmp/hyd.zip && \
    unzip -o /tmp/hyd.zip -d /tmp/hyd && \
    chmod +x /tmp/hyd/hytale-downloader-linux-amd64 && \
    mv /tmp/hyd/hytale-downloader-linux-amd64 /usr/local/bin/hytale-downloader && \
    rm -rf /tmp/hyd.zip /tmp/hyd && \
    apk del unzip

COPY --from=builder /tmp/prod_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/package.json ./

EXPOSE 3001

CMD ["node", "dist/index.js"]