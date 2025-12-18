# OCR Microservice

FastAPI-based microservice for OCR processing with multiple engines.

## Features

- **Multiple OCR Engines**:
  - Surya: Advanced layout detection, table recognition
  - PaddleOCR: Korean + Latin text recognition
  - Hybrid: Surya layout + PaddleOCR text (best results)

- **Image Preprocessing**: Automatic grayscale conversion, rotation correction, border removal

- **Production Logging**: Comprehensive timing and debug logs for all processing steps

## API Endpoints

### `POST /ocr/process`

Process OCR on uploaded image.

**Request:**
- `file`: Image file (multipart/form-data)
- `preprocessing`: Boolean (default: true)
- `engine`: String - 'surya', 'paddle', or 'hybrid' (default: 'hybrid')

**Response:**
```json
{
  "text": "Extracted text...",
  "preprocessedImage": "base64...",
  "preprocessingMetadata": {...},
  "results": {
    "layout": {...},
    "tables": [...],
    "text_lines": [...]
  }
}
```

### `GET /health`

Health check endpoint.

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run locally
python main.py
```

## Docker

```bash
# Build image
docker build -t ocr-service .

# Run container
docker run -p 7000:7000 ocr-service
```

## Environment Variables

- `PYTHONUNBUFFERED=1`: Enable real-time logging

## Performance

- First request: 20-30 minutes (model downloads)
- Subsequent requests: 30-60 seconds per image
- Memory: 4-8GB recommended
