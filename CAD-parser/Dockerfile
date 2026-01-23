# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .
COPY dxf_utils.py .
COPY fullaudit.py .
COPY llm_extractor.py .

# Create uploads directory
RUN mkdir -p /app/uploads

# Expose port
EXPOSE 7001

# Run the application
CMD ["python", "main.py"]
