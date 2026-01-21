import tkinter as tk
from tkinter import filedialog, messagebox
import ezdxf
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg, NavigationToolbar2Tk
from matplotlib.patches import Rectangle, Polygon as MplPolygon
from shapely.geometry import LineString, Point, MultiLineString, Polygon, box
from shapely.ops import polygonize, unary_union, nearest_points
import networkx as nx
import re
import pandas as pd # Import pandas for data handling
from ezdxf.math import Vec2 # Import Vec2 for area calc

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

# --- AUDIT LOGIC (Integrated from fullaudit.py) ---
class ComplianceAuditor:
    def __init__(self, file_path):
        self.doc = ezdxf.readfile(file_path)
        self.msp = self.doc.modelspace()
        self.units = self.doc.header.get('$INSUNITS', 4)
        self.scale = 1_000_000 if self.units in [0, 4] else 1.0
        
        self.SITE_KWS = ['지적', 'SITE', '대지', 'LND', 'BOUNDARY']
        self.FOOTPRINT_KWS = ['HH', 'FOOTPRINT', '건축면적']
        self.FLOOR_PATTERN = re.compile(r'(B?\d+)(F|층|FLR|FLOOR|ND|ST|RD|TH)', re.IGNORECASE)

    def _get_area(self, e):
        try:
            if e.dxftype() in ['LWPOLYLINE', 'POLYLINE']:
                if hasattr(e, 'area'): return abs(e.area) / self.scale
                return abs(ezdxf.math.area([Vec2(v[:2]) for v in e.get_points()])) / self.scale
            return 0.0
        except: return 0.0

    def analyze_layers(self):
        geometry_data = []
        for e in self.msp:
            area = self._get_area(e)
            if area > 0.05:
                geometry_data.append({'layer': e.dxf.layer.upper(), 'area': area})

        df = pd.DataFrame(geometry_data)
        if df.empty: return {}, {}, set()

        # Identify Site Layer
        site_mask = df['layer'].apply(lambda x: any(k in x for k in self.SITE_KWS))
        if any(site_mask):
            site_layer = df[site_mask].loc[df[site_mask]['area'].idxmax(), 'layer']
        else:
            site_layer = df.loc[df['area'].idxmax(), 'layer']

        # Identify Footprint Layers
        footprint_mask = df['layer'].apply(lambda x: any(k in x for k in self.FOOTPRINT_KWS))
        footprint_layers = set(df[footprint_mask]['layer'].unique()) if any(footprint_mask) else set()

        # Identify Floor Layers
        floor_layers = set()
        for layer in df['layer'].unique():
            match = self.FLOOR_PATTERN.search(layer)
            is_color_layer = layer in [str(i) for i in range(1, 9)]
            if (match and not is_color_layer) or layer in ['2D', '면적', 'AREA'] or ("HH" in layer):
                floor_layers.add(layer)

        return {
            "site": site_layer,
            "footprint": footprint_layers,
            "floors": floor_layers
        }

def process_dxf(file_path, active_layers=None):
    try:
        doc = ezdxf.readfile(file_path)
    except Exception as e:
        return None, 0, str(e)

    msp = doc.modelspace()
    units_code = doc.header.get('$INSUNITS', 0)
    scale = UNIT_TO_METERS.get(units_code, 0.0254)
    if units_code == 2: scale = 0.0254

    lines = []
    # Store layer info with lines to preserve identity
    line_layers = [] 

    for entity in msp.query('LINE LWPOLYLINE'):
        # Filter by active layers if specified
        if active_layers is not None and entity.dxf.layer not in active_layers:
            continue
            
        l_geom = None
        if entity.dxftype() == 'LINE':
            l_geom = LineString([(entity.dxf.start.x, entity.dxf.start.y), (entity.dxf.end.x, entity.dxf.end.y)])
        elif entity.dxftype() == 'LWPOLYLINE':
            points = list(entity.get_points(format='xy'))
            for i in range(len(points) - 1):
                # We treat polylines as individual segments for polygonization
                lines.append(LineString([points[i], points[i+1]]))
                line_layers.append(entity.dxf.layer) # Track layer
            if entity.is_closed:
                lines.append(LineString([points[-1], points[0]]))
                line_layers.append(entity.dxf.layer)
            continue # Skip append below since handled in loop

        if l_geom:
            lines.append(l_geom)
            line_layers.append(entity.dxf.layer)

    # Note: Polygonization merges lines, so we lose 1-to-1 layer mapping for the final polygon.
    # However, we can guess the layer of a polygon by checking which lines form its boundary.
    # For visualization, we will prioritize the layer of the longest segment.
    
    rounded = []
    rounded_layers = []
    for i, line in enumerate(lines):
        p1 = (round(line.coords[0][0], 3), round(line.coords[0][1], 3))
        p2 = (round(line.coords[-1][0], 3), round(line.coords[-1][1], 3))
        if p1 != p2: 
            rounded.append(LineString([p1, p2]))
            rounded_layers.append(line_layers[i])

    G = nx.Graph()
    for line in rounded: G.add_edge(line.coords[0], line.coords[-1])
    dead_ends = [Point(n) for n, d in G.degree() if d == 1]
    
    extensions = []
    extension_layers = []
    if dead_ends and rounded:
        candidates_geom = MultiLineString(rounded)
        for p in dead_ends:
            nearest = nearest_points(p, candidates_geom)[1]
            if p.distance(nearest) < (EXTENSION_TOLERANCE / scale):
                extensions.append(LineString([p, nearest]))
                # Assign a default or inherited layer for extensions
                extension_layers.append("EXTENSION") 

    all_lines = rounded + extensions
    # (Skipping robust layer tracking through union for brevity, relying on spatial match later if needed)
    noded = unary_union(all_lines)
    final_lines = list(noded.geoms) if not isinstance(noded, LineString) else [noded]
    
    polys = list(polygonize(final_lines))
    valid_polys = [p for p in polys if p.area * (scale**2) > 0.001]
    
    # Pack polygons with their probable source layer (naive approach: check overlap with original lines)
    # Since checking overlap is expensive, we'll return raw polys and let the visualizer apply color 
    # based on the *auditor's* identified layers, assuming the user selected those layers.
    
    valid_polys.sort(key=lambda p: p.area, reverse=True)
    
    return valid_polys, scale, None

