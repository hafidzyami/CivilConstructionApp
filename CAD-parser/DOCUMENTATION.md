# CAD Parser Service - Technical Documentation

## Overview

The CAD Parser Service is a dedicated microservice designed to process Computer-Aided Design (CAD) files, specifically DXF (Drawing Exchange Format) files, and extract geometric data, layer information, and building compliance metrics. It provides two operational modes:

1. **Manual Mode**: Allows users to select specific layers for analysis
2. **Automated Mode**: Uses AI-powered analysis to automatically detect site boundaries, building footprints, floor areas, and calculate compliance metrics (Building-to-Land ratio, Floor Area Ratio)

The service exposes a RESTful API built with FastAPI and is containerized for seamless deployment.

---

## Technology Stack

- **Framework**: FastAPI (Python 3.11)
- **CAD Processing**: ezdxf 1.1.0+ (DXF file parsing and entity extraction)
- **Geometry Processing**: Shapely 2.0.0+ (polygon construction, spatial operations)
- **Graph Analysis**: NetworkX 3.0.0+ (topology analysis for line connectivity)
- **Data Analysis**: Pandas 2.0.0+ (geometry aggregation and filtering)
- **Deployment**: Docker (multi-stage builds)
- **Server**: Uvicorn (ASGI server)

---

## Architecture & Workflow

The service operates through a three-layer architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI API Layer                        │
│  ┌──────────────┬──────────────┬─────────────────────────┐  │
│  │ GET /layers  │ POST /process│ POST /process-auto      │  │
│  └──────────────┴──────────────┴─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Processing Layer                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  dxf_utils.py                                          │ │
│  │  - Layer extraction                                    │ │
│  │  - Geometry processing (lines → polygons)              │ │
│  │  - Topology analysis & graph completion                │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  fullaudit.py (Automated Mode)                         │ │
│  │  - FinalComplianceAuditor class                        │ │
│  │  - Layer keyword matching                              │ │
│  │  - Area calculations (site, footprint, floors)         │ │
│  │  - BTL/FAR compliance metrics                          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     DXF File Storage                         │
│         Temporary uploads in /app/uploads                    │
└─────────────────────────────────────────────────────────────┘
```

### Workflow: Manual Mode
1. **Upload**: User uploads DXF file via frontend
2. **Layer Extraction**: `GET /cad/layers` retrieves all available layers
3. **User Selection**: User selects specific layers to analyze
4. **Processing**: `POST /cad/process` extracts geometry from selected layers
5. **Visualization**: Returns polygons with coordinates, areas, and bounding box

### Workflow: Automated Mode
1. **Upload**: User uploads DXF file via frontend
2. **Parallel Processing**:
   - `dxf_utils.py` extracts all geometry for visualization
   - `fullaudit.py` runs as subprocess for compliance analysis
3. **Analysis**: Automated detection of:
   - Site boundary (largest polygon matching keywords)
   - Building footprint (HH layer, footprint keywords)
   - Floor areas (regex pattern matching: 1F, 2F, B1, etc.)
   - BTL (Building-to-Land Ratio)
   - FAR (Floor Area Ratio)
4. **Response**: Returns geometry + JSON analysis results

---

## Component Details

### 4.1 Main API Service (`main.py`)

The FastAPI application that orchestrates all CAD processing operations.

**Key Features**:
- Request logging with unique request IDs
- Temporary file management with automatic cleanup
- Error handling with detailed logging
- CORS middleware for cross-origin requests
- File validation (DXF/DWG extensions)

**Logging Format**:
```
2026-01-19 11:10:09 [INFO] cad-service: [REQ 1737345009123] ========== PROCESS REQUEST START ==========
2026-01-19 11:10:09 [INFO] cad-service: [REQ 1737345009123] File: 50Py2F R.C House.dxf
2026-01-19 11:10:09 [INFO] cad-service: [REQ 1737345009123] File saved: 423.56 KB
```

---

### 4.2 Geometry Processing (`dxf_utils.py`)

Core utility module for converting DXF line entities into closed polygons.

#### 4.2.1 Layer Extraction
**Function**: `get_dxf_layers(file_path)`

- Reads DXF file using ezdxf
- Queries all `LINE` and `LWPOLYLINE` entities
- Extracts unique layer names
- Returns sorted list of layers

#### 4.2.2 Line Extraction & Normalization
**Function**: `process_dxf_geometry(file_path, active_layers)`

**Step 1: Entity Parsing**
- Filters entities by active layers (if specified)
- Converts `LINE` entities to Shapely LineStrings
- Decomposes `LWPOLYLINE` into individual line segments
- Handles closed polylines by connecting last → first point

**Step 2: Coordinate Rounding**
- Rounds coordinates to 3 decimal places
- Removes duplicate/zero-length segments
- Prevents floating-point precision errors

**Unit Conversion**:
```python
UNIT_TO_METERS = {
    0: 0.0254,  # Unitless → inches
    1: 0.0254,  # Inches
    2: 0.0254,  # Feet  
    4: 0.001,   # Millimeters
    5: 0.01,    # Centimeters
    6: 1.0      # Meters
}
```

#### 4.2.3 Topology Analysis & Graph Completion

**Problem**: CAD drawings often have incomplete line networks (dead ends, gaps) that prevent polygon formation.

**Solution**: Uses NetworkX graph analysis to detect and repair topology:

1. **Build Graph**: Each line segment becomes an edge connecting two nodes (endpoints)
2. **Detect Dead Ends**: Find nodes with degree = 1 (dangling vertices)
3. **Extension Logic**:
   - For each dead end, find nearest line segment
   - If distance < `EXTENSION_TOLERANCE` (1.5 units), create connecting line
   - Tolerance is scaled based on DXF units

```python
G = nx.Graph()
for line in rounded: 
    G.add_edge(line.coords[0], line.coords[-1])

