# Section 5: Computer Vision Model for Regulatory Compliance

## 5.1 Overview
The Computer Vision module is designed to automatically analyze 2D floor plan images to extract semantic information required for regulatory compliance checks. By leveraging the CubiCasa5k dataset and a multi-task neural network architecture, this component identifies and segments key architectural elements such as rooms (Kitchen, Living Room, Bedroom, Bath, etc.) and icons (Windows, Doors, Toilets, Sinks, etc.). This automated extraction enables the system to verify geometric and existence-based regulations without manual data entry.

## 5.2 Technology Stack
*   **Language:** Python 3.8+
*   **Deep Learning Framework:** PyTorch 1.0+
*   **Computer Vision Libraries:** OpenCV, PIL (Python Imaging Library)
*   **API Framework:** FastAPI
*   **Containerization:** Docker, NVIDIA Container Runtime
*   **Model Architecture:** Raster-to-Vector (Stack Hourglass with Multi-task Learning)
*   **Base Model:** `hg_furukawa_original`

## 5.3 Component Details
### 5.3.1 Model Architecture
The core model is based on the architecture presented in "Raster-to-Vector: Revisiting Floorplan Transformation". It utilizes a Stacked Hourglass Network (HG-51) backbone to perform simultaneous tasks:
1.  **Room Segmentation:** Classifies pixels into 12 room types (e.g., Living Room, Kitchen, Bath).
2.  **Icon Detection:** Identifies 11 types of architectural icons (e.g., Window, Door).
3.  **Heatmap Estimation:** Predicts junction points for vectorization.

### 5.3.2 Processing Pipeline
The inference pipeline consists of three stages:
1.  **Pre-processing:**
    *   Image format verification (PNG/JPG/BMP).
    *   Resizing to a maximum dimension (default 1024px) to ensure memory efficiency.
    *   Normalization to [-1, 1] range.
2.  **Inference:**
    *   The image is processed through the neural network.
    *   Test-Time Augmentation (TTA) is applied using 4 rotations (0, 90, 180, 270 degrees) to improve prediction robustness. The results are averaged.
3.  **Post-processing:**
    *   **Pixel-wise Classification:** Argmax is applied to softmax outputs to generate segmentation masks.
    *   **Vectorization (Optional):** Heatmaps and segmentation masks are combined to generate polygon representations of rooms and icons.
    *   **Visualization:** Segmentation masks are colorized for human verification.

### 5.3.3 Classes Detected
**Room Classes:**
*   Background, Outdoor, Wall, Kitchen, Living Room, Bed Room, Bath, Entry, Railing, Storage, Garage, Undefined.

**Icon Classes:**
*   No Icon, Window, Door, Closet, Electrical Appliance, Toilet, Sink, Sauna Bench, Fire Place, Bathtub, Chimney.

## 5.4 API Specification
The Computer Vision module exposes a RESTful API for integration with the backend service.

### 5.4.1 Analyze Floor Plan
**Endpoint:** `POST /analyze`

**Description:** Uploads a floor plan image for analysis. Returns segmentation statistics, summaries, and visualization images.

**Request:**
*   **Content-Type:** `multipart/form-data`
*   **Body:**
    *   `image`: The image file (binary). Supported formats: PNG, JPG, BMP.

**Response:**
*   **Content-Type:** `application/json`
*   **Body Example:**
```json
{
  "success": true,
  "rooms": {
    "classes": ["Background", "Kitchen", ...],
    "stats": {
      "Kitchen": { 
        "pixels": 5020,      // Raw area count (number of pixels detected)
        "percentage": 12.5   // Proportion of the total floor plan area
      },
      "Living Room": { "pixels": 10400, "percentage": 25.0 }
    },
    "summary": { ... }
  },
  "icons": {
    "classes": ["No Icon", "Window", ...],
    "stats": {
      "Window": { "pixels": 400, "percentage": 1.0 }
    },
    "summary": { ... }
  },
  "imageSize": {
    "height": 800,
    "width": 600
  },
  "visualizations": {
    "roomSegmentation": "data:image/png;base64,...",
    "iconSegmentation": "data:image/png;base64..."
  }
}
```

**Error Responses:**
*   `400 Bad Request`: Invalid image file.
*   `500 Internal Server Error`: Inference failed.
*   `503 Service Unavailable`: Model weights not loaded.
