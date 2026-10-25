FROM docker.io/library/node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM docker.io/library/ubuntu:24.04 AS runtime
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends wine wine64 xvfb xauth tini ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1001 appuser \
    && mkdir -p /data /server && chown appuser:appuser /data /server
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    ACE_WEB_HOST=127.0.0.1 PORT=3000 ACE_DATA_DIR=/data ACE_SERVER_DIR=/server \
    ACE_NEXT_SERVER=/app/server.js DISPLAY=:99 WINEDEBUG=-all WINEARCH=win64 \
    WINEDLLOVERRIDES="mscoree,mshtml=;winemenubuilder.exe=d"
WORKDIR /app
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
