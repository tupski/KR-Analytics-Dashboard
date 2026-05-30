FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Build
FROM base AS builder
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production runner
FROM base AS runner
RUN apk add --no-cache postgresql-client
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy migration scripts & SQL (db/migrate.cjs, db/start.cjs, db/migrations/)
COPY --from=builder /app/db/migrate.cjs ./db/migrate.cjs
COPY --from=builder /app/db/start.cjs ./db/start.cjs
COPY --from=builder /app/db/migrations ./db/migrations
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "db/start.cjs"]
