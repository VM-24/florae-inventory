# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app
# Prisma needs OpenSSL to pick the right engine on Alpine (musl + OpenSSL 3).
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
RUN npm run build

COPY web ./web
RUN npm run web:build

# --- Production stage ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/web/dist ./web/dist
COPY prisma ./prisma

EXPOSE 3000
# Each start applies pending migrations, so every database migrates itself.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
