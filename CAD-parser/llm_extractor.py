"""
DXF Data Extractor - Manual vs LLM Comparison Tool
===================================================
This tool allows comparing between manual DXF parsing and LLM-based extraction.
Uses Gemini API (2.5 Flash) with multi-modal input (DXF image + text content).

Usage:
    python llm_extractor.py <dxf_file> --mode [manual|llm|both]
    
Examples:
    python llm_extractor.py files/house_3.dxf --mode manual
    python llm_extractor.py files/house_3.dxf --mode llm --api-key YOUR_API_KEY
    python llm_extractor.py files/house_3.dxf --mode both
"""

import os
import sys
import json
import argparse
import tempfile
import base64
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Dict, Any, Tuple

# ============================================================================
# CONFIGURATION - Set your Gemini API key here or use environment variable
# ============================================================================

# Gemini API Configuration
# Get your API key from: https://aistudio.google.com/app/apikey
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")  # Use API key from environment variable only
GEMINI_MODEL = "gemini-2.5-flash"  # Using Gemini 2.5 Flash for best performance

# ============================================================================
# DXF Processing Libraries
# ============================================================================
try:
    import ezdxf
    from ezdxf.addons.drawing import RenderContext, Frontend
    from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
    import matplotlib.pyplot as plt
    from ezdxf.math import Vec2
except ImportError:
    print("ERROR: Required libraries not installed.")
    print("Run: pip install ezdxf matplotlib")
    sys.exit(1)

# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class ExtractionResult:
    """Result from DXF data extraction"""
    site_area: float = 0.0
    building_area: float = 0.0
    footprint_area: float = 0.0
    total_floor_area: float = 0.0
    num_floors: int = 0
    bcr: float = 0.0  # Building Coverage Ratio (%)
    far: float = 0.0  # Floor Area Ratio (%)
    building_height: float = 0.0  # Building height in meters (from EL values)
    layers: list = None
    materials: list = None
    raw_response: str = ""
    method: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "site_area_m2": self.site_area,
            "building_area_m2": self.building_area,
            "footprint_area_m2": self.footprint_area,
            "total_floor_area_m2": self.total_floor_area,
            "num_floors": self.num_floors,
            "bcr_percent": self.bcr,
            "far_percent": self.far,
            "building_height_m": self.building_height,
            "layers": self.layers or [],
            "materials": self.materials or [],
            "method": self.method
        }

# ============================================================================
# MANUAL DXF PARSER (Existing Logic)
# ============================================================================

