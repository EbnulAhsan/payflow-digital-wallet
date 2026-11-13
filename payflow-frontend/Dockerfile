# PayFlow web image: build the React app, serve it with Nginx.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The API is reached through the same Nginx (see nginx.conf), so the base
# path is relative and no host name is baked into the bundle.
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build


FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
