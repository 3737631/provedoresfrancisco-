FROM node:24-slim AS base

# Navegador real para renderizar AliExpress y capturar la info de conformidad
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV BROWSER_PATH=/usr/bin/chromium
WORKDIR /app

# npm ci con devDependencies (necesarias para el build: tailwindcss, typescript).
# OJO: NODE_ENV=production NO debe estar antes de npm ci o npm omite las devDeps.
COPY package.json package-lock.json ./
RUN npm ci

ENV NODE_ENV=production
COPY . .
RUN npm run build

ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "npm run start -- -p ${PORT:-3000}"]