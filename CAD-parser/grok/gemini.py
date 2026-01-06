import ezdxf
import re
from ezdxf.math import Vec2

class BuildingPermitAuditor:
    def __init__(self, file_path):
        self.doc = ezdxf.readfile(file_path)
        self.msp = self.doc.modelspace()
        self.material_keywords = ["마감", "유리", "석재", "타일", "벽지", "콘크리트", "THK"]

    def clean_text(self, text):
        return re.sub(r"\\[A-Zaz0-9].*?;", "", text).replace("\\P", " ").strip()

    def get_area(self, entity):
        try:
            if entity.dxftype() in ['LWPOLYLINE', 'POLYLINE']:
                vertices = [Vec2(v[:2]) for v in entity.get_points()]
                if len(vertices) >= 3:
                    return abs(ezdxf.math.area(vertices))
            return 0.0
        except:
            return 0.0

    def generate_legal_report(self):
        data = {"site_area": 0.0, "building_area": 0.0, "materials": set()}
        
        for entity in self.msp:
            # Area Categorization
            area = self.get_area(entity)
            layer = entity.dxf.layer.upper()
            
            if area > 0:
                if layer == "ETC": # Assuming ETC is site boundary per previous results
                    data["site_area"] = max(data["site_area"], area)
                elif layer == "HH": # Primary building footprint
                    data["building_area"] = max(data["building_area"], area)

            # Material Audit
            if entity.dxftype() in ['TEXT', 'MTEXT']:
                content = self.clean_text(entity.plain_text() if hasattr(entity, 'plain_text') else entity.dxf.text)
                if any(kw in content for kw in self.material_keywords):
                    data["materials"].add(content)

        # Ratio Calculation
        ratio = (data["building_area"] / data["site_area"] * 100) if data["site_area"] > 0 else 0
        
        return {
            "ratios": {"site": data["site_area"], "building": data["building_area"], "ratio": ratio},
            "material_count": len(data["materials"]),
            "sample_materials": list(data["materials"])[:5]
        }

# Execute Report
auditor = BuildingPermitAuditor('50Py2F R.C House.dxf')
report = auditor.generate_legal_report()

print("====================================================")
print("BUILDING ACT COMPLIANCE SUMMARY REPORT")
print("====================================================")
print(f"1. SITE BOUNDARY AREA (ETC):   {report['ratios']['site']:,.2f} sq units")
print(f"2. BUILDING FOOTPRINT (HH):    {report['ratios']['building']:,.2f} sq units")
print(f"3. BUILDING-TO-LAND RATIO:     {report['ratios']['ratio']:.2f}%")
print("----------------------------------------------------")
print(f"4. MATERIAL SPECS FOUND:       {report['material_count']}")
print(f"   Samples: {', '.join(report['sample_materials'])}")
print("====================================================")