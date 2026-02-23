"""
RunPod Serverless handler for CubiCasa5k floor plan analysis.

Request format:
{
    "input": {
        "image": "<base64-encoded image bytes>",
        "filename": "floorplan.png"   # optional, for logging
    }
}

Response (RunPod output field):
{
    "success": true,
    "rooms": { "classes": [...], "stats": {...}, "summary": {...} },
    "icons": { "classes": [...], "stats": {...}, "summary": {...} },
    "imageSize": { "height": H, "width": W },
    "visualizations": {
        "roomSegmentation": "data:image/png;base64,...",
        "iconSegmentation": "data:image/png;base64,...",
        "vectorizedRooms":  "data:image/png;base64,...",  # optional
        "vectorizedIcons":  "data:image/png;base64,...",  # optional
    }
}
"""

import os
import io
import sys
import base64
import logging
import traceback

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

# Allow imports from the parent /app directory (floortrans package)
sys.path.insert(0, '/app')

from floortrans.models import get_model
from floortrans.loaders import RotateNTurns
from floortrans.post_prosessing import split_prediction, get_polygons
from floortrans.plotting import polygons_to_image, discrete_cmap

import runpod

# Register custom matplotlib colormaps
discrete_cmap()

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("runpod-cubicasa")

# ------------------------------------------------------------------
# Constants
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
MAX_DIM = 1024  # resize large images to prevent OOM on CPU

# ------------------------------------------------------------------
# Model singleton (loaded once per worker)
# ------------------------------------------------------------------
_model = None
_device = None
_rot = RotateNTurns()


def load_model():
    """Load the CubiCasa5k model (singleton per worker lifetime)."""
    global _model, _device

    if _model is not None:
        return _model, _device

    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Loading CubiCasa5k model on {_device} ...")

    _model = get_model("hg_furukawa_original", 51)
    _model.conv4_ = torch.nn.Conv2d(256, N_CLASSES, bias=True, kernel_size=1)
    _model.upsample = torch.nn.ConvTranspose2d(N_CLASSES, N_CLASSES, kernel_size=4, stride=4)

    weights_path = os.environ.get("CUBICASA_WEIGHTS", "/app/model_best_val_loss_var.pkl")
    if not os.path.exists(weights_path):
        raise FileNotFoundError(f"Model weights not found at {weights_path}")

    checkpoint = torch.load(weights_path, map_location=_device)
    _model.load_state_dict(checkpoint["model_state"])
    _model.eval()
    _model.to(_device)
    logger.info("CubiCasa5k model loaded successfully.")
    return _model, _device


# ------------------------------------------------------------------
# Helpers (same as api_service.py)
# ------------------------------------------------------------------
def _image_to_base64(arr: np.ndarray) -> str:
    """Convert uint8 numpy image (H, W, 3) to data-URI base64 string."""
    success, buf = cv2.imencode(".png", cv2.cvtColor(arr, cv2.COLOR_RGB2BGR))
    if not success:
        return ""
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode()