class ManualDXFParser:
    """Manual DXF parsing using ezdxf - based on existing fullaudit.py logic"""
    
    # Keywords for detecting different area types
    SITE_KEYWORDS = ['지적', 'SITE', '대지', 'LND', 'BOUNDARY', 'ETC']
    FOOTPRINT_KEYWORDS = ['HH', 'FOOTPRINT', '건축면적', 'BUILDING']
    FLOOR_PATTERN = None  # Will be compiled in __init__
    
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.doc = ezdxf.readfile(file_path)
        self.msp = self.doc.modelspace()
        
        # Unit scaling
        self.units = self.doc.header.get('$INSUNITS', 4)
        # mm² to m² conversion factor
        self.scale = 1_000_000 if self.units in [0, 4] else 1.0
        
        # Compile floor pattern
        import re
        self.FLOOR_PATTERN = re.compile(r'(B?\d+)(F|층|FLR|FLOOR|ND|ST|RD|TH)', re.IGNORECASE)
    
    def _get_area(self, entity) -> float:
        """Calculate area of a DXF entity in m²"""
        try:
            if entity.dxftype() in ['LWPOLYLINE', 'POLYLINE']:
                if hasattr(entity, 'area'):
                    return abs(entity.area) / self.scale
                vertices = [Vec2(v[:2]) for v in entity.get_points()]
                if len(vertices) >= 3:
                    return abs(ezdxf.math.area(vertices)) / self.scale
            return 0.0
        except Exception:
            return 0.0
    
    def extract(self) -> ExtractionResult:
        """Extract data from DXF file using manual parsing"""
        import re
        
        geometry_data = []
        material_data = []
        layers = set()
        
        mat_keywords = ["마감", "유리", "콘크리트", "THK", "단열재", "방수", "석재", "타일"]
        
        for entity in self.msp:
            # Collect layers
            layers.add(entity.dxf.layer)
            
            # Extract geometry
            area = self._get_area(entity)
            if area > 0.05:  # Filter very small areas
                geometry_data.append({
                    'layer': entity.dxf.layer.upper(),
                    'area': area
                })
            
            # Extract materials from text
            if entity.dxftype() in ['TEXT', 'MTEXT']:
                try:
                    txt = entity.plain_text()
                    txt = re.sub(r'\\[A-Za-z][^;]*;', '', txt).strip()
                    if any(k in txt for k in mat_keywords):
                        material_data.append(txt)
                except Exception:
                    pass
        
        if not geometry_data:
            return ExtractionResult(method="manual", layers=list(layers))
        
        # Build DataFrame for analysis
        import pandas as pd
        df = pd.DataFrame(geometry_data)
        
        # Detect site area
        site_mask = df['layer'].apply(lambda x: any(k in x for k in self.SITE_KEYWORDS))
        site_area = df[site_mask]['area'].max() if any(site_mask) else df['area'].max()
        
        # Detect footprint/building area
        footprint_mask = df['layer'].apply(lambda x: any(k in x for k in self.FOOTPRINT_KEYWORDS))
        footprint_area = df[footprint_mask]['area'].sum() if any(footprint_mask) else 0
        
        # Detect floor areas
        floor_totals = {}
        for layer in df['layer'].unique():
            # Skip color layers (1-8)
            if layer in [str(i) for i in range(1, 9)]:
                continue
                
            match = self.FLOOR_PATTERN.search(layer)
            if match:
                floor_tag = f"{match.group(1)}F"
                floor_totals[floor_tag] = floor_totals.get(floor_tag, 0) + df[df['layer'] == layer]['area'].sum()
            elif "HH" in layer:
                floor_totals["1F"] = floor_totals.get("1F", 0) + df[df['layer'] == layer]['area'].sum()
        
        total_floor_area = sum(floor_totals.values()) if floor_totals else footprint_area
        num_floors = len(floor_totals) if floor_totals else (1 if footprint_area > 0 else 0)
        
        # Calculate ratios
        bcr = (footprint_area / site_area * 100) if site_area > 0 else 0
        far = (total_floor_area / site_area * 100) if site_area > 0 else 0
        
        return ExtractionResult(
            site_area=site_area,
            building_area=footprint_area,
            footprint_area=footprint_area,
            total_floor_area=total_floor_area,
            num_floors=num_floors,
            bcr=bcr,
            far=far,
            layers=list(layers),
            materials=list(set(material_data)),
            method="manual"
        )

# ============================================================================
# DXF TO IMAGE CONVERTER
# ============================================================================

def dxf_to_image(dxf_path: str, output_path: str = None, dpi: int = 150) -> str:
    """
    Convert DXF file to PNG image for LLM vision input.
    
    Args:
        dxf_path: Path to DXF file
        output_path: Output image path (auto-generated if None)
        dpi: Image resolution
        
    Returns:
        Path to the generated image
    """
    if output_path is None:
        output_path = tempfile.mktemp(suffix='.png')
    
    try:
        doc = ezdxf.readfile(dxf_path)
        msp = doc.modelspace()
        
        # Create figure
        fig = plt.figure(figsize=(16, 12), dpi=dpi)
        ax = fig.add_axes([0, 0, 1, 1])
        
        # Render DXF
        ctx = RenderContext(doc)
        out = MatplotlibBackend(ax)
        Frontend(ctx, out).draw_layout(msp, finalize=True)
        
        # Save
        fig.savefig(output_path, dpi=dpi, bbox_inches='tight', 
                    facecolor='white', edgecolor='none')
        plt.close(fig)
        
        return output_path
        
    except Exception as e:
        print(f"Warning: Could not render DXF to image: {e}")
        # Create a placeholder image
        fig, ax = plt.subplots(figsize=(8, 6))
        ax.text(0.5, 0.5, f"DXF Rendering Failed\n{Path(dxf_path).name}", 
                ha='center', va='center', fontsize=12)
        ax.axis('off')
        fig.savefig(output_path, dpi=dpi)
        plt.close(fig)
        return output_path

