FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4173
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/docs/.vitepress/dist ./docs/.vitepress/dist
COPY config ./config
COPY data ./data
COPY scripts ./scripts
COPY server ./server
EXPOSE 4173
CMD ["node", "server/server.mjs"]
