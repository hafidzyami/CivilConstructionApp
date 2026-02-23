"""
CubiCasa5k Floor Plan Analysis API Service.

Exposes the CubiCasa5k model as a REST API for floor plan image segmentation.
Detects rooms (Kitchen, Living Room, Bed Room, Bath, etc.) and icons
(Window, Door, Toilet, Sink, etc.) from floor plan images.
"""

import os
import io
import sys
import json
import base64
import logging
import traceback

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Add parent directory for floortrans imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from floortrans.models import get_model
from floortrans.loaders import RotateNTurns
from floortrans.post_prosessing import split_prediction, get_polygons
from floortrans.plotting import polygons_to_image, discrete_cmap

# Register custom colormaps
discrete_cmap()

# ------------------------------------------------------------------
# Setup
# ------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cubicasa-service")

app = FastAPI(title="CubiCasa5k Floor Plan Analysis Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------
# Class labels
# ------------------------------------------------------------------
ROOM_CLASSES = [
    "Background", "Outdoor", "Wall", "Kitchen", "Living Room",
    "Bed Room", "Bath", "Entry", "Railing", "Storage", "Garage", "Undefined",
]

ICON_CLASSES = [
    "No Icon", "Window", "Door", "Closet", "Electrical Appliance",
    "Toilet", "Sink", "Sauna Bench", "Fire Place", "Bathtub", "Chimney",
]

N_CLASSES = 44
SPLIT = [21, 12, 11]

# ------------------------------------------------------------------
# Model singleton
# ------------------------------------------------------------------
_model = None
_device = None
_rot = RotateNTurns()


def load_model():
    """Load the CubiCasa5k model (lazy, singleton)."""
    global _model, _device

    if _model is not None:
        return _model, _device

    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Loading CubiCasa5k model on {_device} ...")

    _model = get_model("hg_furukawa_original", 51)
    _model.conv4_ = torch.nn.Conv2d(256, N_CLASSES, bias=True, kernel_size=1)
    _model.upsample = torch.nn.ConvTranspose2d(N_CLASSES, N_CLASSES, kernel_size=4, stride=4)

    weights_path = os.environ.get(
        "CUBICASA_WEIGHTS", "model_best_val_loss_var.pkl"
    )
    if not os.path.exists(weights_path):
        logger.error(f"Weights file not found: {weights_path}")
        raise FileNotFoundError(f"Model weights not found at {weights_path}")

    checkpoint = torch.load(weights_path, map_location=_device)
    _model.load_state_dict(checkpoint["model_state"])
    _model.eval()
    _model.to(_device)
    logger.info("CubiCasa5k model loaded successfully.")
    return _model, _device


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _image_to_base64(arr: np.ndarray) -> str:
    """Convert a uint8 numpy image (H, W, 3) to a data-URI base64 string."""
    success, buf = cv2.imencode(".png", cv2.cvtColor(arr, cv2.COLOR_RGB2BGR))
    if not success:
        return ""
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode()


def _colorize_segmentation(seg: np.ndarray, class_names: list, cmap_name: str) -> np.ndarray:
    """
    Convert an integer segmentation map to an RGB image using matplotlib colormaps.
    Returns a uint8 (H, W, 3) array.
    """
    import matplotlib
    import matplotlib.pyplot as plt

    n = len(class_names)
    cmap = matplotlib.colormaps.get(cmap_name) if hasattr(matplotlib, 'colormaps') else plt.get_cmap(cmap_name)
    norm = matplotlib.colors.Normalize(vmin=0, vmax=n - 0.1)
    rgba = cmap(norm(seg.astype(float)))  # (H, W, 4)
    return (rgba[:, :, :3] * 255).astype(np.uint8)


def _count_pixels(seg: np.ndarray, class_names: list) -> dict:
    """Count pixel area per class and return percentages."""
    total = seg.size
    counts = {}
    for idx, name in enumerate(class_names):
        c = int(np.sum(seg == idx))
        if c > 0:
            counts[name] = {
                "pixels": c,
                "percentage": round(c / total * 100, 2),
            }
    return counts


def _run_inference(rgb_img: np.ndarray, model, device):
    """
    Run CubiCasa5k inference on an RGB image (H, W, 3) uint8.
    Returns raw prediction tensor [1, N_CLASSES, H, W].
    """
    # Normalize to [-1, 1]
    norm_img = 2 * (rgb_img.astype(np.float32) / 255.0) - 1
    tensor_img = torch.from_numpy(np.moveaxis(norm_img, -1, 0)).float().unsqueeze(0).to(device)

    height, width = tensor_img.shape[2], tensor_img.shape[3]

    rotations = [(0, 0), (1, -1), (2, 2), (-1, 1)]
    prediction = torch.zeros([len(rotations), N_CLASSES, height, width])

    with torch.no_grad():
        for i, (fwd, bck) in enumerate(rotations):
            rot_img = _rot(tensor_img, "tensor", fwd)
            pred = model(rot_img)
            pred = _rot(pred, "tensor", bck)
            pred = _rot(pred, "points", bck)
            pred = F.interpolate(pred, size=(height, width), mode="bilinear", align_corners=True)
            prediction[i] = pred[0]

    prediction = torch.mean(prediction, 0, True)
    return prediction, height, width


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "service": "cubicasa5k"}


