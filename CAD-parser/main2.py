import subprocess
import os
import ezdxf
from ezdxf.math import Vec2

# --- CONFIGURATION ---
ODA_PATH = r"C:\Program Files\ODA\ODAFileConverter 26.10.0\ODAFileConverter.exe"
OUT_VER = "ACAD2018"
OUT_FORMAT = "DXF"

def calculate_area(points):
    """Calculates polygon area using Shoelace formula."""
    if len(points) < 3: return 0
    return 0.5 * abs(sum(points[i].x * points[i+1].y - points[i+1].x * points[i].y 
                         for i in range(len(points)-1)))

def get_poly_area(entity):
    try:
        if entity.dxftype() == 'LWPOLYLINE':
            points = [Vec2(p) for p in entity.get_points()]
        elif entity.dxftype() == 'POLYLINE':
            points = [Vec2(v.point) for v in entity.vertices]
        else: return 0
        return calculate_area(points)
    except: return 0

def convert_dwg_to_dxf(dwg_path, output_folder):
    input_folder = os.path.dirname(os.path.abspath(dwg_path))
    filename = os.path.basename(dwg_path)
    args = [ODA_PATH, input_folder, output_folder, OUT_VER, OUT_FORMAT, "0", "1", filename]
    print(f"Converting {filename}...")
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)
    return os.path.join(output_folder, filename.replace(".dwg", ".dxf"))

def extract_refined_metrics(dxf_path):
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    all_polys = list(msp.query('LWPOLYLINE')) + list(msp.query('POLYLINE'))

    site_areas = []
    floor_polys = []

    for poly in all_polys:
        area_m2 = get_poly_area(poly) / 1_000_000
        layer = poly.dxf.layer
        
        # Identify Site Candidates (Layer: 지적선)
        if layer == "지적선" and area_m2 > 10:
            site_areas.append(area_m2)
            
        # Identify Building/Floor Candidates
        layer_u = layer.upper()
        if any(k in layer_u for k in ["FLOR", "층", "PFIX", "AREA"]):
            if area_m2 > 10:
                floor_polys.append(area_m2)

    # SITE LOGIC: Pick the smallest site polygon found (to avoid the 5.2ha block)
    site_area = min(site_areas) if site_areas else 0
    
    # BUILDING LOGIC: Largest footprint found
    bldg_area = max(floor_polys) if floor_polys else 0

    # TOTAL FLOOR AREA (연면적): Top 2 largest outlines (for 2F)
    floor_polys.sort(reverse=True)
    total_floor_area = sum(floor_polys[:2]) if len(floor_polys) >= 2 else sum(floor_polys)

    return site_area, bldg_area, total_floor_area

if __name__ == "__main__":
    my_dwg = "50Py2F R.C House.dwg"
    out_dir = "extracted_files"
    os.makedirs(out_dir, exist_ok=True)

    try:
        dxf_file = convert_dwg_to_dxf(my_dwg, out_dir)
        site, bldg, total_f = extract_refined_metrics(dxf_file)
        
        # --- CALCULATION OF RATIOS ---
        bcr = (bldg / site * 100) if site > 0 else 0
        far = (total_f / site * 100) if site > 0 else 0

        print("\n" + "="*45)
        print("    CERTIFIED BUILDING PERMIT METRICS")
        print("="*45)
        print(f"Site Area (Lot)        : {site:>10.2f} m2")
        print(f"Building Area (1F)     : {bldg:>10.2f} m2")
        print(f"Total Floor Area (Sum) : {total_f:>10.2f} m2")
        print("-" * 45)
        print(f"BCR (건폐율)            : {bcr:>10.2f} %")
        print(f"FAR (용적률)            : {far:>10.2f} %")
        print("="*45)

        if site > 5000:
            print("\n[!] WARNING: Site Area exceeds 5000m2. This is likely a")
            print("    neighborhood block, not a single residential lot.")
            print("    Ensure your Lot Boundary is a 'Closed Polyline'.")

    except Exception as e:
        print(f"Fatal Error: {e}")