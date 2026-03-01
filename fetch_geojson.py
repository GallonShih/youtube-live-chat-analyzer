import json
import requests
import time

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
    { "name": "日本", "lat": 36.2048, "lng": 138.2529 },
    { "name": "韓國", "lat": 35.9078, "lng": 127.7669 },
    { "name": "中國", "lat": 35.8617, "lng": 104.1954 },
    { "name": "美國", "lat": 37.0902, "lng": -95.7129 },
    { "name": "加拿大", "lat": 56.1304, "lng": -106.3468 },
    { "name": "英國", "lat": 55.3781, "lng": -3.4360 },
    { "name": "法國", "lat": 46.2276, "lng": 2.2137 },
    { "name": "德國", "lat": 51.1657, "lng": 10.4515 },
    { "name": "澳洲", "lat": -25.2744, "lng": 133.7751 },
    { "name": "紐西蘭", "lat": -40.9006, "lng": 174.8860 },
    { "name": "巴西", "lat": -14.2350, "lng": -51.9253 },
    { "name": "阿根廷", "lat": -38.4161, "lng": -63.6167 },
    { "name": "墨西哥", "lat": 23.6345, "lng": -102.5528 },
    { "name": "泰國", "lat": 15.8700, "lng": 100.9925 },
    { "name": "新加坡", "lat": 1.3521, "lng": 103.8198 },
    { "name": "印度", "lat": 20.5937, "lng": 78.9629 },
    { "name": "印尼", "lat": -0.7893, "lng": 113.9213 },
    { "name": "俄羅斯", "lat": 61.5240, "lng": 105.3188 },
    { "name": "義大利", "lat": 41.8719, "lng": 12.5674 },
    { "name": "荷蘭", "lat": 52.1326, "lng": 5.2913 },
    { "name": "芬蘭", "lat": 61.9241, "lng": 25.7482 },
    { "name": "瑞典", "lat": 60.1282, "lng": 18.6435 },
    { "name": "波蘭", "lat": 51.9194, "lng": 19.1451 },
    { "name": "瑞士", "lat": 46.8182, "lng": 8.2275 },
    { "name": "西班牙", "lat": 40.4637, "lng": -3.7492 },
    { "name": "菲律賓", "lat": 12.8797, "lng": 121.7740 },
    { "name": "馬來西亞", "lat": 4.2105, "lng": 101.9758 },
    { "name": "柬埔寨", "lat": 12.5657, "lng": 104.9910 },
    { "name": "伊朗", "lat": 32.4279, "lng": 53.6880 },
    { "name": "沙烏地阿拉伯", "lat": 23.8859, "lng": 45.0792 },
    { "name": "約旦", "lat": 30.5852, "lng": 36.2384 },
    { "name": "肯亞", "lat": -0.0236, "lng": 37.9062 },
    { "name": "馬達加斯加", "lat": -18.7669, "lng": 46.8691 },
    { "name": "聖多美普林西比", "lat": 0.1864, "lng": 6.6131 }
  ]
}

def fetch_geojson(name, kind="country"):
    url = "https://nominatim.openstreetmap.org/search"
    queries = [name]
    if kind == "taiwan":
        queries = [f"{name}, Taiwan", f"{name}市, Taiwan", f"{name}縣, Taiwan"]

    for query in queries:
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
                            print(f"[{name}] {geom_type} found with '{query}'.")
                            return feature["geometry"]
            print(f"Failed to get polygon for '{query}', status: {response.status_code}")
        except Exception as e:
            print(f"Error '{query}': {e}")
        time.sleep(1.5)
    return None

results = {"type": "FeatureCollection", "features": []}

try:
    with open("/Users/gallon/Documents/hermes/docs/geo_data_extracted.json", "r", encoding="utf-8") as f:
        existing = json.load(f)
        existing_names = {f["properties"]["name"] for f in existing.get("features", [])}
        results["features"] = existing.get("features", [])
except Exception:
    existing_names = set()

print("Fetching taiwan regions...")
for region in data["taiwan_regions"]:
    if region["name"] in existing_names:
        continue
    time.sleep(1.5) # Be nice to Nominatim (max 1 req/s)
    geom = fetch_geojson(region["name"], "taiwan")
    if geom:
        results["features"].append({
            "type": "Feature",
            "properties": {"name": region["name"], "type": "taiwan_region", "lat": region["lat"], "lng": region["lng"]},
            "geometry": geom
        })
        with open("/Users/gallon/Documents/hermes/docs/geo_data_extracted.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
    else:
        print(f"Skipping {region['name']} - no polygon found")

print("Fetching countries...")
for country in data["countries"]:
    if country["name"] in existing_names:
        continue
    time.sleep(2.0)
    geom = fetch_geojson(country["name"], "country")
    if geom:
        results["features"].append({
            "type": "Feature",
            "properties": {"name": country["name"], "type": "country", "lat": country["lat"], "lng": country["lng"]},
            "geometry": geom
        })
        with open("/Users/gallon/Documents/hermes/docs/geo_data_extracted.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
    else:
        print(f"Skipping {country['name']} - no polygon found")

print("Done. Saved to /Users/gallon/Documents/hermes/docs/geo_data_extracted.json")
