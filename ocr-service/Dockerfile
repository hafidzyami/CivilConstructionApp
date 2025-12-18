# Multi-stage build for OCR Service
# Stage 1: Python builder with ML dependencies
FROM python:3.11-slim as builder

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy requirements and install Python dependencies
COPY requirements.txt /tmp/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip setuptools wheel && \
    # Install PaddlePaddle 3.0.0 CPU version from official repository
    pip install paddlepaddle==3.0.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/ && \
    # Install remaining dependencies
    pip install -r /tmp/requirements.txt

# Stage 2: Production runtime
FROM python:3.11-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Add venv to PATH
ENV PATH="/opt/venv/bin:$PATH"

# Create langchain compatibility shim for PaddleX
# PaddleX imports from old langchain paths which have been moved to separate packages
RUN mkdir -p /opt/venv/lib/python3.11/site-packages/langchain/docstore && \
    echo "# Compatibility shim for PaddleX" > /opt/venv/lib/python3.11/site-packages/langchain/__init__.py && \
    echo "from langchain_core.documents import Document" > /opt/venv/lib/python3.11/site-packages/langchain/docstore/__init__.py && \
    echo "from langchain_core.documents import Document" > /opt/venv/lib/python3.11/site-packages/langchain/docstore/document.py && \
    echo "from langchain_text_splitters import RecursiveCharacterTextSplitter" > /opt/venv/lib/python3.11/site-packages/langchain/text_splitter.py

# Set working directory
WORKDIR /app

# Copy application code
COPY . .

# Create non-root user with home directory
RUN groupadd -g 1001 ocruser && \
    useradd -u 1001 -g ocruser -s /bin/bash -m ocruser

# Set HOME environment variable for PaddleOCR cache
ENV HOME=/home/ocruser

# Disable PaddleOCR model source connectivity check (speeds up initialization)
ENV DISABLE_MODEL_SOURCE_CHECK=True

# Create necessary directories with proper permissions
RUN mkdir -p /app/uploads && \
    mkdir -p /home/ocruser/.paddlex/temp && \
    mkdir -p /home/ocruser/.paddleocr && \
    chown -R ocruser:ocruser /app /home/ocruser

USER ocruser

# Expose port
EXPOSE 7000

# Start FastAPI application
CMD ["python", "main.py"]