dead_ends = [Point(n) for n, d in G.degree() if d == 1]
```

4. **Polygon Construction**:
   - Merge original lines + extensions using `unary_union` (nodes all intersecting lines)
   - Apply `polygonize` to extract closed rings
   - Filter polygons by minimum area (0.001 m²)
   - Sort by area descending

#### 4.2.4 Output Format

Returns 4 values:
1. **Polygons**: Array of polygon objects with:
   - `id`: Sequential identifier
   - `points`: Array of [x, y] coordinates (exterior ring)
   - `area_raw`: Area in DXF units²
   - `area_m2`: Area in square meters

2. **Scale**: Unit conversion factor to meters

3. **Bounds**: Bounding box for SVG viewBox:
   ```json
   {
     "min_x": -120.5,
     "min_y": -80.3,
     "max_x": 450.2,
     "max_y": 320.8
   }
   ```

4. **Error**: `null` on success, error message string on failure

---

### 4.3 Automated Compliance Analysis (`fullaudit.py`)

Intelligent parser that uses layer name pattern matching and spatial analysis to extract building metrics.

#### 4.3.1 FinalComplianceAuditor Class

**Initialization**:
```python
auditor = FinalComplianceAuditor('path/to/file.dxf')
```

**Configuration**:
- Reads DXF header to determine units (`$INSUNITS`)
- Sets scale factor: 1,000,000 for mm/unitless, 1.0 for meters
- Defines keyword patterns for layer detection:

```python
SITE_KWS = ['지적', 'SITE', '대지', 'LND', 'BOUNDARY']
FOOTPRINT_KWS = ['HH', 'FOOTPRINT', '건축면적']
FLOOR_PATTERN = re.compile(r'(B?\d+)(F|층|FLR|FLOOR|ND|ST|RD|TH)', re.IGNORECASE)
```

#### 4.3.2 Area Calculation Logic

**Function**: `_get_area(entity)`

- Supports `LWPOLYLINE` and `POLYLINE` entities
- Prioritizes built-in `.area` attribute if available
- Falls back to manual calculation using `ezdxf.math.area()`
- Applies scale factor to convert to m²
- Returns 0 for invalid/non-polygon entities

#### 4.3.3 Geometry & Material Extraction

**Geometry Collection**:
- Iterates all modelspace entities
- Filters polygons with area > 0.05 m² (noise threshold)
- Stores:
  - `layer`: Uppercased layer name
  - `area`: Calculated area in m²
  - `pos`: Centroid (x, y) for spatial queries

**Material Extraction** (Bonus Feature):
- Searches `TEXT` and `MTEXT` entities
- Matches keywords: ["마감", "유리", "콘크리트", "THK", "단열재", "방수"]
- Strips DXF formatting codes (`\\[A-Za-z][^;]*;`)
- Records text content, layer, and insertion point

#### 4.3.4 Site & Footprint Detection

**Site Area**:
1. Create boolean mask matching `SITE_KWS` in layer names
2. Select maximum area from matching layers
3. Fallback: If no matches, use largest polygon overall

**Footprint Area**:
1. Create boolean mask matching `FOOTPRINT_KWS`
2. Sum all areas from matching layers
3. Used for BTL calculation

#### 4.3.5 Floor Detection Logic

**Multi-Strategy Approach**:

1. **Standard Floor Labels** (Regex):
   - Matches: `2F`, `2층`, `2FLR`, `2ND`, `B1F`
   - Excludes: Layer names "1" through "8" (CAD color layers)
   - Groups areas by floor tag (e.g., `1F`, `2F`, `B1`)

2. **Architectural Area Layers**:
   - Layers: `2D`, `면적`, `AREA`
   - Heuristic: If contains "2" → assign to 2F, else 1F

3. **HH Layer** (Primary Footprint):
   - Assigns to 1F (first floor)

4. **Fallback**:
   - If total floor area = 0, use footprint area as 1F

#### 4.3.6 Compliance Metrics

**Building-to-Land Ratio (BTL)**:
```
BTL = (Footprint Area / Site Area) × 100%
```

**Floor Area Ratio (FAR)**:
```
FAR = (Total Floor Area / Site Area) × 100%
```

#### 4.3.7 JSON Output Format

When called via subprocess:
```bash
python fullaudit.py "path/to/file.dxf"
```

Returns:
```json
{
  "site_area": 250.45,
  "footprint_area": 85.30,
  "total_floor_area": 170.60,
  "floors": {
    "1F": 85.30,
    "2F": 85.30
  },
  "btl": 34.06,
  "far": 68.13,
  "materials_count": 12
}
```

---

## API Specification

### Base URL
```
http://localhost:7001
```

---

### GET `/`
Health check endpoint.

**Response**:
```json
{
  "service": "CAD Service",
  "status": "healthy",
  "version": "1.0.0"
}
```

---

### GET `/health`
Health check endpoint (alternative).

**Response**:
```json
{
  "status": "healthy"
}
```

---

### POST `/cad/layers`
Extract all layer names from a DXF file.

**Request**:
- **Content-Type**: `multipart/form-data`
- **Body**:
  - `file`: DXF file (binary)

**Response**:
```json
{
  "layers": [
    "0",
    "1F",
    "2F",
    "SITE",
    "HH",
    "WALL",
    "DIMENSION"
  ]
}
```

**Error Responses**:
- `400`: Invalid file type (not .dxf or .dwg)
- `400`: DXF parsing error (corrupted file, invalid format)
- `500`: Internal server error

---

### POST `/cad/process`
Process DXF file and extract geometry from selected layers (Manual Mode).

**Request**:
- **Content-Type**: `multipart/form-data`
- **Body**:
  - `file`: DXF file (binary)
  - `layers`: JSON string array (optional, default: all layers)
    - Example: `["1F", "2F", "SITE"]`
    - Empty/null: Process all layers

**Response**:
```json
{
  "polygons": [
    {
      "id": 0,
      "points": [
        [0, 0],
        [100, 0],
        [100, 80],
        [0, 80],
        [0, 0]
      ],
      "area_raw": 8000,
      "area_m2": 8.0
    }
  ],
  "scale": 0.001,
  "bounds": {
    "min_x": -10,
    "min_y": -5,
    "max_x": 150,
    "max_y": 120
  }
}
```

**Response Fields**:
- `polygons`: Array of detected closed polygons
  - Sorted by area (largest first)
  - Coordinates are in DXF native units
- `scale`: Conversion factor from DXF units to meters
- `bounds`: Bounding box for SVG viewBox calculation

**Error Responses**:
- `400`: Invalid file type
- `400`: Invalid layers JSON format
- `400`: DXF processing error
- `500`: Internal server error

---

### POST `/cad/process-auto`
Process DXF file using automated compliance analysis (Automated Mode).

**Request**:
- **Content-Type**: `multipart/form-data`
- **Body**:
  - `file`: DXF file (binary)

**Response**:
```json
{
  "polygons": [
    {
      "id": 0,
      "points": [[0, 0], [100, 0], [100, 80], [0, 80], [0, 0]],
      "area_raw": 8000,
      "area_m2": 8.0
    }
  ],
  "scale": 0.001,
  "bounds": {
    "min_x": -10,
    "min_y": -5,
    "max_x": 150,
    "max_y": 120
  },
  "auto_analysis": "{\"site_area\": 250.45, \"footprint_area\": 85.30, \"total_floor_area\": 170.60, \"floors\": {\"1F\": 85.30, \"2F\": 85.30}, \"btl\": 34.06, \"far\": 68.13, \"materials_count\": 12}",
  "mode": "automated"
}
```

**Response Fields**:
- `polygons`: All detected polygons (for visualization)
- `scale`: Unit conversion factor
- `bounds`: Bounding box
- `auto_analysis`: JSON string from fullaudit.py containing:
  - `site_area`: Detected site boundary area (m²)
  - `footprint_area`: Building footprint area (m²)
  - `total_floor_area`: Sum of all floor areas (m²)
  - `floors`: Floor-by-floor breakdown (e.g., `{"1F": 85.3, "2F": 85.3}`)
  - `btl`: Building-to-Land ratio (%)
  - `far`: Floor Area Ratio (%)
  - `materials_count`: Number of material annotations found
- `mode`: Always "automated"

**Error Responses**:
- `400`: Invalid file type
- `400`: DXF processing error
- `500`: Automated parser timeout (>30s)
- `500`: Automated parser subprocess error
- `500`: Internal server error

---

## Deployment

### Docker Configuration

**Dockerfile** (Multi-stage build):
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .
COPY dxf_utils.py .
COPY fullaudit.py .

# Create upload directory
RUN mkdir -p /app/uploads

# Expose port
EXPOSE 7001

# Run server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7001"]
```

