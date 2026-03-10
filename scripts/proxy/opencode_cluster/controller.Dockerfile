FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir requests

WORKDIR /app

COPY master_controller.py /app/master_controller.py

ENTRYPOINT ["python", "/app/master_controller.py"]
