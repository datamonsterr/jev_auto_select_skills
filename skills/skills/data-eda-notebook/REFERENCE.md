# Data EDA Notebook Reference Guide

This reference documents the mathematical formulas, visualization patterns, and automated notebook generation structures for P-063 GreenSM fraud adjudication datasets.

---

## 1. Kinematic & Anomaly Metric Formulations

### Haversine Distance
$$d = 2r \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
where $r = 6371000\text{ m}$.

### Direction Anomaly Vector Index (DAVI)
Given vehicle location $P_t$, previous location $P_{t-1}$, and pickup target location $P_{\text{pickup}}$:
$$\vec{v}_{\text{driver}} = P_t - P_{t-1}, \quad \vec{v}_{\text{target}} = P_{\text{pickup}} - P_{t-1}$$
$$\text{DAVI} = \cos(\theta) = \frac{\vec{v}_{\text{driver}} \cdot \vec{v}_{\text{target}}}{\|\vec{v}_{\text{driver}}\| \|\vec{v}_{\text{target}}\|}$$
- $\text{DAVI} > 0$: Moving generally towards passenger.
- $\text{DAVI} \le 0$: Moving perpendicular or away from passenger (potential reverse vector DIC).

### Stationary Stall Duration (SSD)
Total continuous seconds where vehicle displacement is below jitter threshold ($\epsilon < 5\text{m}$) while trip status is `ACCEPTED_EN_ROUTE`:
$$\text{SSD} = \sum_{i \in \text{stall\_window}} (t_{i} - t_{i-1})$$
A threshold of $\text{SSD} \ge 180\text{s}$ flags a P0/P1 stalling alert.

---

## 2. Interactive Map Rendering Template (Folium)

```python
import folium

def plot_trajectory_map(df_breadcrumbs, pickup_coord, osrm_coords=None):
    center = [pickup_coord["lat"], pickup_coord["lon"]]
    m = folium.Map(location=center, zoom_start=15, tiles="CartoDB positron")
    
    # Pickup marker
    folium.Marker(
        [pickup_coord["lat"], pickup_coord["lon"]],
        popup="<b>Pickup Point</b>",
        icon=folium.Icon(color="green", icon="user")
    ).add_to(m)
    
    # OSRM Optimal Route (Blue Dashed)
    if osrm_coords:
        folium.PolyLine(
            osrm_coords,
            color="#2563EB",
            weight=4,
            dash_array="6, 8",
            tooltip="OSRM Planned Route"
        ).add_to(m)
        
    # Actual GPS Breadcrumbs (Orange Line + Points)
    actual_coords = df_breadcrumbs[["lat", "lon"]].values.tolist()
    folium.PolyLine(
        actual_coords,
        color="#F97316",
        weight=4,
        tooltip="Actual Trajectory"
    ).add_to(m)
    
    # Highlight Stalls (Red Circles)
    stalls = df_breadcrumbs[df_breadcrumbs["is_stalled"] == True]
    for _, row in stalls.iterrows():
        folium.CircleMarker(
            [row["lat"], row["lon"]],
            radius=7,
            color="#DC2626",
            fill=True,
            fill_color="#EF4444",
            popup=f"Stall: {row.get('stall_seconds', 0)}s"
        ).add_to(m)
        
    return m
```

---

## 3. Vietnamese Text Profiling Snippet

```python
import pandas as pd
from collections import Counter
import re

# Keywords indicative of Driver-Initiated Cancellation (DIC)
DIC_KEYWORDS = [
    r"không (chạy|đi|nhúc nhích|di chuyển)",
    r"(đứng|dừng) yên",
    r"(bảo|kêu|nhắn|gọi) hủy",
    r"kẹt xe",
    r"không liên lạc được",
    r"đi ngược đường"
]

def profile_text_feedback(df, text_col="customer_comment"):
    stats = {}
    stats["total_records"] = len(df)
    stats["missing_rate"] = df[text_col].isna().mean()
    
    clean_text = df[text_col].dropna().astype(str).str.lower()
    stats["avg_char_length"] = clean_text.str.len().mean()
    
    keyword_hits = {}
    for kw in DIC_KEYWORDS:
        hits = clean_text.str.contains(kw, regex=True).sum()
        keyword_hits[kw] = hits
    stats["keyword_distribution"] = keyword_hits
    return stats
```

---

## 4. Standard Schema Gap Matrix

When profiling datasets for `MVP.md`, fill the following evaluation matrix:

| Field Name | Expected Type | Required For | Presence | Missingness % | Imputation / Derivation Strategy |
|---|---|---|---|---|---|
| `trip_id` | `str` / `UUID` | Session Key | Available | 0% | - |
| `driver_id` | `str` / `UUID` | Profile History | Available | 0% | - |
| `timestamp` | `datetime` (ISO-8601) | Chrono Ordering | Available | 0% | Check monotonic ordering |
| `latitude`, `longitude` | `float` | GIS Rendering | Available | < 0.1% | Linear interpolation for single ping drop |
| `speed_kmh` | `float` | Kinematics | Optional | - | Derive from Haversine distance / $\Delta t$ |
| `bearing_deg` | `float` (0-360) | Orientation | Optional | - | Compute from forward azimuth formula |
| `davi` | `float` (-1.0 to 1.0) | DIC Detection | Computed | - | Vector dot product with pickup location |
| `ssd_seconds` | `int` | Stall Alert | Computed | - | Cumulative duration of near-zero speed |
| `customer_comment` | `str` | Text Forensic | Varies | 40-70% | LLM synthesis / synthetic generation |
| `app_crash_flag` | `bool` | Error Guardrail | Rare | - | Synthesize from simulated network outages |
