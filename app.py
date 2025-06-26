import gspread
from oauth2client.service_account import ServiceAccountCredentials
from flask import Flask, render_template, jsonify, request
import datetime
import json
from collections import defaultdict

# --- Flask & Google Sheet Setup ---
app = Flask(__name__)

try:
    scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
    creds = ServiceAccountCredentials.from_json_keyfile_name('credentials.json', scope)
    client = gspread.authorize(creds)
    live_sheet = client.open("Tiruchendur_Parking_Lots_Info").worksheet("Sheet3")
    history_sheet = client.open("Tiruchendur_Parking_Lots_Info").worksheet("History1")
    print("Successfully connected to Google Sheets.")
except Exception as e:
    print(f"Error connecting to Google Sheets: {e}")
    live_sheet = None
    history_sheet = None

# --- Helper Function to Fetch and Process Live Data ---
def get_parking_data():
    if not live_sheet: return {}

    ROUTE_MAP = {
        'TUT': {'en': 'Thoothukudi', 'ta': 'தூத்துக்குடி'},
        'TIN': {'en': 'Tirunelveli', 'ta': 'திருநெல்வேலி'},
        'NGL': {'en': 'Nagercoil', 'ta': 'நாகர்கோவில்'},
        'VIP': {'en': 'VIP', 'ta': 'விஐபி'}
    }

    try:
        data = live_sheet.get_all_records(numericise_ignore=['all'])
        all_lots_data = {}
        for row in data:
            if not row.get('ParkingLotID'): continue
            cleaned_id = str(row['ParkingLotID']).strip().lower()
            if not cleaned_id: continue

            processed_lot = {}
            processed_lot['ParkingLotID'] = cleaned_id

            try: total_capacity = int(row.get('Capacity', 0))
            except (ValueError, TypeError): total_capacity = 0
            try: current_vehicles = int(row.get('occupied space', 0))
            except (ValueError, TypeError): current_vehicles = 0
            
            processed_lot['Parking_name_en'] = row.get('Parking Name', 'Unknown Lot')
            processed_lot['Parking_name_ta'] = row.get('Parking Name_ta', processed_lot['Parking_name_en'])
            processed_lot['Notes_en'] = row.get('Notes_en', '')
            processed_lot['Notes_ta'] = row.get('Notes_ta', processed_lot['Notes_en'])

            is_available_val = str(row.get('Available/Filled', 'FALSE')).strip().upper()
            processed_lot['IsParkingAvailable'] = is_available_val == 'TRUE'
            
            route_code = str(row.get('Route', '')).strip().upper()
            route_info = ROUTE_MAP.get(route_code, {'en': 'Other', 'ta': 'மற்றவை'})
            processed_lot['Route_en'] = route_info['en']
            processed_lot['Route_ta'] = route_info['ta']

            processed_lot['TotalCapacity'] = total_capacity
            processed_lot['Current_Vehicle'] = current_vehicles
            processed_lot['Occupancy_Percent'] = (current_vehicles / total_capacity) * 100 if total_capacity > 0 else 0

            for key in ['Latitude', 'Longitude']:
                try: processed_lot[key] = float(row.get(key, 0.0))
                except (ValueError, TypeError): processed_lot[key] = 0.0
            
            all_lots_data[cleaned_id] = processed_lot
        return all_lots_data
    except Exception as e:
        print(f"Error fetching/processing live data: {e}")
        return {}


# --- Flask Routes (API Endpoints) ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/map')
def map_view():
    parking_data_dict = get_parking_data()
    return render_template('map.html', parking_data_json=json.dumps(list(parking_data_dict.values())))

@app.route('/api/parking-data')
def api_data():
    all_lots = get_parking_data()
    
    # *** NEW: Calculate route-wise summaries ***
    route_summary = defaultdict(lambda: {'total_vehicles': 0, 'total_capacity': 0})
    for lot_id, lot_data in all_lots.items():
        route_name = lot_data['Route_en']
        if route_name in ["Thoothukudi", "Tirunelveli", "Nagercoil"]:
            route_summary[route_name]['total_vehicles'] += lot_data['Current_Vehicle']
            route_summary[route_name]['total_capacity'] += lot_data['TotalCapacity']
            
    # Calculate occupancy percentage for each route
    for route, summary in route_summary.items():
        if summary['total_capacity'] > 0:
            summary['occupancy_percent'] = (summary['total_vehicles'] / summary['total_capacity']) * 100
        else:
            summary['occupancy_percent'] = 0

    return jsonify({
        "last_updated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "lots": list(all_lots.values()), # Renamed from 'data' to 'lots'
        "route_summary": dict(route_summary) # The new summary data
    })

