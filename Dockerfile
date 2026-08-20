FROM node:24-slim AS base

# Navegador real para renderizar AliExpress y capturar la info de conformidad
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV BROWSER_PATH=/usr/bin/chromium
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=optional

COPY . .
RUN npm run build

ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "npm run start -- -p ${PORT:-3000}"]