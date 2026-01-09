import ezdxf
import re
import pandas as pd
import os
from ezdxf.math import Vec2

class CivilComplianceAuditor:
    def __init__(self, file_path):
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"DXF file not found: {file_path}")
            
        try:
            self.doc = ezdxf.readfile(file_path)
            self.msp = self.doc.modelspace()
            
            # 1. Unit Validation (KCS Standard)
            # 4 = Millimeters, 6 = Meters. Default to 4 for Korean drawings.
            self.units = self.doc.header.get('$INSUNITS', 4)
            if self.units == 6:
                self.scale_factor = 1.0  # Already in meters
                print("✓ Units detected: Meters")
            else:
                self.scale_factor = 1_000_000 # mm2 -> m2
                print(f"✓ Units detected: Millimeters (Scale: {self.scale_factor})")
            
            # 2. Keyword Lists (Substring matching handles '지적선', '대지경계선', etc.)
            self.SITE_KEYWORDS = ['SITE', '대지', '지적', 'LND', 'BOUNDARY']
            self.BLDG_KEYWORDS = ['HH', 'WALL', '벽체', 'FOOTPRINT', 'FORM', '건축']
            
        except Exception as e:
            raise RuntimeError(f"Failed to load DXF: {e}")

    def _clean_mtext(self, text):
        """Removes AutoCAD formatting codes and normalizes Korean text."""
        # Remove codes like \A1; \P \C1; \H0.5x;
        text = re.sub(r'\\[A-Za-z][^;]*;', '', text) 
        text = re.sub(r'\\P', ' ', text)
        text = re.sub(r'[{}]', '', text)
        return ' '.join(text.split()).strip()

    def _get_entity_area(self, entity):
        """Extracts precise area from polylines or circles."""
        try:
            if entity.dxftype() in ['LWPOLYLINE', 'POLYLINE']:
                # Use native area if available, else calculate from vertices
                if hasattr(entity, 'area'):
                    return abs(entity.area) / self.scale_factor
                vertices = [Vec2(v[:2]) for v in entity.get_points()]
                if len(vertices) >= 3:
                    return abs(ezdxf.math.area(vertices)) / self.scale_factor
            elif entity.dxftype() == 'CIRCLE':
                return (3.14159 * (entity.dxf.radius ** 2)) / self.scale_factor
            return 0.0
        except:
            return 0.0

    def run_audit(self):
        area_records = []
        materials = set()
        material_keywords = ["마감", "유리", "콘크리트", "THK", "단열재", "방수", "내화"]

        # Iterate through all objects in the drawing
        for entity in self.msp:
            # A. Process Geometry
            area = self._get_entity_area(entity)
            if area > 0.05: # Ignore tiny artifacts
                area_records.append({
                    'layer': entity.dxf.layer.upper(),
                    'area': area
                })
            
            # B. Process Text for Materials (Article 11)
            if entity.dxftype() in ['TEXT', 'MTEXT']:
                raw_text = entity.plain_text() if hasattr(entity, 'plain_text') else ""
                clean_text = self._clean_mtext(raw_text)
                if any(kw in clean_text for kw in material_keywords):
                    materials.add(clean_text)

        if not area_records:
            raise ValueError("No valid geometric shapes found in the DXF.")

        df = pd.DataFrame(area_records)

        # --- LOGIC: SITE DETECTION ---
        # Strategy: Match keywords first. If failed or too small, use largest overall shape.
        site_mask = df['layer'].apply(lambda x: any(kw in x for kw in self.SITE_KEYWORDS))
        site_df = df[site_mask]
        
        if not site_df.empty and site_df['area'].max() > 20: 
            site_area = site_df['area'].max()
            site_layer = site_df.loc[site_df['area'].idxmax(), 'layer']
            site_method = f"Keyword Match ({site_layer})"
        else:
            site_area = df['area'].max()
            site_layer = df.loc[df['area'].idxmax(), 'layer']
            site_method = f"Geometric Max Fallback ({site_layer})"

        # --- LOGIC: BUILDING DETECTION ---
        # Strategy: Sum all areas on layers containing 'HH' or 'WALL'
        bldg_mask = df['layer'].apply(lambda x: any(kw in x for kw in self.BLDG_KEYWORDS))
        bldg_df = df[bldg_mask]
        
        # Filter out the site layer itself to avoid double-counting
        bldg_df = bldg_df[bldg_df['layer'] != site_layer]
        
        if not bldg_df.empty:
            building_area = bldg_df['area'].sum()
            bldg_layer = ", ".join(bldg_df['layer'].unique())
        else:
            # If no layer matches, take the second largest distinct shape
            other_shapes = df[df['area'] < (site_area * 0.95)]
            building_area = other_shapes['area'].max() if not other_shapes.empty else 0
            bldg_layer = "Fallback (Largest Sub-Shape)"

        # Calculate Ratio
        btl_ratio = (building_area / site_area * 100) if site_area > 0 else 0

        return {
            "site_area": site_area,
            "building_area": building_area,
            "ratio": btl_ratio,
            "materials": sorted(list(materials)),
            "site_method": site_method,
            "bldg_layers": bldg_layer
        }

def print_legal_report(res):
    print("\n" + "="*60)
    print("      KOREAN BUILDING ACT COMPLIANCE AUDIT (VERIFIED)")
    print("="*60)
    print(f"Site Area (대지면적):           {res['site_area']:.2f} m²")
    print(f"Building Area (건축면적):       {res['building_area']:.2f} m²")
    print(f"BTL Ratio (건폐율):             {res['ratio']:.2f}%")
    print(f"Site Detection Method:         {res['site_method']}")
    print(f"Building Layers Used:          {res['bldg_layers']}")
    print("-" * 60)
    print(f"Article 11 Material Specs:     {len(res['materials'])} items found")
    
    # Sanity Check
    if res['ratio'] > 80:
        print("\n⚠️ WARNING: BTL ratio is high (>80%). Verify layer overlap.")
    elif res['ratio'] < 5:
        print("\n⚠️ WARNING: BTL ratio is very low (<5%). Verify layer selection.")
    else:
        print("\n✅ Ratio is within typical residential parameters.")
    print("="*60 + "\n")

if __name__ == "__main__":
    # Ensure you use the file path currently in your folder
    FILENAME = 'files/50Py2F R.C House.dxf'
    
    try:
        auditor = CivilComplianceAuditor(FILENAME)
        results = auditor.run_audit()
        print_legal_report(results)
        
        # Save to CSV for the compliance team
        report_df = pd.DataFrame({
            "Metric": ["Site Area", "Building Area", "BTL Ratio (%)", "Material Count"],
            "Value": [results['site_area'], results['building_area'], results['ratio'], len(results['materials'])]
        })
        report_df.to_csv("building_compliance_report.csv", index=False, encoding='utf-8-sig')
        
    except Exception as e:
        print(f"❌ Error during audit: {e}")