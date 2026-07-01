FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js signer.worker.js ./

EXPOSE 3030

USER node

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
	CMD node -e "require('http').get('http://localhost:3030/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# node, not npm: the npm wrapper does not forward SIGTERM, so graceful
# shutdown (the batch flush) would never run before the 30s restart.
CMD ["node", "index.js"]