def image_to_base64(image_path: str) -> str:
    """Convert image file to base64 string"""
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')

def extract_elevation_data(dxf_path: str) -> Dict[str, Any]:
    """
    Extract elevation/height data from DXF file by analyzing text entities.
    
    Looks for patterns like:
    - EL+12500, EL +12500, EL=12500
    - GL+2000, GL +2000
    - +12.5m, +12500mm
    - Level 1 +0.000, Level 2 +3.200
    - 1F, 2F, B1F floor indicators
    - 층고 (floor height), 높이 (height) annotations
    
    Returns:
        Dictionary with elevation data including max_height_m, floor_heights, etc.
    """
    import re
    
    try:
        doc = ezdxf.readfile(dxf_path)
        msp = doc.modelspace()
        
        elevation_values = []  # Store (value_in_mm, source_text)
        floor_levels = {}  # floor_name -> elevation_mm
        height_annotations = []  # Direct height annotations
        
        # Patterns to match elevation values
        patterns = [
            # EL+12500, EL +12500, EL=12500, E.L.+12500
            (r'E\.?L\.?\s*[+=]?\s*([+-]?\d+(?:\.\d+)?)', 'EL'),
            # GL+2000, GL +2000
            (r'GL\s*[+=]?\s*([+-]?\d+(?:\.\d+)?)', 'GL'),
            # Level 1 +3.200, Level 2 +6.400
            (r'Level\s*(\d+)\s*[+=]?\s*([+-]?\d+(?:\.\d+)?)', 'LEVEL'),
            # +12500, +12.5 (standalone elevation markers)
            (r'^\s*([+-]\d+(?:\.\d+)?)\s*$', 'STANDALONE'),
            # 1FL +3200, 2F +6400, B1F -3000
            (r'(B?\d+)\s*F(?:L|층)?\s*[+=]?\s*([+-]?\d+(?:\.\d+)?)', 'FLOOR'),
            # Height annotations in Korean: 층고 3000, 높이 9000
            (r'(?:층고|높이|H|height)\s*[=:]?\s*(\d+(?:\.\d+)?)', 'HEIGHT'),
            # Roof level, TOP level
            (r'(?:ROOF|TOP|지붕|옥상)\s*[+=]?\s*([+-]?\d+(?:\.\d+)?)', 'ROOF'),
        ]
        
        for entity in msp:
            if entity.dxftype() in ['TEXT', 'MTEXT']:
                try:
                    txt = entity.plain_text().strip()
                    if not txt:
                        continue
                    
                    # Try each pattern
                    for pattern, ptype in patterns:
                        matches = re.finditer(pattern, txt, re.IGNORECASE)
                        for match in matches:
                            if ptype == 'LEVEL':
                                level_num = match.group(1)
                                value = float(match.group(2))
                                floor_levels[f"Level {level_num}"] = value
                                elevation_values.append((value, txt))
                            elif ptype == 'FLOOR':
                                floor_name = match.group(1) + 'F'
                                value = float(match.group(2))
                                floor_levels[floor_name] = value
                                elevation_values.append((value, txt))
                            elif ptype == 'HEIGHT':
                                value = float(match.group(1))
                                height_annotations.append((value, txt))
                            elif ptype in ['EL', 'GL', 'STANDALONE', 'ROOF']:
                                value = float(match.group(1))
                                elevation_values.append((value, txt))
                                if ptype == 'ROOF':
                                    floor_levels['ROOF'] = value
                                    
                except Exception:
                    pass
        
        # Process the collected data
        result = {
            'elevation_values': [],
            'floor_levels': floor_levels,
            'height_annotations': height_annotations,
            'max_elevation_raw': None,
            'min_elevation_raw': None,
            'building_height_m': None,
            'num_floors_detected': 0,
        }
        
        if elevation_values:
            # Get unique values sorted
            unique_elevations = sorted(set(v[0] for v in elevation_values))
            result['elevation_values'] = unique_elevations
            result['max_elevation_raw'] = max(unique_elevations)
            result['min_elevation_raw'] = min(unique_elevations)
            
            # Calculate building height
            # If max value > 100, assume mm, otherwise assume meters
            max_val = result['max_elevation_raw']
            min_val = result['min_elevation_raw']
            
            # Height is difference between max and min (or max if min is 0/ground level)
            if min_val < 0:
                # Has basement, height from min to max
                height_raw = max_val - min_val
            else:
                # No basement or min is ground level
                height_raw = max_val
            
            # Convert to meters if needed
            if abs(height_raw) > 100:
                result['building_height_m'] = height_raw / 1000.0
            else:
                result['building_height_m'] = height_raw
        
        # Count floors from floor_levels
        if floor_levels:
            result['num_floors_detected'] = len(floor_levels)
        
        # If we have height annotations but no elevation values, use those
        if not result['building_height_m'] and height_annotations:
            max_height = max(h[0] for h in height_annotations)
            if max_height > 100:
                result['building_height_m'] = max_height / 1000.0
            else:
                result['building_height_m'] = max_height
        
        return result
        
    except Exception as e:
        return {
            'error': str(e),
            'building_height_m': None,
            'num_floors_detected': 0,
        }


