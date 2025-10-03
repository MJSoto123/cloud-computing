# Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
RUN npm i -g serve
WORKDIR /site
COPY --from=build /app/dist ./
EXPOSE 80
CMD ["serve","-s",".","-l","80"]