# The rest of the file remains the same...
@app.route('/api/overall-history')
def overall_history():
    if not history_sheet: return jsonify({"error": "History data source not available"}), 500
    try:
        all_history = history_sheet.get_all_records(numericise_ignore=['all'])
        live_parking_data_dict = get_parking_data()
    except Exception as e: return jsonify({"error": f"Could not fetch history data: {e}"}), 500

    id_to_route_map = { lot_id: data['Route_en'] for lot_id, data in live_parking_data_dict.items() }
    routes = ["Thoothukudi", "Tirunelveli", "Nagercoil"]
    timestamp_snapshots = {}
    time_24_hours_ago = datetime.datetime.now() - datetime.timedelta(hours=24)

    for record in all_history:
        try:
            lot_id = str(record.get('ParkingLotID', '')).strip().lower()
            timestamp_str = record.get('Timestamp')
            if not (lot_id and timestamp_str and lot_id in id_to_route_map): continue
            
            record_datetime = datetime.datetime.strptime(timestamp_str, '%d/%m/%Y %H:%M:%S')
            if record_datetime >= time_24_hours_ago:
                ts_key = record_datetime.isoformat()
                if ts_key not in timestamp_snapshots: timestamp_snapshots[ts_key] = {}
                timestamp_snapshots[ts_key][lot_id] = int(record.get('occupied space', 0))
        except (ValueError, TypeError, KeyError): continue

    datasets, sorted_timestamps = {r: [] for r in routes}, sorted(timestamp_snapshots.keys())
    latest_lot_counts = {lot_id: 0 for lot_id in id_to_route_map.keys()}

    for ts in sorted_timestamps:
        for lot_id, count in timestamp_snapshots.get(ts, {}).items():
            if lot_id in latest_lot_counts: latest_lot_counts[lot_id] = count
        route_totals = {r: 0 for r in routes}
        for lot_id, count in latest_lot_counts.items():
            route_name = id_to_route_map.get(lot_id)
            if route_name in route_totals: route_totals[route_name] += count
        for route in routes: datasets[route].append({"x": ts, "y": route_totals[route]})
            
    colors = {"Thoothukudi": "#E91E63", "Tirunelveli": "#00BCD4", "Nagercoil": "#FF9800"}
    final_datasets = [{
        "label": f'{r} Vehicle Count', "data": datasets[r], "borderColor": colors[r], 
        "fill": False, "tension": 0.2, "pointRadius": 0, "borderWidth": 2.5
    } for r in routes]
        
    return jsonify({"datasets": final_datasets})

@app.route('/api/parking-lot-history')
def parking_lot_history():
    if not history_sheet: return jsonify({"error": "History data source not available"}), 500
    lot_id_from_request = str(request.args.get('id', '')).strip().lower()
    if not lot_id_from_request: return jsonify({"error": "Missing 'id' parameter"}), 400
    try: all_history = history_sheet.get_all_records(numericise_ignore=['all'])
    except Exception as e: return jsonify({"error": f"Could not fetch history data: {e}"}), 500

    all_lots = get_parking_data()
    lot_name = all_lots.get(lot_id_from_request, {}).get("Parking_name_en", "Unknown Lot")
    time_24_hours_ago = datetime.datetime.now() - datetime.timedelta(hours=24)
    graph_data = []

    for record in all_history:
        if str(record.get('ParkingLotID', '')).strip().lower() != lot_id_from_request: continue
        try:
            timestamp_str = record.get('Timestamp')
            if not timestamp_str: continue
            record_datetime = datetime.datetime.strptime(timestamp_str, '%d/%m/%Y %H:%M:%S')
            if record_datetime >= time_24_hours_ago:
                try:
                    capacity = int(record.get('Capacity', 0))
                    occupied = int(record.get('occupied space', 0))
                except (ValueError, TypeError): capacity, occupied = 0, 0
                occupancy_percent = (occupied / capacity) * 100 if capacity > 0 else 0
                graph_data.append({"x": record_datetime.isoformat(), "y": occupancy_percent})
        except (ValueError, TypeError, KeyError) as e: print(f"Skipping bad history record: {record}, Error: {e}"); continue
            
    graph_data.sort(key=lambda p: p['x'])
    dataset = {
        "label": 'Occupancy (%)', "data": graph_data, "borderColor": '#FF5722', "backgroundColor": 'rgba(255, 87, 34, 0.2)',
        "fill": True, "tension": 0.2, "pointRadius": 1, "pointHoverRadius": 5, "borderWidth": 2
    }
    return jsonify({"lotName": lot_name, "datasets": [dataset]})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
