import streamlit as st
import osmnx as ox
import folium
from folium import Marker, Icon
from shapely.geometry import mapping
import pandas as pd
from streamlit_folium import st_folium
from streamlit_js_eval import get_geolocation
from typing import Dict, Union, List
import math

# --- CONFIGURATION ---
st.set_page_config(layout="wide", page_title="OSM Infrastructure Explorer")

DEFAULT_LAT = -6.358137
DEFAULT_LON = 106.835432
DEFAULT_DIST = 300

def clean_popup_html(row):
    """
    Generates a clean HTML table for the popup, showing all available non-null data.
    """
    html = "<div style='font-family: sans-serif; font-size: 12px; max-height: 250px; overflow-y: auto;'>"
    html += "<table style='width:100%; border-collapse: collapse;'>"
    
    # Priority fields to display at top
    priority = [
        'name', 'building', 'highway', 'railway', 'waterway', 'natural',
        'addr:street', 'addr:housenumber', 'building:levels', 
        'ref', 'maxspeed', 'service', 'bridge', 'tunnel'
    ]
    
    # Metadata fields to ignore
    ignore = {'geometry', 'nodes', 'ways', 'relation', 'source', 'created_by', 'element_start_id', 'osmid', 'unique_id', 'z_index'}
    
    rows_added = 0
    
    def add_row(key, val):
        nice_key = key.replace('addr:', '').replace('building:', '').replace('_', ' ').title()
        return f"""
            <tr style='border-bottom: 1px solid #eee;'>
                <td style='font-weight:bold; color:#555; padding:4px; width: 35%; vertical-align: top;'>{nice_key}</td>
                <td style='padding:4px; vertical-align: top;'>{val}</td>
            </tr>
        """

    # 1. Add Priority Rows
    for col in priority:
        if col in row.index:
            val = row[col]
            if pd.notna(val) and str(val).strip() != "" and str(val).lower() != 'nan':
                html += add_row(col, val)
                rows_added += 1
            
    # 2. Add Rest of Rows
    for col in row.index:
        if col not in priority and col not in ignore:
            val = row[col]
            if pd.notna(val) and str(val).strip() != "" and str(val).lower() != 'nan':
                html += add_row(col, val)
                rows_added += 1

    html += "</table></div>"
    
    if rows_added == 0:
        return "<b>No detailed attributes available</b>"
        
    return html

def get_feature_style(row):
    """
    Returns style dict based on feature tags.
    """
    def get_val(key):
        return row[key] if key in row.index and pd.notna(row[key]) else None

    # 1. Water (Rivers, Lakes)
    if get_val('waterway') or get_val('natural') == 'water':
        return {'fillColor': '#3388FF', 'color': '#3388FF', 'weight': 2, 'fillOpacity': 0.6}
    
    # 2. Railways (Dashed Black Lines)
    if get_val('railway'):
        return {'color': '#333333', 'weight': 3, 'opacity': 0.8, 'dashArray': '5, 10'}

    # 3. Highways / Roads (Orange Lines)
    highway = get_val('highway')
    if highway:
        # Differentiate slightly between major vs minor if needed, but keeping it simple for now
        if highway in ['motorway', 'trunk', 'primary', 'secondary']:
            return {'color': '#F57F17', 'weight': 4, 'opacity': 0.8} # Major roads thicker
        return {'color': '#F57F17', 'weight': 2, 'opacity': 0.8}     # Minor roads thinner
    
    # 4. Buildings (Grey)
    if get_val('building'):
        return {'fillColor': '#A0A0A0', 'color': '#505050', 'weight': 1, 'fillOpacity': 0.5}
        
    # Default Fallback
    return {'fillColor': '#FFD700', 'color': '#FF6F00', 'weight': 2, 'fillOpacity': 0.6}

