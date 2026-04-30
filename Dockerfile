FROM node:20-alpine

WORKDIR /app

COPY server/package*.json ./server/
RUN npm ci --omit=dev --prefix ./server

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

EXPOSE 8080

CMD ["node", "server/server.js"]
