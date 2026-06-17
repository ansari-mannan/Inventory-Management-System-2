FROM node:20-alpine

# tini gives us proper PID 1 signal handling so SIGTERM reaches Node for
# graceful shutdown during K8s rolling updates.
RUN apk add --no-cache tini

WORKDIR /app

# Install production dependencies only, leveraging layer caching.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

# Run as the built-in non-root 'node' user.
USER node

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
