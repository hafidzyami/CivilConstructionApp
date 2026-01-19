"""
FastAPI CAD Service
Microservice for handling CAD/DXF file processing
"""
import json
from dxf_utils import process_dxf_geometry, get_dxf_layers
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
import sys
import time
from pathlib import Path
import shutil
import subprocess

# Configure logging for production
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger("cad-service")

app = FastAPI(
    title="CAD Service",
    description="Microservice for CAD/DXF file processing",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create upload directory
UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "CAD Service",
        "status": "healthy",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.post("/cad/layers")
async def get_layers(file: UploadFile = File(...)):
    """
    Extract layers from a DXF file

    Args:
        file: DXF file upload

    Returns:
        JSON response with list of layers
    """
    request_id = f"{int(time.time() * 1000)}"
    logger.info(f"[REQ {request_id}] ========== LAYERS REQUEST START ==========")
    temp_file_path = None
    
    try:
        # Validate file extension if filename is provided
        if file.filename and not (file.filename.lower().endswith('.dxf') or file.filename.lower().endswith('.dwg')):
            logger.error(f"[REQ {request_id}] Invalid file type: {file.filename}")
            raise HTTPException(status_code=400, detail="File must be a DXF or DWG file")

        logger.info(f"[REQ {request_id}] File: {file.filename or 'unknown'}")

        # Save uploaded file temporarily
        temp_file_path = UPLOAD_DIR / f"{request_id}_{file.filename}"
        with temp_file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_size_kb = temp_file_path.stat().st_size / 1024
        logger.info(f"[REQ {request_id}] File saved: {file_size_kb:.2f} KB")
            
        # Extract layers
        layers, error = get_dxf_layers(str(temp_file_path))
        
        if error:
            logger.error(f"[REQ {request_id}] Layer extraction failed: {error}")
            raise HTTPException(status_code=400, detail=error)
        
        logger.info(f"[REQ {request_id}] Found {len(layers)} layers")
        logger.info(f"[REQ {request_id}] ========== REQUEST COMPLETED ==========")
            
        return JSONResponse({"layers": layers})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[REQ {request_id}] Layer extraction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_file_path and temp_file_path.exists():
            try:
                temp_file_path.unlink()
                logger.info(f"[REQ {request_id}] Temporary file cleaned up")
            except Exception as e:
                logger.warning(f"[REQ {request_id}] Failed to cleanup temp file: {e}")


@app.post("/cad/process")
async def process_cad(
    file: UploadFile = File(...),
    layers: str = Form(default="[]")
):
    """
    Process DXF file and extract geometry

    Args:
        file: DXF file upload
        layers: JSON string array of active layers to process (default: all layers)

    Returns:
        JSON response with polygons, scale, and bounds
    """
    request_id = f"{int(time.time() * 1000)}"
    logger.info(f"[REQ {request_id}] ========== PROCESS REQUEST START ==========")
    temp_file_path = None
    
    try:
        # Validate file extension if filename is provided
        if file.filename and not (file.filename.lower().endswith('.dxf') or file.filename.lower().endswith('.dwg')):
            logger.error(f"[REQ {request_id}] Invalid file type: {file.filename}")
            raise HTTPException(status_code=400, detail="File must be a DXF or DWG file")

        # Parse layers
        try:
            active_layers = json.loads(layers) if layers else []
            logger.info(f"[REQ {request_id}] File: {file.filename or 'unknown'}")
            logger.info(f"[REQ {request_id}] Active layers: {active_layers if active_layers else 'all'}")
        except json.JSONDecodeError as e:
            logger.error(f"[REQ {request_id}] Invalid layers JSON: {e}")
            raise HTTPException(status_code=400, detail="Invalid layers format. Must be a JSON array.")
        
        # Save uploaded file temporarily
        temp_file_path = UPLOAD_DIR / f"{request_id}_{file.filename}"
        with temp_file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_size_kb = temp_file_path.stat().st_size / 1024
        logger.info(f"[REQ {request_id}] File saved: {file_size_kb:.2f} KB")
            
        # Process DXF geometry
        start_time = time.time()
        polygons, scale, bounds, error = process_dxf_geometry(str(temp_file_path), active_layers)
        process_duration = time.time() - start_time
        
        if error:
            logger.error(f"[REQ {request_id}] CAD processing failed: {error}")
            raise HTTPException(status_code=400, detail=error)
        
        logger.info(f"[REQ {request_id}] Processing completed in {process_duration:.2f}s")
        logger.info(f"[REQ {request_id}] Found {len(polygons)} polygons")
        logger.info(f"[REQ {request_id}] ========== REQUEST COMPLETED ==========")
            
        return JSONResponse({
            "polygons": polygons,
            "scale": scale,
            "bounds": bounds
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[REQ {request_id}] CAD processing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_file_path and temp_file_path.exists():
            try:
                temp_file_path.unlink()
                logger.info(f"[REQ {request_id}] Temporary file cleaned up")
            except Exception as e:
                logger.warning(f"[REQ {request_id}] Failed to cleanup temp file: {e}")


@app.post("/cad/process-auto")
async def process_cad_auto(file: UploadFile = File(...)):
    """
    Process DXF file using automated legal.py parser
    
    Args:
        file: DXF file upload
    
    Returns:
        JSON response with polygons, auto-detected site/building areas, and suggestions
    """
    request_id = f"{int(time.time() * 1000)}"
    logger.info(f"[REQ {request_id}] ========== AUTO-PROCESS REQUEST START ==========")
    temp_file_path = None
    
    try:
        # Validate file extension
        if file.filename and not (file.filename.lower().endswith('.dxf') or file.filename.lower().endswith('.dwg')):
            logger.error(f"[REQ {request_id}] Invalid file type: {file.filename}")
            raise HTTPException(status_code=400, detail="File must be a DXF or DWG file")

        logger.info(f"[REQ {request_id}] File: {file.filename or 'unknown'}")
        
        # Save uploaded file temporarily
        temp_file_path = UPLOAD_DIR / f"{request_id}_{file.filename}"
        with temp_file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_size_kb = temp_file_path.stat().st_size / 1024
        logger.info(f"[REQ {request_id}] File saved: {file_size_kb:.2f} KB")
        
        # Run legal.py for automated analysis
        start_time = time.time()
        logger.info(f"[REQ {request_id}] Running automated parser...")
        
        try:
            result = subprocess.run(
                ['python', 'legal.py', str(temp_file_path)],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=Path(__file__).parent
            )
            
            if result.returncode != 0:
                logger.error(f"[REQ {request_id}] Legal parser failed: {result.stderr}")
                raise Exception(f"Automated parser failed: {result.stderr}")
            
            # Parse the output (expecting JSON)
            legal_output = result.stdout.strip()
            logger.info(f"[REQ {request_id}] Legal parser output: {legal_output}")
            
        except subprocess.TimeoutExpired:
            raise Exception("Automated parser timeout")
        except Exception as e:
            logger.error(f"[REQ {request_id}] Legal parser error: {e}")
            raise Exception(f"Automated parser error: {str(e)}")
        
        # Also get the geometry for visualization (all layers)
        polygons, scale, bounds, error = process_dxf_geometry(str(temp_file_path), None)
        
        if error:
            logger.error(f"[REQ {request_id}] Geometry extraction failed: {error}")
            raise HTTPException(status_code=400, detail=error)
        
        process_duration = time.time() - start_time
        logger.info(f"[REQ {request_id}] Auto-processing completed in {process_duration:.2f}s")
        logger.info(f"[REQ {request_id}] Found {len(polygons)} polygons")
        logger.info(f"[REQ {request_id}] ========== REQUEST COMPLETED ==========")
        
        return JSONResponse({
            "polygons": polygons,
            "scale": scale,
            "bounds": bounds,
            "auto_analysis": legal_output,
            "mode": "automated"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[REQ {request_id}] Auto-processing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_file_path and temp_file_path.exists():
            try:
                temp_file_path.unlink()
                logger.info(f"[REQ {request_id}] Temporary file cleaned up")
            except Exception as e:
                logger.warning(f"[REQ {request_id}] Failed to cleanup temp file: {e}")


if __name__ == "__main__":
    logger.info("Starting CAD Service on port 7001...")
    uvicorn.run(app, host="0.0.0.0", port=7001)