def extract_dxf_text_content(dxf_path: str, max_lines: int = 500) -> str:
    """
    Extract text representation of DXF content for LLM context.
    
    Returns:
        String containing DXF structure and key data
    """
    try:
        doc = ezdxf.readfile(dxf_path)
        msp = doc.modelspace()
        
        lines = []
        lines.append(f"=== DXF FILE ANALYSIS: {Path(dxf_path).name} ===")
        lines.append(f"Units: {doc.header.get('$INSUNITS', 'Unknown')}")
        lines.append("")
        
        # Extract elevation data first
        elevation_data = extract_elevation_data(dxf_path)
        lines.append("=== ELEVATION/HEIGHT DATA ===")
        if elevation_data.get('building_height_m'):
            lines.append(f"Calculated Building Height: {elevation_data['building_height_m']:.2f} m")
        if elevation_data.get('floor_levels'):
            lines.append(f"Floor Levels Found: {elevation_data['floor_levels']}")
        if elevation_data.get('elevation_values'):
            lines.append(f"Elevation Values (raw): {elevation_data['elevation_values'][:10]}")
        if elevation_data.get('height_annotations'):
            lines.append(f"Height Annotations: {elevation_data['height_annotations'][:5]}")
        if elevation_data.get('max_elevation_raw'):
            lines.append(f"Max Elevation (raw): {elevation_data['max_elevation_raw']}")
            lines.append(f"Min Elevation (raw): {elevation_data['min_elevation_raw']}")
        lines.append("")
        
        # Collect layers and their entity counts
        layer_info = {}
        for entity in msp:
            layer = entity.dxf.layer
            etype = entity.dxftype()
            if layer not in layer_info:
                layer_info[layer] = {'types': {}, 'areas': []}
            layer_info[layer]['types'][etype] = layer_info[layer]['types'].get(etype, 0) + 1
            
            # Calculate area for polylines
            if etype in ['LWPOLYLINE', 'POLYLINE']:
                try:
                    vertices = [Vec2(v[:2]) for v in entity.get_points()]
                    if len(vertices) >= 3:
                        area = abs(ezdxf.math.area(vertices))
                        if area > 100:  # Filter tiny areas
                            layer_info[layer]['areas'].append(area)
                except:
                    pass
        
        lines.append("=== LAYERS AND GEOMETRY ===")
        for layer, info in sorted(layer_info.items()):
            lines.append(f"\nLayer: {layer}")
            lines.append(f"  Entities: {info['types']}")
            if info['areas']:
                lines.append(f"  Areas (raw units): {sorted(info['areas'], reverse=True)[:5]}")
        
        # Extract text entities
        lines.append("\n=== TEXT CONTENT ===")
        text_count = 0
        for entity in msp:
            if entity.dxftype() in ['TEXT', 'MTEXT'] and text_count < 50:
                try:
                    txt = entity.plain_text()
                    if txt.strip():
                        lines.append(f"  [{entity.dxf.layer}] {txt[:100]}")
                        text_count += 1
                except:
                    pass
        
        return "\n".join(lines[:max_lines])
        
    except Exception as e:
        return f"Error reading DXF: {e}"

