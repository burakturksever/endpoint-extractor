FROM node:22-bookworm-slim

WORKDIR /app

# SQLite database inside the container (path is relative to prisma/schema.prisma).
ENV DATABASE_URL="file:./dev.db"

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  libnss3 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libxshmfence1 \
  libasound2 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libxfixes3 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxext6 \
  libxrender1 \
  libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
RUN npx playwright install chromium

COPY . .

RUN npm run prisma:generate
RUN npx prisma db push
RUN npm run build

EXPOSE 3000
# Bind to all interfaces inside the container; publish the port to localhost only
# (e.g. docker run -p 127.0.0.1:3000:3000 ...).
CMD ["npx", "next", "start", "-H", "0.0.0.0"]
