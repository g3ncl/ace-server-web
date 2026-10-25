# Pin the dedicated-server build so every image includes verified game files.
FROM docker.io/library/ubuntu:24.04 AS server-files
ARG ACE_SERVER_ARCHIVE_URL=https://github.com/g3ncl/ace-server-web/releases/download/0.1.0/ace-dedicated-server-24991735.tar.gz
ARG ACE_SERVER_ARCHIVE_SHA256=f9583dced9b0a27406c2d8da8dea6b28909f0e46225735f68281b568ae200be1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl --fail --location --retry 3 "$ACE_SERVER_ARCHIVE_URL" -o /tmp/server.tar.gz \
    && printf '%s  /tmp/server.tar.gz\n' "$ACE_SERVER_ARCHIVE_SHA256" | sha256sum -c - \
    && mkdir -p /server && tar --extract --gzip --no-same-owner --file /tmp/server.tar.gz --directory /server \
    && test -s /server/AssettoCorsaEVOServer.exe && test -s /server/content.kspkg \
    && test -s /server/cars.json && test -s /server/events_practice.json && test -s /server/events_race_weekend.json

FROM docker.io/library/node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM docker.io/library/ubuntu:24.04 AS runtime
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends wine wine64 qemu-user xvfb xauth tini ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1001 appuser \
    && mkdir -p /data /server && chown appuser:appuser /data /server
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    ACE_WEB_HOST=127.0.0.1 PORT=3000 ACE_DATA_DIR=/data ACE_SERVER_DIR=/server \
    ACE_NEXT_SERVER=/app/server.js DISPLAY=:99 WINEDEBUG=-all WINEARCH=win64 \
    WINEDLLOVERRIDES="mscoree,mshtml=;winemenubuilder.exe=d"
WORKDIR /app
COPY --from=server-files --chown=appuser:appuser /server /server
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build --chown=appuser:appuser /app/.next/standalone ./
COPY --from=build --chown=appuser:appuser /app/.next/static ./.next/static
COPY --from=build --chown=appuser:appuser /app/public ./public
COPY --chown=appuser:appuser scripts ./scripts
COPY --chown=appuser:appuser shared ./shared
COPY LICENSE ./LICENSE
USER appuser
EXPOSE 3000 9700/tcp 9700/udp 8080/tcp
HEALTHCHECK --start-period=30s --interval=30s --timeout=5s CMD node -e "const h=require('http');h.get({socketPath:'/data/control.sock',path:'/status'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/entrypoint.sh"]
CMD ["node", "scripts/start.mjs"]
