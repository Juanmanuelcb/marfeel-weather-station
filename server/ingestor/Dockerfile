FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY index.js signer.worker.js ./

EXPOSE 3030

# node, not npm: the npm wrapper does not forward SIGTERM, so graceful
# shutdown (the batch flush) would never run before the 30s restart.
CMD ["node", "index.js"]
