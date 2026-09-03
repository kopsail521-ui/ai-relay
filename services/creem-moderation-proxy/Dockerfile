FROM node:22-alpine
WORKDIR /app
COPY server.mjs marketplace-model-copy.json ./
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "server.mjs"]
