FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ---- runtime ----
FROM node:20-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
RUN npm rebuild better-sqlite3

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/booking.db

EXPOSE 3001
CMD ["node", "dist/index.js"]
