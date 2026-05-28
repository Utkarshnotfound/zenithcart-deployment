# =========================================================
# Stage 1: Build dependencies and compile wheels
# =========================================================
FROM python:3.10-slim AS builder

WORKDIR /usr/src/app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install compiler toolchain for compiling binary python wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# =========================================================
# Stage 2: Clean runtime environment
# =========================================================
FROM python:3.10-slim

WORKDIR /usr/src/app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH=/root/.local/bin:$PATH

# Copy pre-built dependencies from Stage 1
COPY --from=builder /root/.local /root/.local
COPY . .

EXPOSE 8001

# Health check utilizing Python's built-in urllib module to avoid installing curl/wget
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request, json; exit(0 if json.loads(urllib.request.urlopen('http://localhost:8001/health').read().decode())['status'] == 'healthy' else 1)" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