def _colorize_segmentation(seg: np.ndarray, class_names: list, cmap_name: str) -> np.ndarray:
    """Convert integer segmentation map to RGB image via matplotlib colormap."""
    import matplotlib
    import matplotlib.pyplot as plt

    n = len(class_names)
    cmap = (matplotlib.colormaps.get(cmap_name)
            if hasattr(matplotlib, 'colormaps')
            else plt.get_cmap(cmap_name))
    norm = matplotlib.colors.Normalize(vmin=0, vmax=n - 0.1)
    rgba = cmap(norm(seg.astype(float)))
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
    """Run CubiCasa5k inference on an RGB (H, W, 3) uint8 image."""
    norm_img = 2 * (rgb_img.astype(np.float32) / 255.0) - 1
    tensor_img = (torch.from_numpy(np.moveaxis(norm_img, -1, 0))
                  .float().unsqueeze(0).to(device))

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
# Core analysis function
# ------------------------------------------------------------------
def analyze(image_bytes: bytes, filename: str = "image") -> dict:
    """Run full analysis pipeline and return the result dict."""
    model, device = load_model()

    # Decode image
    try:
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        rgb_img = np.array(pil_img)
    except Exception as e:
        return {"success": False, "error": f"Invalid image: {e}"}

    logger.info(f"Image '{filename}' – shape {rgb_img.shape}")

    # Resize large images
    h, w = rgb_img.shape[:2]
    if max(h, w) > MAX_DIM:
        scale = MAX_DIM / max(h, w)
        new_h, new_w = (int(h * scale) // 4) * 4, (int(w * scale) // 4) * 4
        rgb_img = cv2.resize(rgb_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
        logger.info(f"Resized from ({h},{w}) → ({new_h},{new_w})")

    # Inference
    try:
        prediction, height, width = _run_inference(rgb_img, model, device)
    except Exception as e:
        logger.error(traceback.format_exc())
        return {"success": False, "error": f"Inference failed: {e}"}

    img_size = (height, width)

    # Argmax segmentation
    rooms_pred = F.softmax(prediction[0, 21:21 + 12], 0).cpu().numpy()
    rooms_pred = np.argmax(rooms_pred, axis=0)

    icons_pred = F.softmax(prediction[0, 21 + 12:], 0).cpu().numpy()
    icons_pred = np.argmax(icons_pred, axis=0)

    # Polygon extraction (non-fatal fallback)
    pol_room_seg = pol_icon_seg = None
    try:
        heatmaps, rooms, icons = split_prediction(prediction, img_size, SPLIT)
        polygons, types, room_polygons, room_types = get_polygons(
            (heatmaps, rooms, icons), 0.2, [1, 2]
        )
        pol_room_seg, pol_icon_seg = polygons_to_image(
            polygons, types, room_polygons, room_types, height, width
        )
    except Exception as e:
        logger.warning(f"Polygon extraction skipped: {e}")

    # Statistics
    room_stats = _count_pixels(rooms_pred, ROOM_CLASSES)
    icon_stats = _count_pixels(icons_pred, ICON_CLASSES)

    room_summary = {
        k: v for k, v in room_stats.items()
        if k not in ("Background", "Outdoor", "Wall", "Undefined")
    }
    icon_summary = {k: v for k, v in icon_stats.items() if k != "No Icon"}

    # Visualizations
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

    if pol_room_seg is not None:
        result["visualizations"]["vectorizedRooms"] = _image_to_base64(
            _colorize_segmentation(pol_room_seg, ROOM_CLASSES, "rooms")
        )
        result["visualizations"]["vectorizedIcons"] = _image_to_base64(
            _colorize_segmentation(pol_icon_seg, ICON_CLASSES, "icons")
        )

    logger.info(
        f"Analysis complete – {len(room_summary)} room type(s), "
        f"{len(icon_summary)} icon type(s) detected."
    )
    return result


# ------------------------------------------------------------------
# RunPod handler
# ------------------------------------------------------------------
def handler(event):
    """RunPod serverless entry point."""
    input_data = event.get("input", {})

    image_b64 = input_data.get("image")
    filename = input_data.get("filename", "floorplan.png")

    if not image_b64:
        return {"success": False, "error": "Missing 'image' field (base64-encoded bytes)"}

    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception as e:
        return {"success": False, "error": f"Failed to decode base64 image: {e}"}

    return analyze(image_bytes, filename)


# ------------------------------------------------------------------
# Startup
# ------------------------------------------------------------------
logger.info("=" * 60)
logger.info("CubiCasa5k – RunPod Serverless Handler")
logger.info(f"Device: {'CUDA' if torch.cuda.is_available() else 'CPU'}")
logger.info(f"Weights: {os.environ.get('CUBICASA_WEIGHTS', '/app/model_best_val_loss_var.pkl')}")
logger.info("=" * 60)

runpod.serverless.start({"handler": handler})
