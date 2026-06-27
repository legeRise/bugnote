FROM node:20-alpine AS frontend

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=9201 \
    DATA_DIR=/data

WORKDIR /app
COPY server.py ./
COPY --from=frontend /build/dist ./dist

EXPOSE 9201

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:9201/api/health', timeout=3)"

CMD ["python", "server.py"]
