FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
ENV NODE_ENV=production PORT=8790 DATA_DIR=/data
EXPOSE 8790
USER node
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8790/api/health || exit 1
CMD ["node", "server.js"]
