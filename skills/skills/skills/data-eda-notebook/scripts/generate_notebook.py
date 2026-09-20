#!/usr/bin/env python3
"""
Generate a standardized EDA Jupyter notebook for ride-hailing datasets
combining GPS spatial telemetry and customer dispute text.
"""

import json
import sys
from pathlib import Path


def create_notebook(title: str, dataset_path: str, output_path: str):
    nb = {
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    f"# EDA Report: {title}\n",
                    "## Ride-Hailing Spatial Telemetry & Dispute Analysis\n",
                    f"**Source Dataset:** `{dataset_path}`  \n",
                    "**Project:** P-063 (GreenSM Fraud Analyst Adjudication Cockpit)\n",
                    "\n",
                    "---"
                ]
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "# 1. Environment & Library Setup\n",
                    "import pandas as pd\n",
                    "import numpy as np\n",
                    "import folium\n",
                    "from datetime import datetime\n",
                    "\n",
                    "# Load Dataset\n",
                    f"df = pd.read_parquet('{dataset_path}') if '{dataset_path}'.endswith('.parquet') else pd.read_csv('{dataset_path}')\n",
                    "print(f'Loaded dataset with {len(df)} rows and {len(df.columns)} columns.')\n",
                    "df.head()"
                ]
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "## 2. Schema Inspection & Missingness\n",
                    "Check data types, missing value percentages, and schema compatibility with `MVP.md`."
                ]
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "missing_summary = pd.DataFrame({\n",
                    "    'Dtype': df.dtypes,\n",
                    "    'Missing_Count': df.isna().sum(),\n",
                    "    'Missing_Rate_%': (df.isna().mean() * 100).round(2)\n",
                    "})\n",
                    "missing_summary"
                ]
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "## 3. Spatial Trajectory & Anomaly Profiling\n",
                    "Calculate stationary stall duration (SSD) and direction anomaly vector index (DAVI)."
                ]
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "# Sample trajectory rendering\n",
                    "if {'latitude', 'longitude'}.issubset(df.columns) or {'lat', 'lon'}.issubset(df.columns):\n",
                    "    lat_col = 'latitude' if 'latitude' in df.columns else 'lat'\n",
                    "    lon_col = 'longitude' if 'longitude' in df.columns else 'lon'\n",
                    "    center = [df[lat_col].median(), df[lon_col].median()]\n",
                    "    m = folium.Map(location=center, zoom_start=14, tiles='CartoDB positron')\n",
                    "    coords = df[[lat_col, lon_col]].dropna().values.tolist()[:100]\n",
                    "    folium.PolyLine(coords, color='#F97316', weight=4, tooltip='Vehicle Path').add_to(m)\n",
                    "    m\n",
                    "else:\n",
                    "    print('Spatial coordinates not detected in columns.')"
                ]
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "## 4. Customer Dispute & Cancellation Text Analysis"
                ]
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "text_cols = [c for c in df.columns if any(k in c.lower() for k in ['comment', 'reason', 'text', 'dispute', 'excuse'])]\n",
                    "print(f'Text candidate columns: {text_cols}')\n",
                    "if text_cols:\n",
                    "    for col in text_cols:\n",
                    "        print(f'\\nTop values for {col}:')\n",
                    "        print(df[col].value_counts().head(10))"
                ]
            }
        ],
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3"
            },
            "language_info": {
                "codemirror_mode": {"name": "ipython", "version": 3},
                "file_extension": ".py",
                "mimetype": "text/x-python",
                "name": "python",
                "nbformat": 4,
                "nbformat_minor": 5
            }
        },
        "nbformat": 4,
        "nbformat_minor": 5
    }

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(nb, indent=2), encoding="utf-8")
    print(f"Generated EDA notebook at: {output_path}")


if __name__ == "__main__":
    title = sys.argv[1] if len(sys.argv) > 1 else "Ride Hailing Telemetry"
    data = sys.argv[2] if len(sys.argv) > 2 else "data/sample.parquet"
    out = sys.argv[3] if len(sys.argv) > 3 else "notebooks/eda_sample.ipynb"
    create_notebook(title, data, out)
