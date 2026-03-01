import json
import requests
import time
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

data = {
  "taiwan_regions": [
    { "name": "台北", "lat": 25.0330, "lng": 121.5654 },
    { "name": "新北", "lat": 25.0123, "lng": 121.4657 },
    { "name": "桃園", "lat": 24.9936, "lng": 121.3010 },
    { "name": "新竹", "lat": 24.8138, "lng": 120.9675 },
    { "name": "苗栗", "lat": 24.5601, "lng": 120.8209 },
    { "name": "台中", "lat": 24.1477, "lng": 120.6736 },
    { "name": "彰化", "lat": 24.0518, "lng": 120.5161 },
    { "name": "南投", "lat": 23.9037, "lng": 120.6859 },
    { "name": "雲林", "lat": 23.7092, "lng": 120.4313 },
    { "name": "嘉義", "lat": 23.4814, "lng": 120.4537 },
    { "name": "台南", "lat": 22.9997, "lng": 120.2270 },
    { "name": "高雄", "lat": 22.6273, "lng": 120.3014 },
    { "name": "屏東", "lat": 22.6659, "lng": 120.4856 },
    { "name": "宜蘭", "lat": 24.7021, "lng": 121.7377 },
    { "name": "花蓮", "lat": 23.9771, "lng": 121.6044 },
    { "name": "台東", "lat": 22.7554, "lng": 121.1505 },
    { "name": "基隆", "lat": 25.1283, "lng": 121.7419 },
    { "name": "澎湖", "lat": 23.5712, "lng": 119.5793 },
    { "name": "金門", "lat": 24.4498, "lng": 118.3732 },
    { "name": "馬祖", "lat": 26.1507, "lng": 119.9289 },
    { "name": "連江", "lat": 26.1507, "lng": 119.9289 },
    { "name": "東沙島", "lat": 20.6992, "lng": 116.7285 }
  ],
  "countries": [
      # Skipping countries redownload to save time. We only fix Taiwan.
  ]
}

tw_mapping = {
    "基隆": ["基隆市, Taiwan"],
    "台北": ["臺北市, Taiwan"],
    "新北": ["新北市, Taiwan"],
    "桃園": ["桃園市, Taiwan"],
    "新竹": ["新竹市, Taiwan", "新竹縣, Taiwan"],
    "苗栗": ["苗栗縣, Taiwan"],
    "台中": ["臺中市, Taiwan", "台中市, Taiwan"],
    "彰化": ["彰化縣, Taiwan"],
    "南投": ["南投縣, Taiwan"],
    "雲林": ["雲林縣, Taiwan"],
    "嘉義": ["嘉義市, Taiwan", "嘉義縣, Taiwan"],
    "台南": ["臺南市, Taiwan", "台南市, Taiwan"],
    "高雄": ["高雄市, Taiwan"],
    "屏東": ["屏東縣, Taiwan"],
    "宜蘭": ["宜蘭縣, Taiwan"],
    "花蓮": ["花蓮縣, Taiwan"],
    "台東": ["臺東縣, Taiwan", "台東縣, Taiwan"],
    "澎湖": ["澎湖縣, Taiwan"],
    "金門": ["金門縣, Taiwan"],
    "馬祖": ["連江縣, Taiwan"],
    "連江": ["連江縣, Taiwan"],
    "東沙島": ["東沙群島, Taiwan", "東沙"]
}

def fetch_single(query):
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": query,
        "format": "geojson",
        "polygon_geojson": 1,
        "limit": 5
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7"
    }
    try:
        response = requests.get(url, params=params, headers=headers)
        if response.status_code == 200:
            res_data = response.json()
            if "features" in res_data and len(res_data["features"]) > 0:
                for feature in res_data["features"]:
                    geom_type = feature.get("geometry", {}).get("type")
                    if geom_type in ["Polygon", "MultiPolygon"]:
                        print(f" -> Found polygon for '{query}'")
                        return feature["geometry"]
    except Exception as e:
        print(f"Error for '{query}': {e}")
    time.sleep(1.2)
    return None

def fetch_and_merge(name):
    queries = tw_mapping.get(name, [])
    geoms = []
    for q in queries:
        time.sleep(1.5)
        g = fetch_single(q)
        if g:
            geoms.append(shape(g))
            if len(queries) > 1 and "市" in q and ("臺中" in q or "台南" in q or "臺東" in q):
                break # Just fallback aliases don't union
        else:
            print(f" -> Failed to get {q}")

    if not geoms:
        return None
    
    if len(geoms) == 1:
        return mapping(geoms[0])
    
    # We have multiple, let's union them (e.g. Chiayi City + Chiayi County)
    print(f"[{name}] Unioning {len(geoms)} geometries together...")
    merged = unary_union(geoms)
    return mapping(merged)

if __name__ == "__main__":
    # Load existing to keep countries
    with open("/Users/gallon/Documents/hermes/docs/geo_data_extracted.json", "r", encoding="utf-8") as f:
        existing = json.load(f)

    # Filter out taiwan_region to replace them
    new_features = [f for f in existing.get("features", []) if f["properties"].get("type") != "taiwan_region"]
    
    results = {"type": "FeatureCollection", "features": new_features}
    
    for region in data["taiwan_regions"]:
        name = region["name"]
        print(f"Fetching exact match for {name}...")
        geom = fetch_and_merge(name)
        if geom:
            results["features"].append({
                "type": "Feature",
                "properties": {"name": name, "type": "taiwan_region", "lat": region["lat"], "lng": region["lng"]},
                "geometry": geom
            })
            # Save incrementally
            with open("/Users/gallon/Documents/hermes/docs/geo_data_extracted.json", "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
        else:
            print(f"WARNING: Could not find ANY geometries for {name}")

    print("Finished merging and fixing Taiwan Regions.")
