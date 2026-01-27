import ezdxf
import re
import pandas as pd
from ezdxf.math import Vec2

class FinalComplianceAuditor:
    def __init__(self, file_path):
        self.doc = ezdxf.readfile(file_path)
        self.msp = self.doc.modelspace()
        
        # Unit & Scaling
        self.units = self.doc.header.get('$INSUNITS', 4)
        self.scale = 1_000_000 if self.units in [0, 4] else 1.0
        
        # Unit scale for height (mm to m conversion)
        self.height_scale = 0.001 if self.units in [0, 4] else 1.0
        
        # Flexible Keywords
        self.SITE_KWS = ['지적', 'SITE', '대지', 'LND', 'BOUNDARY']
        self.FOOTPRINT_KWS = ['HH', 'FOOTPRINT', '건축면적']
        # Expanded Floor detection (Catching '1', '2', '층', 'FLR', 'FLOOR')
        self.FLOOR_PATTERN = self.FLOOR_PATTERN = re.compile(r'(B?\d+)(F|층|FLR|FLOOR|ND|ST|RD|TH)', re.IGNORECASE)
        
        # Elevation pattern to detect EL values (e.g., "EL+12500", "EL 12.5", "EL+12,500", "EL=12500")
        self.EL_PATTERN = re.compile(r'EL\s*[+=]?\s*([\d,]+(?:\.\d+)?)', re.IGNORECASE)

    def _get_area(self, e):
        try:
            if e.dxftype() in ['LWPOLYLINE', 'POLYLINE']:
                if hasattr(e, 'area'): return abs(e.area) / self.scale
                return abs(ezdxf.math.area([Vec2(v[:2]) for v in e.get_points()])) / self.scale
            return 0.0
        except: return 0.0
    
    def _extract_elevation(self, text):
        """Extract elevation value from text containing EL notation"""
        match = self.EL_PATTERN.search(text)
        if match:
            value_str = match.group(1).replace(',', '')  # Remove commas
            try:
                value = float(value_str)
                # If value > 100, assume it's in mm and convert to m
                if value > 100:
                    return value * 0.001
                return value
            except ValueError:
                return None
        return None

    def run_audit(self):
        geometry_data = []
        material_data = [] 
        elevation_values = []  # Store all found EL values
        mat_kws = ["마감", "유리", "콘크리트", "THK", "단열재", "방수"]

        for e in self.msp:
            # 1. Geometry Extraction
            area = self._get_area(e)
            if area > 0.05:
                # We calculate a simple center point for spatial context instead of bounding_box
                try:
                    if e.dxftype() == 'LWPOLYLINE':
                        verts = e.get_points()
                        center_x = sum(v[0] for v in verts) / len(verts)
                        center_y = sum(v[1] for v in verts) / len(verts)
                        pos = (center_x, center_y)
                    else:
                        pos = (0, 0)
                except:
                    pos = (0, 0)

                geometry_data.append({
                    'layer': e.dxf.layer.upper(), 
                    'area': area,
                    'pos': pos # Fixed the AttributeError here
                })
            
            # 2. Material & Elevation Extraction from TEXT entities
            if e.dxftype() in ['TEXT', 'MTEXT']:
                txt = e.plain_text()
                txt = re.sub(r'\\[A-Za-z][^;]*;', '', txt).strip()
                
                # Check for material keywords
                if any(k in txt for k in mat_kws):
                    # Get insertion point safely
                    try:
                        ins_pos = e.dxf.insert
                    except:
                        ins_pos = (0,0)
                        
                    material_data.append({
                        'text': txt,
                        'layer': e.dxf.layer.upper(),
                        'pos': ins_pos
                    })
                
                # Check for elevation values (EL notation)
                el_value = self._extract_elevation(txt)
                if el_value is not None:
                    elevation_values.append(el_value)

        df = pd.DataFrame(geometry_data)
        if df.empty:
            return {"error": "No geometry found"}

        # --- LOGIC: SITE & FOOTPRINT ---
        site_mask = df['layer'].apply(lambda x: any(k in x for k in self.SITE_KWS))
        site_area = df[site_mask]['area'].max() if any(site_mask) else df['area'].max()

        footprint_mask = df['layer'].apply(lambda x: any(k in x for k in self.FOOTPRINT_KWS))
        footprint_area = df[footprint_mask]['area'].sum() if any(footprint_mask) else 0

        # --- LOGIC: FLOOR DETECTION ---
        floor_totals = {}
        for layer in df['layer'].unique():
            # 1. Match standard tags like 2F, 2층, etc.
            match = self.FLOOR_PATTERN.search(layer)
            
            # CRITICAL FIX: Only treat numeric layers as floors if they are NOT 1-8 colors
            is_color_layer = layer in [str(i) for i in range(1, 9)]
            
            if match and not is_color_layer:
                floor_tag = f"{match.group(1)}F"
                floor_totals[floor_tag] = floor_totals.get(floor_tag, 0) + df[df['layer'] == layer]['area'].sum()
            
            # 2. Check specific architectural area layers
            elif layer in ['2D', '면적', 'AREA']:
                # Logic: If it's a 2F house, 2D layer is likely the 2nd floor
                tag = "2F" if "2" in layer else "1F"
                floor_totals[tag] = floor_totals.get(tag, 0) + df[df['layer'] == layer]['area'].sum()
                
            # 3. Use HH for the Primary Footprint (1F)
            elif "HH" in layer:
                floor_totals["1F"] = floor_totals.get("1F", 0) + df[df['layer'] == layer]['area'].sum()
        # Final floor area calculation
        total_floor_area = sum(floor_totals.values())
        
        # If we found 0 floors (common in messy files), fallback to footprint
        if total_floor_area == 0:
            total_floor_area = footprint_area
            
        # --- LOGIC: BUILDING HEIGHT ---
        # Calculate building height from max EL value (highest point)
        building_height = None
        if elevation_values:
            # The building height is typically the maximum elevation found
            # Filter out ground level (EL around 0) if there are higher values
            max_elevation = max(elevation_values)
            min_elevation = min(elevation_values)
            
            # If we have multiple elevations, the height is max - min (or just max if min is near 0)
            if min_elevation < 1:  # Ground level is near 0
                building_height = max_elevation
            else:
                building_height = max_elevation - min_elevation if max_elevation > min_elevation else max_elevation

        return {
            "site": site_area,
            "footprint": footprint_area,
            "total_floor_area": total_floor_area,
            "floors": floor_totals,
            "materials": material_data,
            "btl": (footprint_area / site_area * 100) if site_area > 0 else 0,
            "far": (total_floor_area / site_area * 100) if site_area > 0 else 0,
            "building_height": building_height,
            "elevation_values": elevation_values  # Include all found values for reference
        }

if __name__ == "__main__":
    import sys
    import json
    
    # Accept file path as command line argument
    file_path = sys.argv[1] if len(sys.argv) > 1 else 'files/50Py2F R.C House.dxf'
    
    auditor = FinalComplianceAuditor(file_path)
    res = auditor.run_audit()
    
    # Output as JSON for parsing
    print(json.dumps({
        "site_area": res['site'],
        "footprint_area": res['footprint'],
        "total_floor_area": res['total_floor_area'],
        "floors": res['floors'],
        "btl": res['btl'],
        "far": res['far'],
        "materials_count": len(res['materials']),
        "building_height": res.get('building_height'),
        "elevation_values": res.get('elevation_values', [])
    }))