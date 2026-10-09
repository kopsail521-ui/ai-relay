FROM node:22-alpine
WORKDIR /app
COPY server.mjs catalog.json ./
ENV NODE_ENV=production
ENV PORT=3020
ENV LISTEN_HOST=0.0.0.0
EXPOSE 3020
CMD ["node", "server.mjs"]
