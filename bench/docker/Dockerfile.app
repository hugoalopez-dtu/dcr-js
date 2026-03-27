FROM node:18-alpine as builder
WORKDIR /app

# Copy only package files for better cache
COPY package*.json ./
COPY app/package*.json ./app/
COPY dcr-engine/package*.json ./dcr-engine/
COPY modeler/package*.json ./modeler/

# Install all dependencies (monorepo/workspaces-aware)
RUN npm install

# Copy source code for build
COPY app ./app
COPY dcr-engine ./dcr-engine
COPY modeler ./modeler

# Build the app (adjust if your build command is different)
WORKDIR /app/app
RUN npm run predeploy

FROM nginx:alpine
COPY --from=builder /app/app/dist/ /usr/share/nginx/html/dcr-js/
COPY bench/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]