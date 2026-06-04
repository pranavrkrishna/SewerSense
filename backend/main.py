import asyncio
import json
import threading
import os
import shutil
import tempfile
import time
import random
from typing import List, Dict, Any
import geopandas as gpd
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from config import DEFAULT_COM_PORT, DEFAULT_BAUD_RATE
from worker import SerialWorker
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="PipeShield API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persistent Data Storage Setup
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "layers")
os.makedirs(DATA_DIR, exist_ok=True)

# Global state
latest_distance = 0.0
connected_websockets = set()
serial_worker = None
loop = None

# Metadata model for updates
class SymbologyUpdate(BaseModel):
    symbologyField: str
    symbologyMap: Dict[str, str]

class LabelUpdate(BaseModel):
    labelField: str


class RiskParameter(BaseModel):
    name: str
    weight: float
    layerId: str
    column: str

class RiskCalculationRequest(BaseModel):
    baseLayerId: str
    parameters: List[RiskParameter]


def handle_new_distance(distance: float):
    global latest_distance, loop
    latest_distance = distance
    if loop and loop.is_running():
        asyncio.run_coroutine_threadsafe(broadcast_event({"type": "distance_update", "value": distance}), loop)

async def broadcast_event(event_data: dict):
    if not connected_websockets:
        return
    message = json.dumps(event_data)
    disconnected = set()
    for ws in connected_websockets:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.add(ws)
    for ws in disconnected:
        connected_websockets.remove(ws)

@app.on_event("startup")
async def startup_event():
    global serial_worker, loop
    loop = asyncio.get_running_loop()
    logger.info("Starting Serial Worker...")
    serial_worker = SerialWorker(
        port=DEFAULT_COM_PORT,
        baudrate=DEFAULT_BAUD_RATE,
        data_callback=handle_new_distance
    )
    serial_worker.start()

@app.on_event("shutdown")
async def shutdown_event():
    global serial_worker
    if serial_worker:
        logger.info("Stopping Serial Worker...")
        serial_worker.stop()

@app.websocket("/ws/sensor")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.add(websocket)
    try:
        await websocket.send_text(json.dumps({"type": "distance_update", "value": latest_distance}))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_websockets.remove(websocket)

# --- LAYER MANAGEMENT ENDPOINTS ---

@app.get("/layers")
async def get_layers():
    layers = []
    for filename in os.listdir(DATA_DIR):
        if filename.endswith(".json"):
            try:
                with open(os.path.join(DATA_DIR, filename), "r") as f:
                    layer_data = json.load(f)
                    layers.append(layer_data)
            except Exception as e:
                logger.error(f"Failed to read layer {filename}: {e}")
    return layers

