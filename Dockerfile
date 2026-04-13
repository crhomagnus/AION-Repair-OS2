FROM node:20-bookworm-slim

RUN groupadd -r aion && useradd -r -g aion -m aion

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=aion:aion . .

RUN mkdir -p /app/data && chown aion:aion /app/data

USER aion

EXPOSE 3001

CMD ["npm", "start"]