@app.post("/analyze")
async def analyze_floorplan(image: UploadFile = File(...)):
    """
    Analyze a floor plan image.

    Accepts: image file (PNG / JPG / BMP)
    Returns: room segmentation, icon detection, statistics, visualisation images.
    """
    try:
        model, device = load_model()
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # Read image ---------------------------------------------------
    contents = await image.read()
    try:
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
        rgb_img = np.array(pil_img)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    logger.info(f"Received image: {image.filename}, size={rgb_img.shape}")

    # Resize large images to prevent OOM ----------------------------
    MAX_DIM = 1024
    h, w = rgb_img.shape[:2]
    if max(h, w) > MAX_DIM:
        scale = MAX_DIM / max(h, w)
        new_h, new_w = int(h * scale), int(w * scale)
        # Ensure dimensions are divisible by 4 (required by model stride)
        new_h = (new_h // 4) * 4
        new_w = (new_w // 4) * 4
        rgb_img = cv2.resize(rgb_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
        logger.info(f"Resized image from ({h}, {w}) to ({new_h}, {new_w})")

    # Inference ----------------------------------------------------
    try:
        prediction, height, width = _run_inference(rgb_img, model, device)
    except Exception as e:
        logger.error(f"Inference error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")

    # Post-processing ----------------------------------------------
    img_size = (height, width)

    # Raw argmax segmentation
    rooms_pred = F.softmax(prediction[0, 21:21 + 12], 0).cpu().numpy()
    rooms_pred = np.argmax(rooms_pred, axis=0)

    icons_pred = F.softmax(prediction[0, 21 + 12:], 0).cpu().numpy()
    icons_pred = np.argmax(icons_pred, axis=0)

    # Vectorised polygons (may fail on some images, fall back gracefully)
    pol_room_seg = None
    pol_icon_seg = None
    try:
        heatmaps, rooms, icons = split_prediction(prediction, img_size, SPLIT)
        polygons, types, room_polygons, room_types = get_polygons(
            (heatmaps, rooms, icons), 0.2, [1, 2]
        )
        pol_room_seg, pol_icon_seg = polygons_to_image(
            polygons, types, room_polygons, room_types, height, width
        )
    except Exception as e:
        logger.warning(f"Polygon extraction failed (non-fatal): {e}")

    # Statistics ---------------------------------------------------
    room_stats = _count_pixels(rooms_pred, ROOM_CLASSES)
    icon_stats = _count_pixels(icons_pred, ICON_CLASSES)

    # Summary counts -----------------------------------------------
    room_summary = {}
    for name, info in room_stats.items():
        if name not in ("Background", "Outdoor", "Wall", "Undefined"):
            room_summary[name] = info

    icon_summary = {}
    for name, info in icon_stats.items():
        if name != "No Icon":
            icon_summary[name] = info

    # Visualisation images -----------------------------------------
    room_vis = _colorize_segmentation(rooms_pred, ROOM_CLASSES, "rooms")
    icon_vis = _colorize_segmentation(icons_pred, ICON_CLASSES, "icons")

    result = {
        "success": True,
        "rooms": {
            "classes": ROOM_CLASSES,
            "stats": room_stats,
            "summary": room_summary,
        },
        "icons": {
            "classes": ICON_CLASSES,
            "stats": icon_stats,
            "summary": icon_summary,
        },
        "imageSize": {"height": height, "width": width},
        "visualizations": {
            "roomSegmentation": _image_to_base64(room_vis),
            "iconSegmentation": _image_to_base64(icon_vis),
        },
    }

    # Polygon-based visualisations (optional)
    if pol_room_seg is not None:
        pol_room_vis = _colorize_segmentation(pol_room_seg, ROOM_CLASSES, "rooms")
        pol_icon_vis = _colorize_segmentation(pol_icon_seg, ICON_CLASSES, "icons")
        result["visualizations"]["vectorizedRooms"] = _image_to_base64(pol_room_vis)
        result["visualizations"]["vectorizedIcons"] = _image_to_base64(pol_icon_vis)

    logger.info(
        f"Analysis complete – {len(room_summary)} room types, "
        f"{len(icon_summary)} icon types detected."
    )
    return JSONResponse(content=result)


# ------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 7002))
    uvicorn.run(app, host="0.0.0.0", port=port)