@app.post("/upload/shapefile")
async def upload_shapefile(
    files: List[UploadFile] = File(...),
    epsg_override: str = Form(None)
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    
    shp_file = next((f for f in files if f.filename.endswith(".shp")), None)
    if not shp_file:
        raise HTTPException(status_code=400, detail="A .shp file is required")
        
    with tempfile.TemporaryDirectory() as tmpdir:
        shp_path = None
        for file in files:
            file_path = os.path.join(tmpdir, file.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            if file.filename.endswith(".shp"):
                shp_path = file_path
                
        try:
            gdf = gpd.read_file(shp_path)
            
            if epsg_override:
                try:
                    override_code = int(epsg_override.upper().replace("EPSG:", "").strip())
                    gdf.set_crs(epsg=override_code, allow_override=True, inplace=True)
                except Exception as e:
                    logger.error(f"Failed to apply EPSG override: {e}")
            
            if gdf.crs is not None:
                try:
                    gdf = gdf.to_crs("EPSG:4326")
                except Exception as proj_e:
                    logger.error(f"Reprojection failed: {proj_e}")
            else:
                gdf.set_crs(epsg=4326, inplace=True)
                
            geojson_data = json.loads(gdf.to_json())
            
            layer_id = f"layer-{int(time.time() * 1000)}"
            random_color = f"#{random.randint(0, 0xFFFFFF):06x}"
            
            layer_obj = {
                "id": layer_id,
                "name": shp_file.filename,
                "data": geojson_data,
                "bounds": gdf.total_bounds.tolist(),
                "visible": True,
                "color": random_color,
                "symbologyField": "",
                "symbologyMap": {},
                "labelField": ""
            }
            
            # Save to disk
            file_path = os.path.join(DATA_DIR, f"{layer_id}.json")
            with open(file_path, "w") as f:
                json.dump(layer_obj, f)
            
            # Broadcast to all clients
            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(broadcast_event({
                    "type": "new_layer",
                    "layer": layer_obj
                }), loop)
            
            return layer_obj
            
        except Exception as e:
            logger.error(f"Error parsing shapefile: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to process shapefile: {str(e)}")


@app.delete("/layers/{layer_id}")
async def delete_layer(layer_id: str):
    file_path = os.path.join(DATA_DIR, f"{layer_id}.json")
    if os.path.exists(file_path):
        os.remove(file_path)
        # Broadcast deletion
        if loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(broadcast_event({
                "type": "delete_layer",
                "id": layer_id
            }), loop)
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Layer not found")


@app.put("/layers/{layer_id}/symbology")
async def update_symbology(layer_id: str, update: SymbologyUpdate):
    file_path = os.path.join(DATA_DIR, f"{layer_id}.json")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Layer not found")
        
    with open(file_path, "r") as f:
        layer_data = json.load(f)
        
    layer_data["symbologyField"] = update.symbologyField
    layer_data["symbologyMap"] = update.symbologyMap
    
    with open(file_path, "w") as f:
        json.dump(layer_data, f)
        
    if loop and loop.is_running():
        asyncio.run_coroutine_threadsafe(broadcast_event({
            "type": "update_symbology",
            "id": layer_id,
            "symbologyField": update.symbologyField,
            "symbologyMap": update.symbologyMap
        }), loop)
        
    return {"status": "success"}

@app.put("/layers/{layer_id}/label")
async def update_label(layer_id: str, update: LabelUpdate):
    file_path = os.path.join(DATA_DIR, f"{layer_id}.json")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Layer not found")
        
    with open(file_path, "r") as f:
        layer_data = json.load(f)
        
    layer_data["labelField"] = update.labelField
    
    with open(file_path, "w") as f:
        json.dump(layer_data, f)
        
    if loop and loop.is_running():
        asyncio.run_coroutine_threadsafe(broadcast_event({
            "type": "update_label",
            "id": layer_id,
            "labelField": update.labelField
        }), loop)
        
    return {"status": "success"}


@app.post("/calculate-risk")
async def calculate_risk(req: RiskCalculationRequest):
    import pandas as pd
    
    # 1. Load Base Layer
    base_file = os.path.join(DATA_DIR, f"{req.baseLayerId}.json")
    if not os.path.exists(base_file):
        raise HTTPException(status_code=404, detail="Base layer not found")
        
    with open(base_file, "r") as f:
        base_data = json.load(f)
        
    try:
        # Convert GeoJSON dict back to string for geopandas
        base_gdf = gpd.read_file(json.dumps(base_data["data"]), driver='GeoJSON')
    except Exception as e:
        logger.error(f"Error parsing base layer: {e}")
        raise HTTPException(status_code=500, detail="Error loading base layer")
        
    base_gdf["Total_Risk_Score"] = 0.0
    
    # 2. Process each parameter
    for param in req.parameters:
        if param.layerId == "none" or param.column == "none":
            continue
            
        param_file = os.path.join(DATA_DIR, f"{param.layerId}.json")
        if not os.path.exists(param_file):
            continue
            
        try:
            with open(param_file, "r") as f:
                param_data = json.load(f)
            param_gdf = gpd.read_file(json.dumps(param_data["data"]), driver='GeoJSON')
            
            # Extract values
            values_series = None
            if param.layerId == req.baseLayerId:
                if param.column in base_gdf.columns:
                    values_series = pd.to_numeric(base_gdf[param.column], errors='coerce').fillna(0)
            else:
                # Spatial join
                # Left join base with param to find intersecting
                # If multiple intersect, take the max risk
                joined = gpd.sjoin(base_gdf, param_gdf, how="left", predicate="intersects")
                if param.column in joined.columns:
                    # grouped by original index
                    values_series = joined.groupby(joined.index)[param.column].apply(lambda x: pd.to_numeric(x, errors='coerce').fillna(0).max())
            
            if values_series is not None and not values_series.empty:
                # Engineering Criteria overrides
                if param.name == "d/D Ratio":
                    norm_values = (values_series / 0.75) * 5.0
                    norm_values = norm_values.clip(lower=0.0, upper=5.0)
                elif param.name == "Depth of Sewer":
                    norm_values = (values_series / 5.0) * 5.0
                    norm_values = norm_values.clip(lower=0.0, upper=5.0)
                elif param.name == "Flow Condition":
                    norm_values = (values_series / 10.0) * 5.0
                    norm_values = norm_values.clip(lower=0.0, upper=5.0)
                elif param.name == "Solid Deposition/Vel.":
                    norm_values = 5.0 * (0.6 - values_series) / 0.6
                    norm_values = norm_values.clip(lower=0.0, upper=5.0)
                else:
                    # Smart Auto-Scaling [0, 5] (Fallback for other params)
                    min_val = values_series.min()
                    max_val = values_series.max()
                    
                    if max_val > min_val:
                        norm_values = 5.0 * (values_series - min_val) / (max_val - min_val)
                    else:
                        norm_values = pd.Series(0.0, index=values_series.index)
                
                # Store individual parameter score
                base_gdf[f"RiskParam_{param.name}"] = norm_values.reindex(base_gdf.index, fill_value=0.0)
                
                # Apply weight
                weight_frac = param.weight / 100.0
                # Align with base_gdf index
                base_gdf["Total_Risk_Score"] += norm_values.reindex(base_gdf.index, fill_value=0.0) * weight_frac
                
        except Exception as e:
            logger.error(f"Error processing parameter {param.name}: {e}")
            continue
            
    # 3. Categorize
    def categorize_risk(score):
        if score >= 4.0: return "High Risk"
        if score >= 3.0: return "Medium Risk"
        if score >= 2.0: return "Low Risk"
        return "Very Low"
        
    base_gdf["Risk_Category"] = base_gdf["Total_Risk_Score"].apply(categorize_risk)
    
    # Generate random suffix for new layer name
    timestamp = int(time.time() * 1000)
    layer_id = f"layer-{timestamp}"
    
    # 4. Save new layer
    geojson_data = json.loads(base_gdf.to_json())
    
    # Set default colors for the categories
    symbology_map = {
        "High Risk": "#ef4444",
        "Medium Risk": "#f97316",
        "Low Risk": "#eab308",
        "Very Low": "#22c55e"
    }
    
    layer_obj = {
        "id": layer_id,
        "name": f"Risk Analysis Result",
        "data": geojson_data,
        "bounds": base_gdf.total_bounds.tolist() if not base_gdf.empty else [0,0,0,0],
        "visible": True,
        "color": "#888888",
        "symbologyField": "Risk_Category",
        "symbologyMap": symbology_map,
        "labelField": ""
    }
    
    # Save to disk
    file_path = os.path.join(DATA_DIR, f"{layer_id}.json")
    with open(file_path, "w") as f:
        json.dump(layer_obj, f)
    
    # Broadcast to all clients
    if loop and loop.is_running():
        asyncio.run_coroutine_threadsafe(broadcast_event({
            "type": "new_layer",
            "layer": layer_obj
        }), loop)
    
    return layer_obj
