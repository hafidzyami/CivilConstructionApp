# CAD Service

Microservice for handling CAD/DXF file processing operations.

## Overview

This service provides REST API endpoints for processing CAD files (DXF/DWG format), extracting layers, and converting geometric data into structured polygons.

## Features

- **Layer Extraction**: Extract all available layers from DXF/DWG files
- **Geometry Processing**: Convert CAD entities into polygons with area calculations
- **Unit Conversion**: Automatic unit detection and conversion to meters
- **Smart Edge Handling**: Automatically extends and connects nearly-touching edges

## API Endpoints

### `GET /`
Health check endpoint
- Returns service status

### `GET /health`
Health check endpoint
- Returns: `{"status": "healthy"}`

### `POST /cad/layers`
Extract layers from a CAD file

**Request:**
- `file`: DXF or DWG file (multipart/form-data)

**Response:**
```json
{
  "layers": ["Layer1", "Layer2", "0", "Walls"]
}
```

### `POST /cad/process`
Process CAD file and extract geometry

**Request:**
- `file`: DXF or DWG file (multipart/form-data)
- `layers`: JSON array of active layers to process (optional, default: all layers)

**Response:**
```json
{
  "polygons": [
    {
      "id": 0,
      "points": [[x1, y1], [x2, y2], ...],
      "area_raw": 1234.56,
      "area_m2": 12.34
    }
  ],
  "scale": 0.0254,
  "bounds": {
    "min_x": 0,
    "min_y": 0,
    "max_x": 100,
    "max_y": 100
  }
}
```

## Technology Stack

- **FastAPI**: Web framework
- **ezdxf**: DXF/DWG file parsing
- **Shapely**: Geometric operations
- **NetworkX**: Graph-based topology analysis

## Docker Configuration

### Port
- **7001**: HTTP API endpoint

### Resources
- Memory Limit: 2GB
- Memory Reservation: 512MB

### Environment Variables
- `PYTHONUNBUFFERED=1`: Enable real-time Python logging

## Local Development

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Run Service
```bash
python main.py
```

The service will be available at `http://localhost:7001`

## Docker Deployment

The service is automatically deployed as part of the main application using docker-compose:

```bash
docker-compose -f docker-compose.local.yml up -d cad-service
```

## Integration

The CAD service is called by the backend API through the `CAD_SERVICE_URL` environment variable, which defaults to `http://cad-service:7001` in Docker environments.

Backend controller: `backend/src/controllers/cad.controller.ts`