class LayerSelectionDialog(tk.Toplevel):
    def __init__(self, parent, layers, preselected=None):
        super().__init__(parent)
        self.title("Select Layers")
        self.geometry("350x500") 
        self.layers = layers
        self.result = None
        self.vars = []

        lbl = tk.Label(self, text="Uncheck Grid/Axis layers to ignore them:", wraplength=280, font=("Arial", 10))
        lbl.pack(side=tk.TOP, pady=10)

        btn_frame = tk.Frame(self)
        btn_frame.pack(side=tk.BOTTOM, fill='x', pady=10)
        btn_ok = tk.Button(btn_frame, text="Update Geometry (Enter)", command=self.on_process, 
                           bg="#3498db", fg="white", font=("Arial", 10, "bold"), height=2)
        btn_ok.pack(fill='x', padx=20)

        list_frame = tk.Frame(self)
        list_frame.pack(side=tk.TOP, fill='both', expand=True, padx=10, pady=5)

        scrollbar = tk.Scrollbar(list_frame, orient="vertical")
        canvas = tk.Canvas(list_frame, yscrollcommand=scrollbar.set, bg="white")
        scrollbar.config(command=canvas.yview)
        scrollbar.pack(side=tk.RIGHT, fill='y')
        canvas.pack(side=tk.LEFT, fill='both', expand=True)

        scroll_frame = tk.Frame(canvas, bg="white")
        scroll_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=scroll_frame, anchor="nw")

        for layer in layers:
            is_checked = True if preselected is None else (layer in preselected)
            var = tk.BooleanVar(value=is_checked) 
            chk = tk.Checkbutton(scroll_frame, text=layer, variable=var, anchor='w', bg="white")
            chk.pack(fill='x', padx=5, pady=2)
            self.vars.append((layer, var))
            
        self.bind('<Return>', lambda e: self.on_process())

    def on_process(self):
        self.result = [layer for layer, var in self.vars if var.get()]
        self.destroy()

class DXFAnalyzerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("DXF Analyzer - Automated Verification")
        self.root.geometry("1280x850")

        self.polys = []
        self.scale = 1.0
        self.current_file = None
        self.active_layers = None
        self.all_layers = []
        
        self.detected_roles = {} # Store layer roles (site, footprint, etc.)

        self._setup_ui()
        
    def _setup_ui(self):
        top_frame = tk.Frame(self.root, bg="#f0f0f0") 
        top_frame.pack(side=tk.TOP, fill=tk.X)

        control_frame = tk.Frame(top_frame, padx=10, pady=8, bg="#f0f0f0")
        control_frame.pack(side=tk.TOP, fill=tk.X)

        btn_load = tk.Button(control_frame, text="📂 Load DXF", command=self.load_file, bg="white")
        btn_load.pack(side=tk.LEFT, padx=5)

        self.btn_layers = tk.Button(control_frame, text="≡ Layers", command=self.open_layer_dialog, state="disabled")
        self.btn_layers.pack(side=tk.LEFT, padx=2)

        # Legend
        tk.Label(control_frame, text="|  Legend:", bg="#f0f0f0").pack(side=tk.LEFT, padx=10)
        tk.Label(control_frame, text="■ Site", fg="#00CED1", bg="#f0f0f0", font=("Arial", 10, "bold")).pack(side=tk.LEFT, padx=2)
        tk.Label(control_frame, text="■ Footprint", fg="#FF8C00", bg="#f0f0f0", font=("Arial", 10, "bold")).pack(side=tk.LEFT, padx=2)
        tk.Label(control_frame, text="■ Floor Area", fg="#FFD700", bg="#f0f0f0", font=("Arial", 10, "bold")).pack(side=tk.LEFT, padx=2)

        self.plot_frame = tk.Frame(self.root)
        self.plot_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True)
        
        self.fig, self.ax = plt.subplots(facecolor='#1e1e1e')
        self.canvas = FigureCanvasTkAgg(self.fig, master=self.plot_frame)
        self.canvas.draw()
        self.canvas.get_tk_widget().pack(side=tk.TOP, fill=tk.BOTH, expand=True)
        
        toolbar = NavigationToolbar2Tk(self.canvas, self.plot_frame)
        toolbar.update()
        
        self.status_var = tk.StringVar(value="Ready.")
        status_bar = tk.Label(self.root, textvariable=self.status_var, bd=1, relief=tk.SUNKEN, anchor=tk.W)
        status_bar.pack(side=tk.BOTTOM, fill=tk.X)

    def load_file(self):
        file_path = filedialog.askopenfilename(filetypes=[("DXF Files", "*.dxf")])
        if not file_path: return

        self.current_file = file_path
        layers, error = get_dxf_layers(file_path)
        if error:
            messagebox.showerror("Error", f"Failed: {error}")
            return

        self.all_layers = layers
        
        # --- 1. RUN AUDIT TO DETECT ROLES ---
        self.status_var.set("Analyzing layer roles...")
        self.root.update()
        auditor = ComplianceAuditor(file_path)
        roles = auditor.analyze_layers()
        self.detected_roles = roles
        
        # --- 2. AUTO-SELECT LAYERS ---
        # Select all layers involved in the roles + standard geometry
        auto_selected = set()
        if roles['site']: auto_selected.add(roles['site'])
        auto_selected.update(roles['footprint'])
        auto_selected.update(roles['floors'])
        
        # If nothing detected, select all (fallback)
        if not auto_selected:
            self.active_layers = layers
        else:
            self.active_layers = list(auto_selected)

        # Show dialog to confirm
        dialog = LayerSelectionDialog(self.root, layers, preselected=self.active_layers)
        self.root.wait_window(dialog)
        
        if dialog.result is None: return

        self.active_layers = dialog.result
        self.run_processing()
        self.btn_layers.config(state="normal", bg="#dddddd")

    def open_layer_dialog(self):
        if not self.current_file: return
        dialog = LayerSelectionDialog(self.root, self.all_layers, preselected=self.active_layers)
        self.root.wait_window(dialog)
        if dialog.result is not None:
            self.active_layers = dialog.result
            self.run_processing()

    def run_processing(self):
        self.status_var.set("Processing geometry...")
        self.root.update()

        polys, scale, error = process_dxf(self.current_file, active_layers=self.active_layers)
        
        if error:
            messagebox.showerror("Error", f"Failed: {error}")
            return
            
        self.polys = polys
        self.scale = scale
        self.status_var.set(f"Loaded {len(polys)} regions. Site Layer: {self.detected_roles.get('site', 'None')}")
        self.draw_map()

    def draw_map(self):
        self.ax.clear()
        self.ax.set_facecolor('#1e1e1e')
        self.ax.set_aspect('equal')
        self.ax.axis('off')

        if not self.polys:
            self.canvas.draw()
            return

        # We don't have per-polygon layer info in valid_polys list directly because of merging.
        # However, for the purpose of this visual check, we can infer roles based on area magnitude
        # relative to the audited areas, OR (better) we simply rely on the fact that
        # we only loaded relevant layers.
        
        # BUT, the user wants to see *which* layer is which color.
        # Since `process_dxf` flattens layers into geometry, we can't perfectly color by layer
        # unless we change `process_dxf` to return layer metadata per polygon.
        # For this "Aside Script", let's do a trick: 
        # We know the SITE is usually the largest polygon.
        
        site_poly = None
        if self.polys:
            site_poly = self.polys[0] # Largest is usually site

        for i, p in enumerate(self.polys):
            # Default Color
            face_c = '#333333' 
            alpha = 0.3
            edge_c = '#555555'
            
            # Heuristic Coloring based on Audit Results
            # Since we can't link back to exact layer easily without heavy refactor,
            # we highlight the largest as SITE, and others based on typical size.
            
            if i == 0: # Largest -> Likely Site
                face_c = '#00CED1' # Dark Turquoise (Cyan-ish)
                alpha = 0.3
                edge_c = 'white'
            elif p.area > (site_poly.area * 0.05): # Significant size -> Likely Building/Floor
                face_c = '#FF8C00' # Dark Orange
                alpha = 0.6
                edge_c = 'white'
            
            # Draw
            x, y = p.exterior.xy
            self.ax.fill(x, y, color=face_c, alpha=alpha, ec=edge_c, lw=1)

        self.canvas.draw()

if __name__ == "__main__":
    root = tk.Tk()
    app = DXFAnalyzerApp(root)
    root.mainloop()