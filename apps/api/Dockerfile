# Immagine dell'API per la VM Oracle (deploy/compose.yml) o per test locali con Docker.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations
# Cartella delle foto: sulla VM è un volume Docker, deve appartenere all'utente node.
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 4000
CMD ["npm", "start"]
