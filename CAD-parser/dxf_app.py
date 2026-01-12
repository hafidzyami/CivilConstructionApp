import tkinter as tk
from tkinter import filedialog, messagebox
import ezdxf
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg, NavigationToolbar2Tk
from matplotlib.patches import Rectangle
from shapely.geometry import LineString, Point, MultiLineString, Polygon, box
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
    for entity in msp.query('LINE LWPOLYLINE'):
        if active_layers is not None and entity.dxf.layer not in active_layers:
            continue
            
        if entity.dxftype() == 'LINE':
            lines.append(LineString([(entity.dxf.start.x, entity.dxf.start.y), (entity.dxf.end.x, entity.dxf.end.y)]))
        elif entity.dxftype() == 'LWPOLYLINE':
            points = list(entity.get_points(format='xy'))
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
    
    return valid_polys, scale, None

# --- IMPROVED LAYER DIALOG ---
class LayerSelectionDialog(tk.Toplevel):
    def __init__(self, parent, layers, preselected=None):
        super().__init__(parent)
        self.title("Select Layers")
        self.geometry("350x500") 
        self.layers = layers
        self.result = None
        self.vars = []

        # 1. Top Label
        lbl = tk.Label(self, text="Uncheck Grid/Axis layers to ignore them:", wraplength=280, font=("Arial", 10))
        lbl.pack(side=tk.TOP, pady=10)

        # 2. Bottom Button (Packed FIRST to ensure visibility)
        btn_frame = tk.Frame(self)
        btn_frame.pack(side=tk.BOTTOM, fill='x', pady=10)
        
        btn_ok = tk.Button(btn_frame, text="Update Geometry (Enter)", command=self.on_process, 
                           bg="#3498db", fg="white", font=("Arial", 10, "bold"), height=2)
        btn_ok.pack(fill='x', padx=20)

        # 3. Middle List Area (Takes remaining space)
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
        self.root.title("DXF Analyzer - Classic Colors")
        self.root.geometry("1280x850")

        self.polys = []
        self.scale = 1.0
        self.current_file = None
        self.active_layers = None
        self.all_layers = []
        
        self.selections = {} 
        self.current_mode = tk.StringVar(value="building") 
        
        self.is_footprint_var = tk.BooleanVar(value=True)
        self.floor_count_var = tk.IntVar(value=1)

        self.is_dragging = False
        self.start_point = None 
        self.selector_rect = None 

        self._setup_ui()
        
    def _setup_ui(self):
        # Revert header colors to standard grey/white theme if desired, 
        # but the layout is what matters. Kept clean grey.
        top_frame = tk.Frame(self.root, bg="#f0f0f0") 
        top_frame.pack(side=tk.TOP, fill=tk.X)

        control_frame = tk.Frame(top_frame, padx=10, pady=8, bg="#f0f0f0")
        control_frame.pack(side=tk.TOP, fill=tk.X)

        btn_load = tk.Button(control_frame, text="📂 Load DXF", command=self.load_file, bg="white")
        btn_load.pack(side=tk.LEFT, padx=5)

        self.btn_layers = tk.Button(control_frame, text="≡ Layers", command=self.open_layer_dialog, state="disabled")
        self.btn_layers.pack(side=tk.LEFT, padx=2)

        tk.Label(control_frame, text="| Mode:", bg="#f0f0f0").pack(side=tk.LEFT, padx=5)
        
        rb_site = tk.Radiobutton(control_frame, text="Site (Cyan)", variable=self.current_mode, value="site", bg="#f0f0f0")
        rb_site.pack(side=tk.LEFT)
        
        rb_build = tk.Radiobutton(control_frame, text="Building (Orange)", variable=self.current_mode, value="building", bg="#f0f0f0")
        rb_build.pack(side=tk.LEFT)

        tk.Label(control_frame, text="| Params:", bg="#f0f0f0").pack(side=tk.LEFT, padx=10)
        
        chk_footprint = tk.Checkbutton(control_frame, text="Is Footprint?", variable=self.is_footprint_var, bg="#f0f0f0")
        chk_footprint.pack(side=tk.LEFT, padx=5)

        tk.Label(control_frame, text="Floors:", bg="#f0f0f0").pack(side=tk.LEFT)
        spin_floors = tk.Spinbox(control_frame, from_=1, to=100, textvariable=self.floor_count_var, width=3)
        spin_floors.pack(side=tk.LEFT, padx=2)

        btn_clear = tk.Button(control_frame, text="Reset", command=self.clear_selection)
        btn_clear.pack(side=tk.RIGHT, padx=5)

        self.result_var = tk.StringVar(value="Site: 0.00 | Footprint: 0.00 | Total Floor: 0.00 | BCR: 0.00% | FAR: 0.00")
        result_label = tk.Label(top_frame, textvariable=self.result_var, 
                              bg="#222", fg="#0f0", font=("Consolas", 11, "bold"), pady=8)
        result_label.pack(side=tk.TOP, fill=tk.X)

        self.plot_frame = tk.Frame(self.root)
        self.plot_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True)
        
        self.fig, self.ax = plt.subplots(facecolor='#1e1e1e')
        self.canvas = FigureCanvasTkAgg(self.fig, master=self.plot_frame)
        self.canvas.draw()
        self.canvas.get_tk_widget().pack(side=tk.TOP, fill=tk.BOTH, expand=True)
        
        toolbar = NavigationToolbar2Tk(self.canvas, self.plot_frame)
        toolbar.update()
        
        self.canvas.mpl_connect('button_press_event', self.on_mouse_press)
        self.canvas.mpl_connect('motion_notify_event', self.on_mouse_move)
        self.canvas.mpl_connect('button_release_event', self.on_mouse_release)

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
        dialog = LayerSelectionDialog(self.root, layers)
        self.root.wait_window(dialog)
        
        if dialog.result is None:
            self.status_var.set("Load cancelled.")
            return

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
        self.selections = {i: {'site': False, 'building': False, 'is_footprint': True, 'floors': 1} 
                         for i in range(len(polys))}
        
        self.status_var.set(f"Loaded {len(polys)} regions.")
        self.draw_map()
        self.update_metrics()

    def draw_map(self):
        self.ax.clear()
        self.ax.set_facecolor('#1e1e1e') # Classic Dark Grey Background
        self.ax.set_aspect('equal')
        self.ax.axis('off')

        if not self.polys:
            self.canvas.draw()
            return

        for i, p in enumerate(self.polys):
            data = self.selections.get(i)
            is_site = data['site']
            is_bldg = data['building']
            
            # --- CLASSIC COLOR SCHEME RESTORED ---
            if is_site and is_bldg:
                face_c = '#9932CC' # Purple
                alpha = 0.7
                edge_c = 'white'
                lw = 2
            elif is_site:
                face_c = 'cyan'
                alpha = 0.4
                edge_c = 'white'
                lw = 1
            elif is_bldg:
                if data['is_footprint']:
                    face_c = 'orange'
                    alpha = 0.6
                else:
                    face_c = '#FFD700' # Gold
                    alpha = 0.5
                edge_c = 'white'
                lw = 1
            else:
                face_c = '#333333' # Dark Grey
                alpha = 0.3
                edge_c = '#555555' # Lighter Grey Outline
                lw = 1

            x, y = p.exterior.xy
            self.ax.fill(x, y, color=face_c, alpha=alpha, ec=edge_c, lw=lw)

        self.canvas.draw()

    def on_mouse_press(self, event):
        if not self.polys or event.inaxes != self.ax: return
        if event.button == 1:
            self.is_dragging = True
            self.start_point = (event.xdata, event.ydata)
            self.selector_rect = Rectangle((event.xdata, event.ydata), 0, 0, 
                                           fill=True, color='white', alpha=0.2, ec='white', ls='--')
            self.ax.add_patch(self.selector_rect)
            self.canvas.draw()

    def on_mouse_move(self, event):
        if event.inaxes == self.ax and self.polys:
            point = Point(event.xdata, event.ydata)
            hovered_idx = -1
            for i in reversed(range(len(self.polys))):
                if self.polys[i].contains(point):
                    hovered_idx = i
                    break
            
            if hovered_idx != -1:
                data = self.selections[hovered_idx]
                info = f"Area {hovered_idx} ({self.polys[hovered_idx].area * self.scale**2:.2f}m²)"
                if data['site']: info += " [SITE]"
                if data['building']:
                    type_str = "Footprint" if data['is_footprint'] else "Upper Floor"
                    info += f" [BLDG: {type_str}, {data['floors']}x]"
                self.status_var.set(info)
            else:
                self.status_var.set("Ready.")

        if not self.is_dragging or event.inaxes != self.ax: return
        width = event.xdata - self.start_point[0]
        height = event.ydata - self.start_point[1]
        self.selector_rect.set_width(width)
        self.selector_rect.set_height(height)
        self.canvas.draw()

    def on_mouse_release(self, event):
        if not self.is_dragging or event.button != 1: return
        self.is_dragging = False
        if self.selector_rect:
            self.selector_rect.remove()
            self.selector_rect = None
        
        if event.inaxes != self.ax: 
            self.draw_map()
            return

        end_point = (event.xdata, event.ydata)
        dx = end_point[0] - self.start_point[0]
        dy = end_point[1] - self.start_point[1]
        
        mode = self.current_mode.get()

        if abs(dx) < 0.001 and abs(dy) < 0.001:
            self.handle_single_click(Point(end_point[0], end_point[1]), mode)
        else:
            self.handle_box_selection(self.start_point[0], self.start_point[1], end_point[0], end_point[1], mode)
            
        self.draw_map()
        self.update_metrics()

    def handle_single_click(self, point, mode):
        for i in reversed(range(len(self.polys))):
            if self.polys[i].contains(point):
                if not self.selections[i][mode]:
                    self.selections[i][mode] = True
                    if mode == 'building':
                        self.selections[i]['is_footprint'] = self.is_footprint_var.get()
                        self.selections[i]['floors'] = self.floor_count_var.get()
                    if mode == 'site':
                        self.apply_site_containment(i)
                else:
                    self.selections[i][mode] = False
                return

    def handle_box_selection(self, x1, y1, x2, y2, mode):
        selection_box = box(min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))
        for i, p in enumerate(self.polys):
            if selection_box.intersects(p):
                self.selections[i][mode] = True
                if mode == 'building':
                    self.selections[i]['is_footprint'] = self.is_footprint_var.get()
                    self.selections[i]['floors'] = self.floor_count_var.get()
                if mode == 'site':
                    self.apply_site_containment(i)

    def apply_site_containment(self, parent_index):
        parent_envelope = Polygon(self.polys[parent_index].exterior)
        for j, other_poly in enumerate(self.polys):
            if parent_index == j: continue
            if parent_envelope.covers(other_poly):
                self.selections[j]['site'] = True

    def clear_selection(self):
        for k in self.selections:
            self.selections[k] = {'site': False, 'building': False, 'is_footprint': True, 'floors': 1}
        self.draw_map()
        self.update_metrics()

    def update_metrics(self):
        if not self.polys: return
        site_area = 0.0
        footprint_area = 0.0
        total_floor_area = 0.0
        
        for i, data in self.selections.items():
            raw_area = self.polys[i].area * (self.scale ** 2)
            if data['site']: site_area += raw_area
            if data['building']:
                if data['is_footprint']: footprint_area += raw_area
                total_floor_area += raw_area * data['floors']
        
        if site_area == 0:
            bcr_str = "0.00%"
            far_str = "0.00"
        else:
            bcr = (footprint_area / site_area) * 100
            far = (total_floor_area / site_area)
            bcr_str = f"{bcr:.2f}%"
            far_str = f"{far:.2f}"

        self.result_var.set(
            f"Site: {site_area:.1f}m² | Footprint: {footprint_area:.1f}m² | "
            f"Total Floor: {total_floor_area:.1f}m² | BCR: {bcr_str} | FAR: {far_str}"
        )

if __name__ == "__main__":
    root = tk.Tk()
    app = DXFAnalyzerApp(root)
    root.mainloop()