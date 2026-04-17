FROM node:20-alpine

WORKDIR /app
COPY package.json server.js ./
COPY public ./public

ENV HOST=0.0.0.0
ENV PORT=4310
ENV CODEBUDDY_MODELS_PATH=/data/models.json

EXPOSE 4310
CMD ["node", "server.js"]