# ============================================================================
# LLM EXTRACTOR (Gemini API)
# ============================================================================

class LLMExtractor:
    """Extract data from DXF using Gemini API with multi-modal input"""
    
    EXTRACTION_PROMPT = """You are an expert architectural CAD analyst. Analyze this DXF file and its rendered image.

I need you to extract the following information from this architectural drawing:

1. **Site Area (대지면적)**: The total land/plot area, usually the largest boundary
2. **Building Footprint Area (건축면적)**: The ground floor building coverage area
3. **Total Floor Area (연면적)**: Sum of all floor areas
4. **Number of Floors (층수)**: How many floors/stories the building has
5. **Building Coverage Ratio (건폐율, BCR)**: (Building Footprint / Site Area) × 100%
6. **Floor Area Ratio (용적률, FAR)**: (Total Floor Area / Site Area) × 100%
7. **Building Height (건물높이)**: The total building height in meters.

**How to find Building Height:**
Look for these patterns in the text entities:
- EL values: "EL+12500", "EL +12500", "EL=12500", "E.L.+8500"
- GL values: "GL+2000", "GL +2000" (ground level references)
- Level markers: "Level 1 +0.000", "Level 2 +3.200", "Level 5 +9.900"
- Floor markers: "1F +0", "2F +3200", "RF +9000", "ROOF +12000"
- Height annotations: "층고 3000", "높이 9000", "H=3000"
- The pre-calculated elevation data in the DXF content section shows extracted values

**Unit conversion for heights:**
- Values > 100 are typically in millimeters (mm) → divide by 1000 for meters
- Values < 100 are typically in meters
- Building height = max_elevation - min_elevation (or just max if ground is 0)

**DXF Text Content:**
```
{dxf_content}
```

**Instructions:**
- Look at both the image visualization and the DXF text data
- Areas might be in mm² (millimeters squared) - convert to m² by dividing by 1,000,000
- Look for layers named like: SITE, 대지, HH, FOOTPRINT, 1F, 2F, etc.
- The largest polygon is often the site boundary
- HH or FOOTPRINT layers typically contain building footprint
- For building height, USE THE PRE-CALCULATED VALUE from "ELEVATION/HEIGHT DATA" section if available
- If no elevation data found, estimate from number of floors (typical floor height: 2.8-3.2m)

**IMPORTANT:** Return your answer ONLY as valid JSON in this exact format:
```json
{{
  "site_area_m2": <number>,
  "building_area_m2": <number>,
  "footprint_area_m2": <number>,
  "total_floor_area_m2": <number>,
  "num_floors": <integer>,
  "bcr_percent": <number>,
  "far_percent": <number>,
  "building_height_m": <number or null if not found>,
  "detected_layers": ["layer1", "layer2"],
  "confidence": "high/medium/low",
  "notes": "any relevant observations including EL values found"
}}
```
"""

    def __init__(self, api_key: str = None):
        self.api_key = api_key or GEMINI_API_KEY
        
        if not self.api_key:
            raise ValueError(
                "Gemini API key not configured!\n"
                "Options:\n"
                "1. Set GEMINI_API_KEY environment variable\n"
                "2. Pass --api-key YOUR_KEY as argument\n"
                "3. Edit GEMINI_API_KEY in this file\n\n"
                "Get your API key from: https://aistudio.google.com/app/apikey"
            )
    
    def extract(self, dxf_path: str) -> ExtractionResult:
        """Extract data from DXF using LLM"""
        
        # Generate image from DXF
        print("  Converting DXF to image...")
        image_path = dxf_to_image(dxf_path)
        
        # Extract text content from DXF (includes elevation data)
        print("  Extracting DXF text content...")
        dxf_content = extract_dxf_text_content(dxf_path)
        
        # Also get elevation data directly for fallback
        print("  Extracting elevation data...")
        elevation_data = extract_elevation_data(dxf_path)
        
        # Prepare prompt
        prompt = self.EXTRACTION_PROMPT.format(dxf_content=dxf_content)
        
        # Call Gemini API
        response = self._call_gemini(prompt, image_path)
        
        # Parse response
        result = self._parse_response(response, elevation_data)
        
        # Cleanup temp image
        try:
            os.unlink(image_path)
        except:
            pass
        
        return result
    
    def _call_gemini(self, prompt: str, image_path: str) -> str:
        """Call Gemini API with image and text"""
        try:
            import google.generativeai as genai
        except ImportError:
            print("ERROR: google-generativeai not installed.")
            print("Run: pip install google-generativeai")
            sys.exit(1)
        
        print(f"  Calling Gemini API ({GEMINI_MODEL})...")
        
        genai.configure(api_key=self.api_key)
        model = genai.GenerativeModel(GEMINI_MODEL)
        
        # Load image
        import PIL.Image
        image = PIL.Image.open(image_path)
        
        # Generate response
        response = model.generate_content([prompt, image])
        
        return response.text
    
    def _parse_response(self, response: str, elevation_data: Dict[str, Any] = None) -> ExtractionResult:
        """Parse LLM response JSON with fallback to extracted elevation data"""
        import re
        
        # Extract JSON from response
        json_match = re.search(r'```json\s*(.*?)\s*```', response, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Try to find raw JSON
            json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
            json_str = json_match.group(0) if json_match else "{}"
        
        try:
            data = json.loads(json_str)
        except json.JSONDecodeError:
            print(f"Warning: Could not parse LLM response as JSON")
            data = {}
        
        # Get building height from LLM response
        building_height = data.get('building_height_m')
        num_floors = data.get('num_floors', 0)
        
        # Fallback 1: Use pre-extracted elevation data if LLM returned null
        if (building_height is None or building_height == 0) and elevation_data:
            if elevation_data.get('building_height_m'):
                building_height = elevation_data['building_height_m']
                print(f"  Using pre-extracted building height: {building_height:.2f} m")
            # Also update num_floors if we found floor levels
            if num_floors == 0 and elevation_data.get('num_floors_detected', 0) > 0:
                num_floors = elevation_data['num_floors_detected']
        
        # Fallback 2: Validate building height against number of floors
        # Typical floor height is 2.8-3.2m, so minimum should be ~2.5m per floor
        if building_height and num_floors > 0:
            min_expected_height = num_floors * 2.5
            if building_height < min_expected_height:
                # Height seems too low for the number of floors, likely incomplete elevation data
                estimated_height = num_floors * 3.0  # Assume 3m per floor
                print(f"  Building height {building_height:.2f}m seems too low for {num_floors} floors.")
                print(f"  Adjusting to estimated height: {estimated_height:.2f} m ({num_floors} floors × 3.0m)")
                building_height = estimated_height
        
        # Fallback 3: Estimate from number of floors if still no height (typical floor height: 3.0m)
        if (building_height is None or building_height == 0) and num_floors > 0:
            building_height = num_floors * 3.0  # Assume 3m per floor
            print(f"  Estimated building height from floors: {building_height:.2f} m ({num_floors} floors × 3.0m)")
        
        return ExtractionResult(
            site_area=data.get('site_area_m2', 0),
            building_area=data.get('building_area_m2', 0),
            footprint_area=data.get('footprint_area_m2', 0),
            total_floor_area=data.get('total_floor_area_m2', 0),
            num_floors=num_floors,
            bcr=data.get('bcr_percent', 0),
            far=data.get('far_percent', 0),
            building_height=building_height or 0,
            layers=data.get('detected_layers', []),
            raw_response=response,
            method="llm"
        )

# ============================================================================
# COMPARISON OUTPUT
# ============================================================================

def print_comparison(manual: ExtractionResult, llm: ExtractionResult):
    """Print side-by-side comparison of manual vs LLM extraction"""
    
    print("\n" + "="*70)
    print("EXTRACTION COMPARISON: MANUAL vs LLM")
    print("="*70)
    
    headers = ["Metric", "Manual", "LLM", "Difference"]
    rows = [
        ("Site Area (m²)", f"{manual.site_area:.2f}", f"{llm.site_area:.2f}", 
         f"{abs(manual.site_area - llm.site_area):.2f}"),
        ("Building Area (m²)", f"{manual.building_area:.2f}", f"{llm.building_area:.2f}",
         f"{abs(manual.building_area - llm.building_area):.2f}"),
        ("Total Floor Area (m²)", f"{manual.total_floor_area:.2f}", f"{llm.total_floor_area:.2f}",
         f"{abs(manual.total_floor_area - llm.total_floor_area):.2f}"),
        ("Number of Floors", str(manual.num_floors), str(llm.num_floors),
         str(abs(manual.num_floors - llm.num_floors))),
        ("Building Height (m)", f"{manual.building_height:.2f}", f"{llm.building_height:.2f}",
         f"{abs(manual.building_height - llm.building_height):.2f}"),
        ("BCR (%)", f"{manual.bcr:.2f}", f"{llm.bcr:.2f}",
         f"{abs(manual.bcr - llm.bcr):.2f}"),
        ("FAR (%)", f"{manual.far:.2f}", f"{llm.far:.2f}",
         f"{abs(manual.far - llm.far):.2f}"),
    ]
    
    # Print table
    col_widths = [25, 15, 15, 12]
    header_line = " | ".join(h.ljust(w) for h, w in zip(headers, col_widths))
    print(header_line)
    print("-" * len(header_line))
    
    for row in rows:
        print(" | ".join(str(v).ljust(w) for v, w in zip(row, col_widths)))
    
    print("="*70)
    
    # Print layers comparison (handle None)
    print("\nDetected Layers:")
    manual_layers = manual.layers or []
    llm_layers = llm.layers or []
    print(f"  Manual: {manual_layers[:10]}{'...' if len(manual_layers) > 10 else ''}")
    print(f"  LLM:    {llm_layers[:10]}{'...' if len(llm_layers) > 10 else ''}")

def print_single_result(result: ExtractionResult, title: str):
    """Print single extraction result"""
    
    def fmt(val, suffix=""):
        """Format value handling None"""
        if val is None:
            return "N/A"
        return f"{val:.2f}{suffix}"
    
    print("\n" + "="*50)
    print(f"{title}")
    print("="*50)
    print(f"Site Area:        {fmt(result.site_area, ' m²')}")
    print(f"Building Area:    {fmt(result.building_area, ' m²')}")
    print(f"Footprint Area:   {fmt(result.footprint_area, ' m²')}")
    print(f"Total Floor Area: {fmt(result.total_floor_area, ' m²')}")
    print(f"Number of Floors: {result.num_floors if result.num_floors else 'N/A'}")
    print(f"Building Height:  {fmt(result.building_height, ' m')}")
    print(f"BCR:              {fmt(result.bcr, '%')}")
    print(f"FAR:              {fmt(result.far, '%')}")
    print(f"Layers Found:     {len(result.layers) if result.layers else 0}")
    if result.materials:
        print(f"Materials Found:  {len(result.materials)}")
    print("="*50)

# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="DXF Data Extractor - Compare manual parsing vs LLM extraction",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python llm_extractor.py files/house_3.dxf --mode manual
  python llm_extractor.py files/house_3.dxf --mode llm --api-key YOUR_GEMINI_API_KEY
  python llm_extractor.py files/house_3.dxf --mode both
  
Environment Variables:
  GEMINI_API_KEY    - Your Gemini API key (required for LLM mode)
  
Get your API key from: https://aistudio.google.com/app/apikey
        """
    )
    
    parser.add_argument("dxf_file", help="Path to DXF file")
    parser.add_argument("--mode", choices=["manual", "llm", "both"], default="both",
                       help="Extraction mode (default: both)")
    parser.add_argument("--api-key", help="Gemini API key (or set GEMINI_API_KEY env var)")
    parser.add_argument("--output", "-o", help="Output JSON file path")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show verbose output")
    
    args = parser.parse_args()
    
    # Validate file
    if not os.path.exists(args.dxf_file):
        print(f"ERROR: File not found: {args.dxf_file}")
        sys.exit(1)
    
    if not args.dxf_file.lower().endswith('.dxf'):
        print("ERROR: File must be a .dxf file")
        sys.exit(1)
    
    print(f"\n{'='*50}")
    print(f"DXF Data Extractor")
    print(f"{'='*50}")
    print(f"File: {args.dxf_file}")
    print(f"Mode: {args.mode}")
    if args.mode in ['llm', 'both']:
        print(f"LLM:  Gemini ({GEMINI_MODEL})")
    
    results = {}
    
    # Manual extraction
    if args.mode in ["manual", "both"]:
        print("\n[1/2] Running MANUAL extraction..." if args.mode == "both" else "\nRunning MANUAL extraction...")
        try:
            manual_parser = ManualDXFParser(args.dxf_file)
            manual_result = manual_parser.extract()
            results["manual"] = manual_result
            
            if args.mode == "manual":
                print_single_result(manual_result, "MANUAL EXTRACTION RESULTS")
        except Exception as e:
            print(f"ERROR in manual extraction: {e}")
            results["manual"] = ExtractionResult(method="manual", raw_response=str(e))
    
    # LLM extraction
    if args.mode in ["llm", "both"]:
        print("\n[2/2] Running LLM extraction..." if args.mode == "both" else "\nRunning LLM extraction...")
        try:
            api_key = args.api_key or GEMINI_API_KEY
            llm_extractor = LLMExtractor(api_key=api_key)
            llm_result = llm_extractor.extract(args.dxf_file)
            results["llm"] = llm_result
            
            if args.mode == "llm":
                print_single_result(llm_result, "LLM EXTRACTION RESULTS")
                if llm_result.raw_response:
                    print("\nRaw LLM Response:")
                    print("-"*40)
                    print(llm_result.raw_response[:1000])
                    if len(llm_result.raw_response) > 1000:
                        print("... (truncated)")
        except Exception as e:
            print(f"ERROR in LLM extraction: {e}")
            import traceback
            traceback.print_exc()
            results["llm"] = ExtractionResult(method="llm", raw_response=str(e))
    
    # Comparison output
    if args.mode == "both" and "manual" in results and "llm" in results:
        print_comparison(results["manual"], results["llm"])
    
    # Save JSON output
    if args.output:
        output_data = {k: v.to_dict() for k, v in results.items()}
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        print(f"\nResults saved to: {args.output}")
    
    return results

if __name__ == "__main__":
    main()