def main():
    st.title("🗺️ OSM Infrastructure Explorer")

    # --- 1. GEOLOCATION HANDLING ---
    if 'lat' not in st.session_state:
        st.session_state['lat'] = DEFAULT_LAT
        st.session_state['lon'] = DEFAULT_LON
        st.session_state['location_initialized'] = False

    if not st.session_state['location_initialized']:
        loc = get_geolocation()
        if loc:
            st.session_state['lat'] = loc['coords']['latitude']
            st.session_state['lon'] = loc['coords']['longitude']
            st.session_state['location_initialized'] = True
            st.success("📍 Location detected! Updating map...")
            st.rerun()

    # --- 2. CONTROLS ---
    col1, col2 = st.columns([3, 1])
    with col1:
        search_query = st.text_input("Search Location", placeholder="e.g., -6.358, 106.835", key="search_box")
    with col2:
        dist = st.slider("Radius (m)", 50, 1000, DEFAULT_DIST, 50)
    
    # --- ADAPTIVE ZOOM CALCULATION ---
    # Heuristic: 50m -> Zoom 19, 100m -> 18, 200m -> 17, etc.
    # Uses log2 to scale zoom linearly with the doubling of distance
    zoom_level = 19 - int(math.log2(dist / 50))

    if search_query:
        try:
            new_lat, new_lon = None, None
            if "," in search_query and any(c.isdigit() for c in search_query):
                parts = search_query.split(",")
                new_lat = float(parts[0].strip())
                new_lon = float(parts[1].strip())
            else:
                new_lat, new_lon = ox.geocode(search_query)
            
            if new_lat != st.session_state['lat'] or new_lon != st.session_state['lon']:
                st.session_state['lat'] = new_lat
                st.session_state['lon'] = new_lon
                st.rerun()
        except Exception as e:
            st.error(f"Location not found: {e}")

    curr_lat = st.session_state['lat']
    curr_lon = st.session_state['lon']

    # --- 3. DATA FETCHING ---
    # Explicitly typed dictionary to fix Pylance error
    # We only include infrastructure tags as requested
    tags: Dict[str, Union[str, bool, List[str]]] = {
        'building': True,
        'waterway': True,
        'natural': 'water', # Covers lakes/ponds
        'highway': True,    # Covers all roads
        'railway': True     # Covers trains/subways
    }

    with st.spinner(f"Fetching infrastructure around {curr_lat:.5f}, {curr_lon:.5f}..."):
        try:
            gdf = ox.features_from_point((curr_lat, curr_lon), tags=tags, dist=dist)
        except Exception:
            gdf = None

    # --- 4. MAP GENERATION ---
    # Use the dynamic zoom_level here instead of session_state zoom
    m = folium.Map(location=[curr_lat, curr_lon], zoom_start=zoom_level, tiles='CartoDB positron')

    if gdf is not None and not gdf.empty:
        # Sorting: Water (Bottom) -> Roads/Rails -> Buildings (Top)
        def get_z_index(row):
            def is_tag(k): return k in row and pd.notna(row[k])
            
            if is_tag('waterway') or (is_tag('natural') and row['natural']=='water'): return 0
            if is_tag('highway') or is_tag('railway'): return 1
            if is_tag('building'): return 2
            return 3

        gdf['z_index'] = gdf.apply(get_z_index, axis=1)
        gdf_sorted = gdf.sort_values('z_index')

        for idx, row in gdf_sorted.iterrows():
            popup_html = clean_popup_html(row)
            style = get_feature_style(row)
            
            feature_dict = {
                "type": "Feature",
                "geometry": mapping(row.geometry),
                "properties": {"id": idx}
            }
            
            g_layer = folium.GeoJson(
                feature_dict,
                name="Feature",
                style_function=lambda x, s=style: s,
                highlight_function=lambda x: {
                    'fillColor': '#00BFFF', 
                    'color': '#00BFFF', 
                    'weight': 3, 
                    'fillOpacity': 0.8
                },
                tooltip=None
            )
            g_layer.add_child(folium.Popup(popup_html, max_width=300))
            g_layer.add_to(m)

    # Center Marker
    Marker([curr_lat, curr_lon], icon=Icon(color="red", icon="search"), tooltip="Center Point").add_to(m)

    st_folium(m, height=700, use_container_width=True)

if __name__ == "__main__":
    main()