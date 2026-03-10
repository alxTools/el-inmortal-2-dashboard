FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    nodejs \
    npm \
    tini \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    requests \
    httpx \
    beautifulsoup4 \
    lxml \
    playwright \
    trafilatura

RUN playwright install --with-deps chromium

RUN npm install -g opencode-ai

RUN useradd -m -u 1000 -s /bin/bash opencode

COPY start-worker.sh /usr/local/bin/start-worker.sh
RUN chmod +x /usr/local/bin/start-worker.sh

USER opencode
WORKDIR /workspace

ENV OPENCODE_SERVER_USERNAME=opencode
ENV OPENCODE_SERVER_PASSWORD=
ENV OPENCODE_SERVER_HOSTNAME=0.0.0.0
ENV OPENCODE_SERVER_PORT=4096
ENV OPENCODE_MODEL=openai/gpt-5
ENV TAVILY_API_KEY=

EXPOSE 4096

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/start-worker.sh"]
