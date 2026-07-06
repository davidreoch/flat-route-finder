FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3010
EXPOSE 3010

CMD ["node", "server.js"]
