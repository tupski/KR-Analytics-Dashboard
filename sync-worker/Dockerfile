FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install
COPY . .
RUN npm run build

# L-1 Security: Run as non-root user to reduce blast radius if container is compromised.
# node:alpine ships with a built-in 'node' user (uid 1000). Chown the workdir so the
# unprivileged user can still read dist/ and node_modules/.
RUN chown -R node:node /app
USER node

EXPOSE 9090
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9090/health || exit 1
CMD ["node", "dist/index.js"]
