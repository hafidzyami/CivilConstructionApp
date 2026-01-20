import ezdxf
from shapely.geometry import LineString, Point, MultiLineString, Polygon
from shapely.ops import polygonize, unary_union, nearest_points
import networkx as nx

UNIT_TO_METERS = {0: 0.0254, 1: 0.0254, 2: 0.0254, 4: 0.001, 5: 0.01, 6: 1.0}
EXTENSION_TOLERANCE = 1.5

def get_dxf_layers(file_path):
    try:
        doc = ezdxf.readfile(file_path)
        msp = doc.modelspace()
        layers = set()
        for entity in msp.query('LINE LWPOLYLINE'):
            layers.add(entity.dxf.layer)
        return sorted(list(layers)), None
    except Exception as e:
        return [], str(e)

def process_dxf_geometry(file_path, active_layers=None):
    try:
        doc = ezdxf.readfile(file_path)
    except Exception as e:
        return None, 0, None, str(e)

    msp = doc.modelspace()
    units_code = doc.header.get('$INSUNITS', 0)
    scale = UNIT_TO_METERS.get(units_code, 0.0254)
    if units_code == 2: scale = 0.0254

    lines = []
    for entity in msp.query('LINE LWPOLYLINE'):
        if active_layers is not None and len(active_layers) > 0:
             if entity.dxf.layer not in active_layers:
                continue
            
        if entity.dxftype() == 'LINE':
            lines.append(LineString([(entity.dxf.start.x, entity.dxf.start.y), (entity.dxf.end.x, entity.dxf.end.y)]))
        elif entity.dxftype() == 'LWPOLYLINE':
            points = list(entity.get_points(format='xy'))
            if len(points) > 1:
                for i in range(len(points) - 1):
                    lines.append(LineString([points[i], points[i+1]]))
                if entity.is_closed:
                    lines.append(LineString([points[-1], points[0]]))

    rounded = []
    for line in lines:
        p1 = (round(line.coords[0][0], 3), round(line.coords[0][1], 3))
        p2 = (round(line.coords[-1][0], 3), round(line.coords[-1][1], 3))
        if p1 != p2: rounded.append(LineString([p1, p2]))

    G = nx.Graph()
    for line in rounded: G.add_edge(line.coords[0], line.coords[-1])
    dead_ends = [Point(n) for n, d in G.degree() if d == 1]
    
    extensions = []
    if dead_ends and rounded:
        candidates_geom = MultiLineString(rounded)
        for p in dead_ends:
            nearest = nearest_points(p, candidates_geom)[1]
            if p.distance(nearest) < (EXTENSION_TOLERANCE / scale):
                extensions.append(LineString([p, nearest]))

    all_lines = rounded + extensions
    noded = unary_union(all_lines)
    final_lines = list(noded.geoms) if not isinstance(noded, LineString) else [noded]
    
    polys = list(polygonize(final_lines))
    valid_polys = [p for p in polys if p.area * (scale**2) > 0.001]
    valid_polys.sort(key=lambda p: p.area, reverse=True)
    
    output_polygons = []
    for i, p in enumerate(valid_polys):
        exterior_coords = list(p.exterior.coords)
        output_polygons.append({
            "id": i,
            "points": exterior_coords,
            "area_raw": p.area,
            "area_m2": p.area * (scale**2)
        })

    # Calculate bounding box for ViewBox
    if not output_polygons:
        bounds = {"min_x": 0, "min_y": 0, "max_x": 100, "max_y": 100}
    else:
        all_x = [pt[0] for poly in output_polygons for pt in poly["points"]]
        all_y = [pt[1] for poly in output_polygons for pt in poly["points"]]
        bounds = {
            "min_x": min(all_x),
            "min_y": min(all_y),
            "max_x": max(all_x),
            "max_y": max(all_y)
        }

    return output_polygons, scale, bounds, None