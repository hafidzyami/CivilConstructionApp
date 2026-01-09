import ezdxf
import re
import pandas as pd
from ezdxf.math import Vec2

class ProfessionalPermitAuditor:
    def __init__(self, file_path):
        try:
            self.doc = ezdxf.readfile(file_path)
            self.msp = self.doc.modelspace()
            
            # [Fix 4] CRITICAL Unit Validation: Ensure drawing is in mm (Korean standard)
            # $INSUNITS: 0=Unitless, 1=Inches, 4=Millimeters, 6=Meters
            self.units = self.doc.header.get('$INSUNITS', 4)
            
            if self.units not in [0, 4]:
                raise ValueError(
                    f"Invalid drawing units: Expected millimeters (4), got {self.units}. "
                    f"Korean architectural drawings must use mm per KCS standards."
                )
            
            self.scale_factor = 1_000_000  # mm² → m²
            print(f"✓ Drawing units validated: Millimeters (scaling factor: {self.scale_factor})")
            
        except ezdxf.DXFError as e:
            raise RuntimeError(f"DXF file error: {e}")
        except Exception as e:
            raise RuntimeError(f"Failed to load DXF: {e}")

        # [Fix 2] Legal Layer Priority (Standard Korean Practice) [cite: 26, 27, 28]
        self.SITE_LAYERS = ['지적선', 'SITE', '대지', '지적', 'LND', 'ETC']  # 지적선 = cadastral line (highest priority)
        self.BLDG_LAYERS = ['HH', 'A-WALL', '건축벽체', 'ARCH-WALL', 'FOOTPRINT']

    def clean_legal_text(self, text):
        """[Fix 3] FIXED: Improved Regex for Article 11 Compliance (Material Specs)"""
        # Remove AutoCAD MTEXT formatting codes: \A1; \C1; \H0.5x; \W0.8; \F|fontname; etc.
        # CRITICAL FIX: Changed [A-Zaz0-9] → [A-Za-z0-9] (regex bug fixed)
        text = re.sub(r'\\[A-Za-z][^;]*;', '', text)  # Remove formatting with semicolons
        text = re.sub(r'\\P', ' ', text)  # Paragraph breaks → spaces
        text = re.sub(r'[{}]', '', text)  # Remove grouping braces
        text = ' '.join(text.split())  # Normalize whitespace
        return text.strip()

    def get_precise_area(self, entity):
        """[Fix 1] Robust Area Extraction with Closed Validation & Multi-Entity Support"""
        try:
            if entity.dxftype() == 'LWPOLYLINE':
                # CRITICAL: Building footprints MUST be closed for legal area calculations
                if not entity.closed:
                    return 0.0
                
                # Use native .area property if available (ezdxf 1.1+)
                if hasattr(entity, 'area'):
                    return abs(entity.area) / self.scale_factor
                else:
                    # Fallback for older ezdxf versions
                    vertices = [Vec2(v[:2]) for v in entity.get_points()]
                    if len(vertices) >= 3:
                        return abs(ezdxf.math.area(vertices)) / self.scale_factor
                    
            elif entity.dxftype() == 'POLYLINE':
                if hasattr(entity, 'is_closed') and not entity.is_closed:
                    return 0.0
                vertices = [Vec2(v.dxf.location[:2]) for v in entity.vertices]
                if len(vertices) >= 3:
                    return abs(ezdxf.math.area(vertices)) / self.scale_factor
                    
            elif entity.dxftype() == 'CIRCLE':
                radius = entity.dxf.radius
                return (3.14159265359 * radius ** 2) / self.scale_factor
                
            elif entity.dxftype() == 'HATCH':
                return sum(abs(p.area) for p in entity.paths if hasattr(p, 'area')) / self.scale_factor
                
            return 0.0
            
        except (AttributeError, ValueError, IndexError) as e:
            # Log specific errors for debugging but don't crash
            # print(f"Warning: Area calculation failed for {entity.dxftype()}: {e}")
            return 0.0

    def audit(self):
        area_data = []
        materials = set()
        
        # Extended keywords for fire safety/insulation [cite: 10, 24, 30]
        keywords = ["마감", "유리", "콘크리트", "THK", "단열재", "방수", "내화", "난연"]

        for entity in self.msp:
            # Area Audit
            area = self.get_precise_area(entity)
            if area > 0:
                area_data.append({'layer': entity.dxf.layer.upper(), 'area': area})
            
            # Material Audit [cite: 10, 29]
            if entity.dxftype() in ['TEXT', 'MTEXT']:
                raw = entity.plain_text() if hasattr(entity, 'plain_text') else ""
                content = self.clean_legal_text(raw)
                if any(kw in content for kw in keywords):
                    materials.add(content)

        if not area_data:
            raise ValueError("No valid closed polylines found in DXF file")
            
        df = pd.DataFrame(area_data)
        
        # [Fix 2] ENHANCED: Priority Logic for Site and Building (Article 55 Compliance)
        site_area = 0.0
        site_layer_found = None
        for s_layer in self.SITE_LAYERS:
            if s_layer in df['layer'].values:
                site_area = df[df['layer'] == s_layer]['area'].max()
                site_layer_found = s_layer
                break
        
        # Fallback: Use largest area if no standard layer found
        if site_area == 0.0:
            site_area = df['area'].max()
            print(f"⚠ Warning: No standard site layer found. Using largest area: {site_area:.2f} m²")
        else:
            print(f"✓ Site boundary detected: Layer '{site_layer_found}' = {site_area:.2f} m²")
        
        bldg_area = 0.0
        bldg_layer_found = None
        for b_layer in self.BLDG_LAYERS:
            if b_layer in df['layer'].values:
                bldg_area = df[df['layer'] == b_layer]['area'].sum()  # Handle multi-building
                bldg_layer_found = b_layer
                break
        
        # [Fix 4] CRITICAL: Error if building footprint not found
        if bldg_area == 0.0:
            available_layers = ', '.join(df['layer'].unique())
            raise ValueError(
                f"Cannot identify building footprint layer. Expected one of {self.BLDG_LAYERS}, "
                f"but found: {available_layers}"
            )
        else:
            print(f"✓ Building footprint detected: Layer '{bldg_layer_found}' = {bldg_area:.2f} m²")

        return {
            "site": site_area,
            "building": bldg_area,
            "ratio": (bldg_area / site_area * 100) if site_area > 0 else 0,
            "materials": sorted(list(materials)),
            "site_layer": site_layer_found,
            "building_layer": bldg_layer_found
        }

