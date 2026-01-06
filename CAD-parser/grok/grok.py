import pandas as pd
import math

def parse_dxf(file_path: str) -> Dict[str, Any]:
    """
    Improved DXF parser with error handling for conversions: Reads DXF file, handles repeated group codes by storing as list of tuples.
    Parses common entities (LINE, CIRCLE, ARC, TEXT/MTEXT, LWPOLYLINE, POLYLINE with VERTEX/SEQEND, DIMENSION, VIEWPORT).
    Computes totals like areas (shoelace for polylines, pi*r^2 for circles), lengths, and scales.
    
    Args:
        file_path (str): Path to the ASCII DXF file.
    
    Returns:
        Dict[str, Any]: {'header': dict, 'entities': pd.DataFrame, 'computed': dict with totals}.
    """
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = [line.strip() for line in f if line.strip()]
    except UnicodeDecodeError:
        with open(file_path, 'r', encoding='ascii', errors='ignore') as f:
            lines = [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        return {'error': 'File not found'}
    except Exception as e:
        return {'error': str(e)}

    i = 0
    header = {}
    entities_list = []
    current_section = None
    buffer = []  # List to collect code-value pairs for current entity/section

    while i < len(lines):
        if i + 1 >= len(lines):
            break
        code = lines[i]
        value = lines[i + 1]

        if code == '0':
            if value == 'SECTION':
                if current_section == 'HEADER':
                    header = process_header(buffer)
                elif current_section == 'ENTITIES':
                    entities_list.extend(process_entities(buffer))
                buffer = []
                i += 2
                if i < len(lines) and lines[i] == '2':
                    current_section = lines[i + 1]
                i += 2
                continue
            elif value == 'ENDSEC':
                if current_section == 'HEADER':
                    header = process_header(buffer)
                elif current_section == 'ENTITIES':
                    entities_list.extend(process_entities(buffer))
                buffer = []
                current_section = None
                i += 2
                continue
            else:
                if buffer:
                    entities_list.extend(process_entities(buffer))
                buffer = [(code, value)]
                i += 2
                continue

        if current_section:
            buffer.append((code, value))
        i += 2

    if buffer:
        entities_list.extend(process_entities(buffer))

    df = pd.DataFrame(entities_list)

    computed = compute_aggregates(df)

    return {'header': header, 'entities': df, 'computed': computed}

def process_header(buffer: List[tuple]) -> Dict:
    head = {}
    for code, value in buffer:
        if code not in head:
            head[code] = value
        else:
            if not isinstance(head[code], list):
                head[code] = [head[code]]
            head[code].append(value)
    return head

def process_entities(buffer: List[tuple]) -> List[Dict]:
    entities = []
    current_polyline = None
    i = 0
    while i < len(buffer):
        code, value = buffer[i]
        if code == '0':
            if value == 'POLYLINE':
                current_polyline = {'type': 'POLYLINE', 'vertices': [], 'layer': '0', 'flag': 0, 'raw_pairs': []}
                j = i + 1
                while j < len(buffer) and buffer[j][0] != '0':
                    c, v = buffer[j]
                    current_polyline['raw_pairs'].append((c, v))
                    if c == '8':
                        current_polyline['layer'] = v
                    elif c == '70':
                        try:
                            current_polyline['flag'] = int(v)
                        except ValueError:
                            pass
                    j += 1
                i = j
                continue
            elif value == 'VERTEX' and current_polyline:
                j = i + 1
                vertex_buffer = [(code, value)]
                while j < len(buffer) and buffer[j][0] != '0':
                    vertex_buffer.append(buffer[j])
                    j += 1
                vertex = extract_vertex(vertex_buffer)
                if vertex:
                    current_polyline['vertices'].append(vertex['position'])
                i = j
                continue
            elif value == 'SEQEND' and current_polyline:
                if current_polyline['flag'] & 1 and current_polyline['vertices']:
                    current_polyline['area'] = shoelace_area(current_polyline['vertices'])
                entities.append(current_polyline)
                current_polyline = None
                i += 1
                continue
            else:
                j = i + 1
                ent_buffer = [(code, value)]
                while j < len(buffer) and buffer[j][0] != '0':
                    ent_buffer.append(buffer[j])
                    j += 1
                ent_type = value
                if ent_type:
                    ent = None
                    if ent_type == 'LINE':
                        ent = extract_line(ent_buffer)
                    elif ent_type == 'CIRCLE':
                        ent = extract_circle(ent_buffer)
                    elif ent_type == 'ARC':
                        ent = extract_arc(ent_buffer)
                    elif ent_type in ['TEXT', 'MTEXT']:
                        ent = extract_text(ent_buffer)
                    elif ent_type == 'LWPOLYLINE':
                        ent = extract_lwpolyline(ent_buffer)
                    elif ent_type == 'DIMENSION':
                        ent = extract_dimension(ent_buffer)
                    elif ent_type == 'VIEWPORT':
                        ent = extract_viewport(ent_buffer)
                    if ent:
                        entities.append(ent)
                i = j
                continue
        i += 1
    return entities

def safe_float(v):
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0  # Default to 0 on error

def extract_line(buffer: List[tuple]) -> Dict:
    ent = {'type': 'LINE', 'raw_pairs': buffer, 'layer': '0', 'start': (0,0,0), 'end': (0,0,0), 'length': 0.0}
    codes = {}
    for c, v in buffer:
        if c in ['8', '10', '20', '30', '11', '21', '31']:
            codes[c] = v
    ent['layer'] = codes.get('8', '0')
    start = (safe_float(codes.get('10')), safe_float(codes.get('20')), safe_float(codes.get('30')))
    end = (safe_float(codes.get('11')), safe_float(codes.get('21')), safe_float(codes.get('31')))
    ent['start'] = start
    ent['end'] = end
    ent['length'] = math.dist(start[:2], end[:2]) if all(isinstance(x, float) for x in start[:2] + end[:2]) else 0.0
    return ent

def extract_circle(buffer: List[tuple]) -> Dict:
    ent = {'type': 'CIRCLE', 'raw_pairs': buffer, 'layer': '0', 'center': (0,0,0), 'radius': 0.0, 'area': 0.0}
    codes = {}
    for c, v in buffer:
        if c in ['8', '10', '20', '30', '40']:
            codes[c] = v
    ent['layer'] = codes.get('8', '0')
    center = (safe_float(codes.get('10')), safe_float(codes.get('20')), safe_float(codes.get('30')))
    radius = safe_float(codes.get('40'))
    ent['center'] = center
    ent['radius'] = radius
    ent['area'] = math.pi * radius ** 2
    return ent

def extract_arc(buffer: List[tuple]) -> Dict:
    ent = {'type': 'ARC', 'raw_pairs': buffer, 'layer': '0', 'center': (0,0,0), 'radius': 0.0, 'start_angle': 0.0, 'end_angle': 0.0, 'length': 0.0}
    codes = {}
    for c, v in buffer:
        if c in ['8', '10', '20', '30', '40', '50', '51']:
            codes[c] = v
    ent['layer'] = codes.get('8', '0')
    center = (safe_float(codes.get('10')), safe_float(codes.get('20')), safe_float(codes.get('30')))
    radius = safe_float(codes.get('40'))
    start_angle = safe_float(codes.get('50'))
    end_angle = safe_float(codes.get('51'))
    ent['center'] = center
    ent['radius'] = radius
    ent['start_angle'] = start_angle
    ent['end_angle'] = end_angle
    ent['length'] = radius * math.radians(abs(end_angle - start_angle))
    return ent

def extract_text(buffer: List[tuple]) -> Dict:
    ent = {'type': buffer[0][1], 'raw_pairs': buffer, 'layer': '0', 'position': (0,0,0), 'content': '', 'height': 0.0}
    codes = {}
    for c, v in buffer:
        if c in ['8', '10', '20', '30', '40', '1', '3']:
            codes[c] = v
    ent['layer'] = codes.get('8', '0')
    position = (safe_float(codes.get('10')), safe_float(codes.get('20')), safe_float(codes.get('30')))
    content = codes.get('1', '') + codes.get('3', '')
    height = safe_float(codes.get('40'))
    ent['position'] = position
    ent['content'] = content
    ent['height'] = height
    return ent

def extract_lwpolyline(buffer: List[tuple]) -> Dict:
    ent = {'type': 'LWPOLYLINE', 'vertices': [], 'layer': '0', 'closed': False, 'raw_pairs': buffer, 'area': 0.0, 'length': 0.0}
    codes = {}
    vertices = []
    k = 0
    while k < len(buffer):
        c, v = buffer[k]
        if c in ['70', '8']:
            codes[c] = v
        if c == '10':
            x = safe_float(v)
            k += 1
            if k < len(buffer) and buffer[k][0] == '20':
                y = safe_float(buffer[k][1])
                k += 1
            else:
                y = 0.0
            z = 0.0
            if k < len(buffer) and buffer[k][0] == '30':
                z = safe_float(buffer[k][1])
                k += 1
            vertices.append((x, y, z))
            continue
        k += 1
    ent['layer'] = codes.get('8', '0')
    try:
        ent['closed'] = bool(int(codes.get('70', '0')) & 1)
    except ValueError:
        pass
    ent['vertices'] = vertices
    if ent['closed'] and len(vertices) >= 3:
        ent['area'] = shoelace_area(vertices)
    if vertices:
        perim = 0.0
        for idx in range(len(vertices) - 1 if not ent['closed'] else len(vertices)):
            p1 = vertices[idx]
            p2 = vertices[(idx + 1) % len(vertices)]
            perim += math.dist(p1[:2], p2[:2])
        ent['length'] = perim
    return ent

def extract_vertex(buffer: List[tuple]) -> Dict:
    ent = {'type': 'VERTEX', 'raw_pairs': buffer, 'position': (0,0,0)}
    codes = {}
    for c, v in buffer:
        if c in ['10', '20', '30']:
            codes[c] = v
    position = (safe_float(codes.get('10')), safe_float(codes.get('20')), safe_float(codes.get('30')))
    ent['position'] = position
    return ent

def extract_dimension(buffer: List[tuple]) -> Dict:
    ent = {'type': 'DIMENSION', 'raw_pairs': buffer, 'layer': '0', 'measurement': 0.0}
    codes = {}
    for c, v in buffer:
        if c in ['8', '42']:
            codes[c] = v
    ent['layer'] = codes.get('8', '0')
    ent['measurement'] = safe_float(codes.get('42'))
    return ent

def extract_viewport(buffer: List[tuple]) -> Dict:
    ent = {'type': 'VIEWPORT', 'raw_pairs': buffer, 'layer': '0', 'scale': 1.0}
    codes = {}
    for c, v in buffer:
        if c in ['8', '41', '45']:
            codes[c] = v
    ent['layer'] = codes.get('8', '0')
    h = safe_float(codes.get('41', 1.0))
    w = safe_float(codes.get('45', 1.0))
    ent['scale'] = h / w if w != 0 else 1.0
    return ent

def shoelace_area(vertices: List[tuple]) -> float:
    if len(vertices) < 3:
        return 0.0
    area = 0.0
    for k in range(len(vertices)):
        x1, y1, _ = vertices[k]
        x2, y2, _ = vertices[(k + 1) % len(vertices)]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2

def compute_aggregates(df: pd.DataFrame) -> Dict:
    computed = {'total_area': 0.0, 'total_length': 0.0, 'scales': [], 'texts': []}
    for _, row in df.iterrows():
        if 'area' in row and isinstance(row['area'], (int, float)):
            computed['total_area'] += row['area']
        if 'length' in row and isinstance(row['length'], (int, float)):
            computed['total_length'] += row['length']
        if 'scale' in row and isinstance(row['scale'], (int, float)):
            computed['scales'].append(row['scale'])
        if 'content' in row:
            computed['texts'].append(row['content'])
    return computed

# Example usage:
result = parse_dxf('50Py2F R.C House.dxf')
print(result['entities'])
print(result['computed'])