# Frontend KioskPOS Web (PWA) — build con Node, se sirve con nginx.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Config de nginx armada en caliente (PORT/BACKEND_HOST) en docker-entrypoint.sh,
# a partir de este template — ver ese archivo y RAILWAY.md.
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
