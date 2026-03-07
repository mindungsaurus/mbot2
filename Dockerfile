# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Build dependencies for native modules (e.g. canvas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

FROM deps AS build
WORKDIR /app

COPY nest-cli.json tsconfig*.json ./
COPY src ./src

RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV FONTCONFIG_PATH=/etc/fonts
ENV FONTCONFIG_FILE=/etc/fonts/fonts.conf

# Runtime libs for native modules (e.g. canvas) + OpenSSL for Prisma
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libfontconfig1 \
    openssl \
    fontconfig \
    fontconfig-config \
    fonts-dejavu-core \
    fonts-noto-core \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    fonts-nanum \
  && fc-cache -f -v \
  && rm -rf /var/lib/apt/lists/*

# Keep full deps node_modules so prisma CLI is available at startup
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY prisma ./prisma
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["sh", "-c", "npx prisma generate && node dist/main"]