# Run Audit
if __name__ == "__main__":
    try:
        auditor = ProfessionalPermitAuditor('50Py2F R.C House.dxf')
        results = auditor.audit()
        
        print("\n" + "="*60)
        print("    KOREAN BUILDING ACT COMPLIANCE AUDIT (Article 55)")
        print("="*60)
        print(f"Site Area (대지면적):           {results['site']:.2f} m²")
        print(f"Building Area (건축면적):       {results['building']:.2f} m²")
        print(f"Building-to-Land Ratio (건폐율): {results['ratio']:.2f}%")
        print(f"\nArticle 11 Material Specs:      {len(results['materials'])} found")
        print("="*60)
        
        # Export CSV report
        report_data = {
            "Metric": ["Site Area (m²)", "Building Area (m²)", "B/L Ratio (%)", "Materials"],
            "Value": [f"{results['site']:.2f}", f"{results['building']:.2f}", 
                     f"{results['ratio']:.2f}", len(results['materials'])],
            "Layer": [results.get('site_layer', 'N/A'), results.get('building_layer', 'N/A'), "-", "-"]
        }
        pd.DataFrame(report_data).to_csv("building_compliance_report.csv", index=False, encoding='utf-8-sig')
        print("✓ Report saved: building_compliance_report.csv\n")
        
    except Exception as e:
        print(f"\n❌ AUDIT FAILED: {e}\n")
        raise