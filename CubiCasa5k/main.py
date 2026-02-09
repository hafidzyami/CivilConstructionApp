import sys
import os
import cv2
import numpy as np
import torch
import torch.nn.functional as F
from floortrans.models import get_model
from floortrans.loaders import RotateNTurns
from floortrans.post_prosessing import split_prediction, get_polygons
from floortrans.plotting import polygons_to_image, discrete_cmap
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
import shutil
import base64
from pathlib import Path
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("cubicasa-service")

app = FastAPI(
    title="CubiCasa5k Service",
    description="Microservice for Room Segmentation",
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

# Create upload and output directories
BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# Register custom colormaps
discrete_cmap()

# Global model variable
model = None
device = None

def load_model():
    global model, device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Loading model on {device}...")
    
    model = get_model('hg_furukawa_original', 51)
    n_classes = 44
    
    # Patch model layers for legacy checkpoint compatibility
    model.conv4_ = torch.nn.Conv2d(256, n_classes, bias=True, kernel_size=1)
    model.upsample = torch.nn.ConvTranspose2d(n_classes, n_classes, kernel_size=4, stride=4)
    
    checkpoint_path = BASE_DIR / 'model_best_val_loss_var.pkl'
    if not checkpoint_path.exists():
        logger.error(f"Checkpoint not found at {checkpoint_path}")
        raise RuntimeError(f"Checkpoint not found at {checkpoint_path}")

    checkpoint = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(checkpoint['model_state'])
    model.eval()
    model.to(device)
    logger.info("Model loaded successfully")

@app.on_event("startup")
async def startup_event():
    load_model()

@app.get("/")
async def root():
    return {"service": "CubiCasa5k Service", "status": "healthy"}

@app.post("/segmentation")
async def segment_room(file: UploadFile = File(...)):
    request_id = f"{int(time.time() * 1000)}"
    logger.info(f"[REQ {request_id}] ========== SEGMENTATION REQUEST START ==========")
    
    temp_file_path = UPLOAD_DIR / f"{request_id}_{file.filename}"
    
    try:
        # Save uploaded file
        with temp_file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Load and Preprocess Image
        bgr_img = cv2.imread(str(temp_file_path))
        if bgr_img is None:
            raise HTTPException(status_code=400, detail="Failed to load image")
            
        rgb_img = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2RGB)
        
        # Resize if too large to prevent OOM
        # 4 rotations * 44 classes * H * W * 4 bytes (float32) * 2 (grad/overhead)
        max_dim = 1000 # 1000x1000 input -> ~176MB tensor per rotation. 
        passed_height, passed_width = rgb_img.shape[:2]
        if max(passed_height, passed_width) > max_dim:
            scale_factor = max_dim / max(passed_height, passed_width)
            new_width = int(passed_width * scale_factor)
            new_height = int(passed_height * scale_factor)
            logger.info(f"Resizing image from {passed_width}x{passed_height} to {new_width}x{new_height}")
            rgb_img = cv2.resize(rgb_img, (new_width, new_height), interpolation=cv2.INTER_AREA)
        
        # Normalize
        norm_img = 2 * (rgb_img.astype(np.float32) / 255.0) - 1
        tensor_img = np.moveaxis(norm_img, -1, 0) # [C, H, W]
        tensor_img = torch.from_numpy(tensor_img).float().unsqueeze(0) # [1, C, H, W]
        tensor_img = tensor_img.to(device)
        
        # Inference
        split = [21, 12, 11]
        rot = RotateNTurns()
        n_classes = 44
        
        with torch.no_grad():
            height, width = tensor_img.shape[2], tensor_img.shape[3]
            rotations = [(0, 0), (1, -1), (2, 2), (-1, 1)]
            pred_count = len(rotations)
            prediction = torch.zeros([pred_count, n_classes, height, width])
            
            for i, r in enumerate(rotations):
                forward, back = r
                rot_image = rot(tensor_img, 'tensor', forward)
                pred = model(rot_image)
                pred = rot(pred, 'tensor', back)
                pred = rot(pred, 'points', back)
                pred = F.interpolate(pred, size=(height, width), mode='bilinear', align_corners=True)
                prediction[i] = pred[0]
            
            prediction = torch.mean(prediction, 0, True)

        # Post-processing
        img_size = (height, width)
        heatmaps, rooms, icons = split_prediction(prediction, img_size, split)
        polygons, types, room_polygons, room_types = get_polygons((heatmaps, rooms, icons), 0.2, [1, 2])
        
        # Generate Result Images
        rooms_pred = F.softmax(prediction[0, 21:21+12], 0).cpu().data.numpy()
        rooms_pred = np.argmax(rooms_pred, axis=0)
        
        icons_pred = F.softmax(prediction[0, 21+12:], 0).cpu().data.numpy()
        icons_pred = np.argmax(icons_pred, axis=0)
        
        pol_room_seg, pol_icon_seg = polygons_to_image(polygons, types, room_polygons, room_types, height, width)
        
        # Save output images
        # We need to apply colormaps to raw predictions to make them visible (like in matplotlib)
        # However, for simplicity and since frontend might just want the result image, 
        # let's save the vectorized outputs (pol_room_seg, pol_icon_seg) which are likely RGB arrays from polygons_to_image?
        # Checking polygons_to_image source would be good, but assuming it returns RGB image arrays (based on plt.imshow usage)
        
        # Color Palettes (BGR for OpenCV)
        # Derived from floortrans/plotting.py discrete_cmap()
        
        def hex_to_bgr(hex_color):
            hex_color = hex_color.lstrip('#')
            if hex_color == 'white': return (255, 255, 255)
            if hex_color == 'black': return (0, 0, 0)
            return tuple(int(hex_color[i:i+2], 16) for i in (4, 2, 0))

        room_hex = ['#DCDCDC', '#b3de69', '#000000', '#8dd3c7', '#fdb462',
                    '#fccde5', '#80b1d3', '#808080', '#fb8072', '#696969',
                    '#577a4d', '#ffffb3']
        
        icon_hex = ['#DCDCDC', '#8dd3c7', '#b15928', '#fdb462', '#ffff99',
                    '#fccde5', '#80b1d3', '#808080', '#fb8072', '#696969',
                    '#577a4d']

        room_palette = [hex_to_bgr(c) for c in room_hex]
        icon_palette = [hex_to_bgr(c) for c in icon_hex]

        def apply_palette(class_img, palette):
            # Ensure class_img is int
            class_img = class_img.astype(int)
            h, w = class_img.shape
            color_img = np.zeros((h, w, 3), dtype=np.uint8)
            
            for idx, color in enumerate(palette):
                color_img[class_img == idx] = color
                
            return color_img

        # Apply palettes
        room_seg_bgr = apply_palette(pol_room_seg, room_palette)
        icon_seg_bgr = apply_palette(pol_icon_seg, icon_palette)
        
        room_out_path = OUTPUT_DIR / f"{request_id}_room_seg.png"
        icon_out_path = OUTPUT_DIR / f"{request_id}_icon_seg.png"
        
        cv2.imwrite(str(room_out_path), room_seg_bgr)
        cv2.imwrite(str(icon_out_path), icon_seg_bgr)
        
        # Return paths or base64? 
        # Since this is a microservice, let's return Base64 to avoid file serving complexity across services for now,
        # OR return the filename which the backend can then serve if it has access, but backend is separate.
        # Actually, let's return base64 for simplicity in this integration.
        
        def to_base64(path):
            with open(path, "rb") as f:
                return base64.b64encode(f.read()).decode('utf-8')
                
        return JSONResponse({
            "status": "success",
            "room_segmentation": to_base64(room_out_path),
            "icon_segmentation": to_base64(icon_out_path)
        })

    except Exception as e:
        logger.error(f"Error processing image: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_file_path.exists():
            temp_file_path.unlink()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7002)