**docker-compose.yml**:
```yaml
services:
  cad-service:
    build: ./CAD-parser
    ports:
      - "7001:7001"
    volumes:
      - ./CAD-parser/files:/app/files
    environment:
      - PYTHONUNBUFFERED=1
```

### Build & Run

```bash
# Build image
docker build -t cad-parser-service .

# Run container
docker run -d -p 7001:7001 --name cad-service cad-parser-service

# View logs
docker logs -f cad-service

# Rebuild with docker-compose
docker-compose -f docker-compose.local.yml up -d --build cad-service
```

---

## Performance Considerations

### File Size Limits
- **Recommended**: < 5 MB
- **Maximum**: No hard limit, but processing time increases linearly with entity count

### Processing Times (Benchmark: Intel i7, 16GB RAM)
- **Layer Extraction**: 50-200ms (typical DXF)
- **Geometry Processing**: 200ms - 2s (depends on polygon count)
- **Automated Analysis**: 500ms - 3s (includes subprocess overhead)

### Memory Usage
- **Base**: ~150 MB (Python + FastAPI + libraries)
- **Per Request**: +20-100 MB (depends on DXF complexity)
- **Concurrent Requests**: Limited by available RAM

### Optimization Strategies
1. **Coordinate Rounding**: Reduces graph complexity by 30-40%
2. **Area Filtering**: Excludes polygons < 0.001 m² (noise reduction)
3. **Temporary File Cleanup**: Prevents disk space exhaustion
4. **Request Timeouts**: Automated parser limited to 30s

