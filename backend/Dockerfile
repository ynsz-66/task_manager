FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
USER node
EXPOSE 3000

# Node runs the TypeScript directly (type stripping), no build step.
CMD ["node", "src/index.ts"]
