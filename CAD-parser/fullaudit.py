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
        
        # Flexible Keywords
        self.SITE_KWS = ['지적', 'SITE', '대지', 'LND', 'BOUNDARY']
        self.FOOTPRINT_KWS = ['HH', 'FOOTPRINT', '건축면적']
        # Expanded Floor detection (Catching '1', '2', '층', 'FLR', 'FLOOR')
        self.FLOOR_PATTERN = re.compile(r'([1-9]|B[1-9])(F|층|FLR|FLOOR|ND|ST|RD|TH)', re.IGNORECASE)

    def _get_area(self, e):
        try:
            if e.dxftype() in ['LWPOLYLINE', 'POLYLINE']:
                if hasattr(e, 'area'): return abs(e.area) / self.scale
                return abs(ezdxf.math.area([Vec2(v[:2]) for v in e.get_points()])) / self.scale
            return 0.0
        except: return 0.0

    def run_audit(self):
        geometry_data = []
        material_data = [] 
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
            
            # 2. Material Extraction
            if e.dxftype() in ['TEXT', 'MTEXT']:
                txt = e.plain_text()
                txt = re.sub(r'\\[A-Za-z][^;]*;', '', txt).strip()
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

        return {
            "site": site_area,
            "footprint": footprint_area,
            "total_floor_area": total_floor_area,
            "floors": floor_totals,
            "materials": material_data,
            "btl": (footprint_area / site_area * 100) if site_area > 0 else 0,
            "far": (total_floor_area / site_area * 100) if site_area > 0 else 0
        }

# Execution
auditor = FinalComplianceAuditor('files/50Py2F R.C House.dxf')
res = auditor.run_audit()

print(f"\nSite: {res['site']:.2f} m² | Footprint: {res['footprint']:.2f} m²")
print(f"Total Floor Area: {res['total_floor_area']:.2f} m²")
print(f"BTL: {res['btl']:.2f}% | FAR: {res['far']:.2f}%")
print("\nFloor Breakdown:")
for fl, ar in res['floors'].items():
    print(f"  {fl}: {ar:.2f} m²")