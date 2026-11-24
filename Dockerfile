# Dev/test image for skill-map. Runs the Vite dev server with the source mounted from the host.
FROM node:22-bookworm-slim

WORKDIR /app

# Install dependencies at build time so the container starts quickly.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host 0.0.0.0 so the browser on the host can reach the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
