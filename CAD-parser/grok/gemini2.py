import ezdxf
import re
import pandas as pd
from ezdxf.math import Vec2

class BuildingComplianceApp:
    def __init__(self, file_path):
        self.doc = ezdxf.readfile(file_path)
        self.msp = self.doc.modelspace()
        
    def get_area(self, entity):
        try:
            if entity.dxftype() in ['LWPOLYLINE', 'POLYLINE']:
                vertices = [Vec2(v[:2]) for v in entity.get_points()]
                if len(vertices) >= 3:
                    # mm^2 to m^2 conversion (1,000,000 mm^2 = 1 m^2)
                    return abs(ezdxf.math.area(vertices)) / 1_000_000
            return 0.0
        except:
            return 0.0

    def run_audit(self):
        all_areas = []
        materials = []

        for entity in self.msp:
            # 1. Extract Geometry
            area = self.get_area(entity)
            if area > 0:
                all_areas.append({'layer': entity.dxf.layer, 'area_m2': area})
            
            # 2. Extract Materials
            if entity.dxftype() in ['TEXT', 'MTEXT']:
                content = entity.plain_text() if hasattr(entity, 'plain_text') else ""
                content = re.sub(r"\\[A-Zaz0-9].*?;", "", content).replace("\\P", " ").strip()
                if any(kw in content for kw in ["마감", "유리", "콘크리트", "THK"]):
                    materials.append(content)

        # LOGIC: Largest area is usually the Site
        df_areas = pd.DataFrame(all_areas)
        site_area = df_areas['area_m2'].max()
        
        # LOGIC: HH is the building footprint
        building_area = df_areas[df_areas['layer'] == 'HH']['area_m2'].iloc[0] if 'HH' in df_areas['layer'].values else 0
        
        # Calculate Building-to-Land Ratio
        btl_ratio = (building_area / site_area * 100) if site_area > 0 else 0
        
        # Create CSV Report
        report_data = {
            "Metric": ["Site Area (m2)", "Building Area (m2)", "Building-to-Land Ratio (%)", "Material Specs Found"],
            "Value": [f"{site_area:.2f}", f"{building_area:.2f}", f"{btl_ratio:.2f}%", len(set(materials))]
        }
        pd.DataFrame(report_data).to_csv("building_compliance_report.csv", index=False)
        
        return report_data, sorted(list(set(materials)))

# Execution
auditor = BuildingComplianceApp('50Py2F R.C House.dxf')
report, mat_list = auditor.run_audit()

print(f"Compliance Report Generated: building_compliance_report.csv")
print(f"Building-to-Land Ratio: {report['Value'][2]}")