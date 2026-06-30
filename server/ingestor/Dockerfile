FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY index.js ./

EXPOSE 3030

CMD ["npm", "start"]