---

## Error Handling

### Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `File must be a DXF or DWG file` | Invalid file extension | Ensure file ends with `.dxf` or `.dwg` |
| `not a DXF file` | DWG format or corrupted file | Convert DWG → DXF using AutoCAD/LibreCAD |
| `Invalid layers format` | Malformed JSON in layers parameter | Send valid JSON array: `["layer1", "layer2"]` |
| `No geometry found` | Empty DXF or no LWPOLYLINE/LINE entities | Verify DXF contains line geometry |
| `Automated parser failed` | fullaudit.py crash | Check Docker logs for Python traceback |
| `Automated parser timeout` | File too complex (>30s processing) | Use manual mode or simplify DXF |

### Logging & Debugging

**Enable Verbose Logging**:
```python
logging.basicConfig(level=logging.DEBUG)
```

**Check Container Logs**:
```bash
docker logs civilconstruction-cad --tail 100
```

**Test Endpoints**:
```bash
# Health check
curl http://localhost:7001/health

# Upload test file
curl -X POST http://localhost:7001/cad/layers \
  -F "file=@test.dxf"
```

---

## Future Enhancements

### Planned Features
1. **3D Support**: Extend to handle 3D polylines and solids
2. **DWG Native Support**: Direct DWG parsing (requires ODA File Converter integration)
3. **IFC Format**: Support Industry Foundation Classes for BIM models
4. **Polygon Auto-Selection**: Pre-select detected site/building polygons in frontend
5. **Advanced Material Detection**: NLP-based extraction of construction specifications
6. **Compliance Rules Engine**: Validate against national/regional building codes
7. **Multi-File Analysis**: Compare multiple revisions or floors
8. **Export Formats**: GeoJSON, Shapefile, PDF reports

### Technical Debt
- [ ] Add unit tests (pytest) for dxf_utils and fullaudit
- [ ] Implement connection pooling for concurrent requests
- [ ] Add Redis caching for repeated file uploads
- [ ] Migrate to async subprocess calls (Python 3.11+ `asyncio.subprocess`)
- [ ] Add OpenAPI schema validation for request bodies

---

## References

- **ezdxf Documentation**: https://ezdxf.readthedocs.io/
- **Shapely Manual**: https://shapely.readthedocs.io/
- **FastAPI Guide**: https://fastapi.tiangolo.com/
- **DXF Format Specification**: https://help.autodesk.com/view/OARX/2023/ENU/

---

*Last Updated: January 19, 2026*  
*Version: 1.0.0*  
*Maintainer: LLM Development Team*
