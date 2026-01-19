import ezdxf
import re
import pandas as pd
from ezdxf.math import Vec2

class HybridPermitAuditor:
    def __init__(self, file_path):
        try:
            self.doc = ezdxf.readfile(file_path)
            self.msp = self.doc.modelspace()
            
            # [Claude's Fix] Unit Validation
            self.units = self.doc.header.get('$INSUNITS', 4) # 4 = mm
            self.scale_factor = 1_000_000 if self.units in [0, 4] else 1.0
            
            # [Claude's Fix] Legal Layer Keywords
            self.SITE_LAYERS = ['지적선', 'SITE', '대지', '지적', 'LND']  # 지적선 = cadastral line (highest priority)
            self.BLDG_LAYERS = ['HH', 'A-WALL', '건축벽체', 'ARCH-WALL', 'FOOTPRINT', 'FORM']
            
        except Exception as e:
            raise RuntimeError(f"Failed to load DXF: {e}")

    def clean_text(self, text):
        # [Claude's Fix] Improved Regex for Korean characters and AutoCAD codes
        text = re.sub(r'\\[A-Za-z][^;]*;', '', text) 
        text = re.sub(r'\\P', ' ', text)
        return ' '.join(text.split()).strip()

    def get_area(self, entity):
        try:
            if entity.dxftype() in ['LWPOLYLINE', 'POLYLINE']:
                # We relax 'closed' for Site search but keep it for Building
                if hasattr(entity, 'area'):
                    return abs(entity.area) / self.scale_factor
                vertices = [Vec2(v[:2]) for v in entity.get_points()]
                return abs(ezdxf.math.area(vertices)) / self.scale_factor
            return 0.0
        except:
            return 0.0

    def audit(self):
        area_data = []
        materials = set()
        keywords = ["마감", "유리", "콘크리트", "THK", "단열재", "방수", "내화"]

        for entity in self.msp:
            # 1. Geometry Collection
            area = self.get_area(entity)
            if area > 0.1: # Ignore tiny noise
                area_data.append({'layer': entity.dxf.layer.upper(), 'area': area})
            
            # 2. Material Collection
            if entity.dxftype() in ['TEXT', 'MTEXT']:
                content = self.clean_text(entity.plain_text())
                if any(kw in content for kw in keywords):
                    materials.add(content)

        df = pd.DataFrame(area_data)

        # --- LOGIC REPAIR ---
        
        # 1. SITE AREA: First try layers, then fallback to the ABSOLUTE MAX area.
        site_df = df[df['layer'].isin(self.SITE_LAYERS)]
        if not site_df.empty:
            site_area = site_df['area'].max()
            site_method = "Layer Match"
        else:
            site_area = df['area'].max() # The Gemini Fallback
            site_method = "Largest Polyline Fallback"

        # 2. BUILDING AREA: Sum all polygons on building layers. 
        # If none found, look for the second largest distinct layer.
        bldg_df = df[df['layer'].isin(self.BLDG_LAYERS)]
        if not bldg_df.empty:
            building_area = bldg_df['area'].sum()
        else:
            # Fallback: Find the largest area that isn't the Site
            building_area = df[df['area'] < site_area]['area'].max()
            if pd.isna(building_area): building_area = 0

        return {
            "site": site_area,
            "building": building_area,
            "ratio": (building_area / site_area * 100) if site_area > 0 else 0,
            "materials": sorted(list(materials)),
            "site_method": site_method
        }

if __name__ == "__main__":
    import sys
    import json
    
    # Accept file path as command line argument
    file_path = sys.argv[1] if len(sys.argv) > 1 else 'files/50Py2F R.C House.dxf'
    
    auditor = HybridPermitAuditor(file_path)
    res = auditor.audit()
    
    # Output as JSON for parsing
    print(json.dumps({
        "site_area": res['site'],
        "building_area": res['building'],
        "bcr": res['ratio'],
        "materials": res['materials'],
        "site_method": res['site_method']
    }))