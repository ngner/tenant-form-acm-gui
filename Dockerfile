FROM registry.access.redhat.com/ubi9/nodejs-22:latest AS build
USER root
ADD . /usr/src/app
WORKDIR /usr/src/app
RUN npm ci && npm run build

FROM registry.access.redhat.com/ubi9/nginx-120:latest
COPY --from=build /usr/src/app/dist /opt/app-root/src
COPY nginx.conf /etc/nginx/nginx.conf
USER 1001
ENTRYPOINT ["nginx", "-g", "daemon off;"]
