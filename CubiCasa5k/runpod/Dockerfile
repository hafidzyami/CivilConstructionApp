# RunPod Serverless Dockerfile for CubiCasa5k
# Supports both GPU and CPU workers – uses CUDA when available, falls back to CPU.
#
# Build context: CubiCasa5k/ (parent dir)
#   docker build -t cubicasa-runpod -f runpod/Dockerfile .
#
# The model weights (model_best_val_loss_var.pkl) must already be present
# in the build context root.  They are baked into the image so workers can
# start inferencing immediately without a cold-start download.

FROM runpod/pytorch:2.0.1-py3.10-cuda11.8.0-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# System libs needed by OpenCV (headless) and matplotlib
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# PyTorch (CUDA build) is already provided by the base image.
# Install remaining dependencies.
COPY runpod/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Copy the full CubiCasa5k source (floortrans package + handler code)
COPY . /app/

# Set weights path (baked into the image)
ENV CUBICASA_WEIGHTS=/app/model_best_val_loss_var.pkl

CMD ["python", "runpod/handler.py"]
