import subprocess
import os
import ezdxf
from ezdxf.math import Vec2

# --- CONFIGURATION ---
# Path to your ODA File Converter executable
ODA_PATH = r"C:\Program Files\ODA\ODAFileConverter 26.10.0\ODAFileConverter.exe"
# Technical standards: DXF format and a common AutoCAD version
OUT_VER = "ACAD2018"
OUT_FORMAT = "DXF"

def convert_dwg_to_dxf(dwg_path, output_folder):
    """
    Converts DWG to DXF using ODA File Converter.
    Note: ODA works on folders, so we point it to the file's directory.
    """
    input_folder = os.path.dirname(os.path.abspath(dwg_path))
    filename = os.path.basename(dwg_path)
    
    # Arguments: [input_folder] [output_folder] [out_ver] [out_format] [recursive] [audit] [filter]
    args = [ODA_PATH, input_folder, output_folder, OUT_VER, OUT_FORMAT, "0", "1", filename]
    
    print(f"Converting {filename}...")
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)
    return os.path.join(output_folder, filename.replace(".dwg", ".dxf"))

def calculate_area(points):
    if len(points) < 3: return 0
    return 0.5 * abs(sum(points[i].x * points[i+1].y - points[i+1].x * points[i].y 
                         for i in range(len(points)-1)))

def robust_extract(dxf_path):
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    
    # 1. Audit semua layer untuk melihat di mana data berada
    layer_report = {}
    # Mencari LWPOLYLINE dan POLYLINE (format lama)
    for entity in msp.query('LWPOLYLINE POLYLINE'):
        layer = entity.dxf.layer
        if entity.dxftype() == 'LWPOLYLINE':
            points = [Vec2(p) for p in entity.get_points()]
        else: # POLYLINE
            points = [Vec2(p.point) for p in entity.vertices]
            
        area = calculate_area(points)
        if layer not in layer_report:
            layer_report[layer] = {'count': 0, 'total_area': 0, 'max_area': 0}
        
        layer_report[layer]['count'] += 1
        layer_report[layer]['total_area'] += area
        layer_report[layer]['max_area'] = max(layer_report[layer]['max_area'], area)

    print(f"{'Layer Name':<20} | {'Count':<6} | {'Max Entity Area (mm2)':<20}")
    print("-" * 55)
    for layer, info in sorted(layer_report.items()):
        if info['max_area'] > 0:
            print(f"{layer:<20} | {info['count']:<6} | {info['max_area']:>20.2f}")

    # 2. Mapping Berdasarkan Nama Layer yang Benar di File Anda
    site_layer = "지적선"
    bldg_layer = "A-FLOR-PFIX"
    
    site_mm2 = layer_report.get(site_layer, {}).get('max_area', 0)
    bldg_mm2 = layer_report.get(bldg_layer, {}).get('max_area', 0)
    
    if bldg_mm2 == 0:
        bldg_layer = "6"
        bldg_mm2 = layer_report.get(bldg_layer, {}).get('max_area', 0)

    # Konversi mm2 ke m2 (bagi 1.000.000)
    site_m2 = site_mm2 / 1_000_000
    bldg_m2 = bldg_mm2 / 1_000_000
    
    # Hitung BCR
    bcr = (bldg_m2 / site_m2 * 100) if site_m2 > 0 else 0
    
    return site_m2, bldg_m2, bcr

# --- EXECUTION ---
if __name__ == "__main__":
    my_dwg = "50Py2F R.C House.dwg"
    out_dir = "extracted_files"
    os.makedirs(out_dir, exist_ok=True)

    try:
        dxf_file = convert_dwg_to_dxf(my_dwg, out_dir)
        site, bldg, bcr = robust_extract(dxf_file)
        
        print("\n--- BUILDING PERMIT METRICS ---")
        print(f"Site Area: {site:.2f} m2")
        print(f"Building Area: {bldg:.2f} m2")
        print(f"BCR: {bcr:.2f} %")
    except Exception as e:
        print(f"Error: {e}")