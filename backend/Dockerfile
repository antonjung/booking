FROM node:20-slim

# better-sqlite3 needs Python + build tools for native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Rebuild better-sqlite3 native module for this environment
RUN npm rebuild better-sqlite3

COPY tsconfig.json ./
COPY src ./src

RUN npm install --save-dev typescript @types/node \
  && npx tsc \
  && npm uninstall typescript @types/node

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/booking.db

EXPOSE 3001

CMD ["node", "dist/index.js"]
