FROM node:20-alpine
WORKDIR /app

# Install backend dependencies first (better layer caching)
COPY backend/package.json ./
RUN npm install --omit=dev

# Copy backend source and the frontend to serve
COPY backend/ ./
COPY frontend/ ./frontend/

EXPOSE 4000
CMD ["node", "src/server.js"]
