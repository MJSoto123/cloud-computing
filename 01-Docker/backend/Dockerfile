FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
EXPOSE 4000

RUN addgroup -S app && adduser -S app -G app
USER app

CMD ["node", "index.js"]
