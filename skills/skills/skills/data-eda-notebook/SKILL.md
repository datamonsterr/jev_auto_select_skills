---
name: data-eda-notebook
description: Automates exploratory data analysis (EDA) and generates reproducible Jupyter notebooks (.ipynb) combining geospatial trajectory data (OSRM, GPS breadcrumbs, DAVI, SSD) and customer dispute text. Use when exploring ride-hailing datasets, creating EDA notebooks, evaluating data formats against MVP schemas, or profiling spatial-temporal and customer report data.
---

# Data EDA Notebook Skill

Streamline exploratory data analysis and generate high-density, interactive Jupyter notebooks for ride-hailing anomaly detection.

## Quick Start

Generate a new EDA notebook combining GPS trajectory profiling and text dispute analysis:

```python
from data_eda_notebook.generator import create_eda_notebook

create_eda_notebook(
    dataset_path="data/samples/sample_telemetry.parquet",
    output_notebook="notebooks/eda_sample_telemetry.ipynb",
    modality="multimodal" # "spatial", "text", or "multimodal"
)
```

## Core Workflows

### 1. Spatial Telemetry & Trajectory Profiling
- **Coordinate Validation**: Ensure coordinates lie within target bounds (e.g. Hanoi: `lat: 20.8-21.3`, `lon: 105.6-106.0`).
- **Kinematic Feature Extraction**: Compute delta distance ($\Delta d$), delta time ($\Delta t$), instantaneous speed, and bearing.
- **DIC Anomaly Detection**:
  - **Stationary Stall Duration ($SSD$)**: Consecutive pings with speed $\approx 0$ or distance $< 5\text{m}$.
  - **Direction Anomaly Vector Index ($DAVI$)**: Cosine similarity between velocity vector and vector toward passenger pickup point ($DAVI \le 0$ indicates moving away).
- **Interactive Mapping**: Render Folium / Leaflet maps comparing planned OSRM routes with actual breadcrumbs.

### 2. Customer Dispute & Cancellation Text Profiling
- **Field Inspection**: Analyze `cancellation_reason`, `passenger_comment`, `driver_excuse`.
- **Text Distributions**: Frequency of cancellation codes, text length, wordclouds, and sentiment distributions.
- **Vietnamese Text Processing**: Tokenization (`pyvi`/`underthesea`), keyword extraction for stalling ("đứng yên", "không chạy", "ép hủy", "bảo hủy").

### 3. Schema & Missingness Gap Matrix
Compare dataset columns against `docs/ba/MVP.md` & `ADR-0002` schema:
- Mark fields as: `[MATCH]` Exact match, `[DERIVABLE]` Can be calculated from raw fields, `[MISSING]` Requires synthetic augmentation or schema migration.

## Reference & Advanced Usage

See [REFERENCE.md](REFERENCE.md) for code snippets, metric mathematical definitions, and notebook generation templates.
