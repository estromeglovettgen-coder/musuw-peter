FROM python:3.11-slim AS image-codecs
COPY requirements-images.txt /tmp/requirements-images.txt
RUN pip install --no-cache-dir --only-binary=:all: --target /opt/image-codecs -r /tmp/requirements-images.txt

FROM musuw-peter:thin-common-20261019-capacity

# The verified shared runtime already provides Python 3 and curl. Override its
# application entrypoint; this container runs only the copied image workbench.
USER 0
WORKDIR /app/fire-showcase
RUN python3 -c "import fcntl, sqlite3, ssl" \
    && command -v curl >/dev/null \
    && install -d -o 10001 -g 10001 -m 0700 /data/showcase

COPY --from=image-codecs --chown=10001:10001 /opt/image-codecs/ ./
COPY --chown=10001:10001 fire_server.py server.py generation_tasks.py image_ingest.py requirements-images.txt modelflare_adapter.py reference_workflow.py public-config.json ./
COPY --chown=10001:10001 site/ ./site/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FIRE_SHOWCASE_DATA_DIR=/data/showcase \
    HOME=/tmp

USER 10001:10001
EXPOSE 5179

# The secret is read inside Python, never expanded into curl's process argv.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python3", "-c", "import json,os,sys,urllib.request; r=urllib.request.Request('http://127.0.0.1:5179/__local/health',headers={'X-Fire-Bridge-Token':os.environ['FIRE_SHOWCASE_BRIDGE_TOKEN']}); o=urllib.request.build_opener(urllib.request.ProxyHandler({})); d=json.load(o.open(r,timeout=3)); sys.exit(0 if d.get('status')=='ok' else 1)"]

ENTRYPOINT ["python3", "/app/fire-showcase/fire_server.py"]
CMD ["--host", "0.0.0.0", "--port", "5179"]
