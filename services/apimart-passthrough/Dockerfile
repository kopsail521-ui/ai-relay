FROM node:22-alpine
WORKDIR /app
COPY server.mjs catalog.json ./
ENV PORT=3011
ENV LISTEN_HOST=0.0.0.0
EXPOSE 3011
CMD ["node", "server.mjs"]
