# Application-only rebuild against the verified native runtime. Native parser
# tools and dictionaries remain in that runtime; no OS packages are changed.
ARG PETER_RUNTIME_BASE
FROM ${PETER_RUNTIME_BASE} AS runtime
FROM golang:1.26-bookworm AS builder
WORKDIR /app
RUN sed -i 's@http://deb.debian.org@https://mirrors.cloud.tencent.com@g' /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::By-Hash=false -o Acquire::Retries=1 -o Acquire::https::Timeout=20 update && apt-get install -y --no-install-recommends libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*
ENV GOPROXY=https://goproxy.cn,direct GOMAXPROCS=2
COPY go.mod go.sum ./
COPY third_party/anydoc-go/go.mod third_party/anydoc-go/go.mod
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY --from=runtime /home/appuser/.duckdb /root/.duckdb
COPY . .
ARG VERSION_ARG
ARG COMMIT_ID_ARG
ENV VERSION=${VERSION_ARG} COMMIT_ID=${COMMIT_ID_ARG}
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build make build-prod \
    && go test -c -tags=docker_integration ./internal/sandbox -o /app/sandbox-integration.test
