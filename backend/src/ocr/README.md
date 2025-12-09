# OCR Service for Civil Construction App

This OCR service provides advanced document text extraction capabilities using multiple OCR engines.

## Features

- **Multiple OCR Engines:**
  - **Surya OCR**: Full layout + tables + text detection (all languages)
  - **PaddleOCR**: Korean + Latin text recognition
  - **Hybrid Mode**: Surya layout detection + PaddleOCR text recognition (recommended)

- **Preprocessing Pipeline:**
  - Automatic rotation correction
  - Skew correction
  - Image enhancement

- **Output Formats:**
  - Plain text extraction
  - Structured JSON with bounding boxes and confidence scores
  - Layout and table detection
  - Preprocessed image output

## Installation

### 1. Install Python Dependencies

```bash
cd backend/src/ocr
pip install -r requirements.txt
```

**Note:** For CUDA/GPU support:
- Install `paddlepaddle-gpu` instead of `paddlepaddle`
- Ensure CUDA is properly installed on your system
- PyTorch should auto-detect CUDA availability

### 2. Verify Installation

Test the OCR service directly:

```bash
python ocr_service.py "path/to/image.jpg" "true" "hybrid"
```

Arguments:
- Arg 1: Path to image file
- Arg 2: Use preprocessing (true/false)
- Arg 3: OCR engine (surya/paddle/hybrid)

## API Endpoint

### POST `/api/ocr/process`

Upload and process an image for OCR.

**Request:**
- Content-Type: `multipart/form-data`
- Fields:
  - `image` (file): Image file (JPG, PNG, BMP, TIFF)
  - `preprocessing` (string): "true" or "false"
  - `engine` (string): "surya", "paddle", or "hybrid"

**Response:**

```json
{
  "success": true,
  "textContent": "Extracted text here...",
  "results": {
    "layout": {
      "regions": [
        {
          "bbox": [x1, y1, x2, y2],
          "type": "Paragraph"
        }
      ]
    },
    "tables": [],
    "text_lines": [
      {
        "text": "Line of text",
        "bbox": [x1, y1, x2, y2],
        "confidence": 0.95,
        "region_type": "Paragraph"
      }
    ]
  },
  "preprocessedImage": "base64EncodedImage",
  "metadata": {
    "steps_completed": ["rotation_correction", "skew_correction"],
    "rotation_applied": 2.5
  }
}
```

## Architecture

```
backend/src/ocr/
├── ocr_service.py          # Python OCR service wrapper
├── requirements.txt        # Python dependencies
├── modules/               # OCR implementation modules
│   ├── __init__.py
│   ├── device_utils.py   # GPU/CPU detection
│   ├── paddle_utils.py   # PaddleOCR integration
│   ├── preprocessing.py  # Image preprocessing
│   ├── surya_utils.py    # Surya OCR integration
│   └── io_utils.py       # I/O utilities
└── uploads/              # Temporary file storage
```

## Usage Example (cURL)

```bash
curl -X POST http://localhost:6969/api/ocr/process \
  -F "image=@document.jpg" \
  -F "preprocessing=true" \
  -F "engine=hybrid"
```

## OCR Engine Comparison

| Engine | Layout Detection | Table Detection | Languages | Speed | Accuracy |
|--------|-----------------|----------------|-----------|-------|----------|
| Surya | ✅ Full | ✅ Full | All | Medium | High |
| PaddleOCR | ❌ None | ❌ None | Korean+Latin | Fast | High (Korean) |
| Hybrid | ✅ Full | ✅ Full | Korean+Latin | Medium | Highest |

## Preprocessing Options

When `preprocessing=true`:
1. **Rotation Detection & Correction**: Auto-detects and corrects image rotation
2. **Skew Correction**: Fixes document skew for better OCR accuracy
3. **Contrast Enhancement**: Improves text visibility
4. **Noise Reduction**: Reduces background noise

## Troubleshooting

### CUDA Out of Memory
- Reduce image size before uploading
- Use CPU mode by setting CUDA_VISIBLE_DEVICES=-1

### Missing Dependencies
```bash
pip install --upgrade -r requirements.txt
```

### Python Not Found
- Ensure Python is in system PATH
- Or specify full path in `ocr.controller.ts`

## Performance Tips

1. **Use Hybrid Mode**: Best balance of speed and accuracy
2. **Enable Preprocessing**: Improves OCR accuracy by 15-30%
3. **Optimize Image Size**: Resize large images (>2000px) for faster processing
4. **Use GPU**: 3-5x faster than CPU processing

## License

Same as parent project
