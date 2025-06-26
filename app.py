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
    # Reads from the "sheet3" worksheet as requested
    live_sheet = client.open("Tiruchendur_Parking_Lots_Info").worksheet("sheet3")
    history_sheet = client.open("Tiruchendur_Parking_Lots_Info").worksheet("History")
    print("Successfully connected to Google Sheets.")
except Exception as e:
    print(f"FATAL: Could not connect to Google Sheets. Check sheet names and sharing permissions. Error: {e}")
    live_sheet = None
    history_sheet = None

# --- Helper Function to Fetch and Process Live Data ---
def get_parking_data():
    if not live_sheet: return {}

    ROUTE_MAP = {
        'TUT': 'Thoothukudi',
        'TIN': 'Tirunelveli',
        'NGL': 'Nagercoil',
        'VIP': 'VIP'
    }

    try:
        data = live_sheet.get_all_records(numericise_ignore=['all'])
        all_lots_data = {}
        for row in data:
            if not row.get('ParkingLotID'): continue
            
            processed_lot = {}
            processed_lot['ParkingLotID'] = str(row['ParkingLotID']).strip().lower()

            # Reads your exact column names
            processed_lot['Parking_name_en'] = row.get('Parking Name', 'Unknown Lot')
            processed_lot['TotalCapacity'] = int(row.get('Capacity', 0))
            processed_lot['Current_Vehicle'] = int(row.get('occupied space', 0))
            is_available_val = str(row.get('Available/Filled', 'FALSE')).strip().upper()
            processed_lot['IsParkingAvailable'] = is_available_val == 'TRUE'
            route_code = str(row.get('Route', '')).strip().upper()
            processed_lot['Route_en'] = ROUTE_MAP.get(route_code, 'Other')
            
            # Calculate occupancy percentage
            if processed_lot['TotalCapacity'] > 0:
                processed_lot['Occupancy_Percent'] = (processed_lot['Current_Vehicle'] / processed_lot['TotalCapacity']) * 100
            else:
                processed_lot['Occupancy_Percent'] = 0

            # Optional: Add these columns to your sheet for map functionality if needed
            processed_lot['Latitude'] = float(row.get('Latitude', 0.0))
            processed_lot['Longitude'] = float(row.get('Longitude', 0.0))
            processed_lot['Notes_en'] = row.get('Notes_en', '')
            
            all_lots_data[processed_lot['ParkingLotID']] = processed_lot
        return all_lots_data
    except Exception as e:
        print(f"Error processing data from sheet3: {e}")
        return {}


# --- Flask Routes (API Endpoints) ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/map')
def map_view():
    parking_data = list(get_parking_data().values())
    return render_template('map.html', parking_data_json=json.dumps(parking_data))

@app.route('/api/parking-data')
def api_data():
    all_lots_list = list(get_parking_data().values())
    if not all_lots_list:
        print("Warning: /api/parking-data is returning no data. Check sheet3 connection and column names.")
    
    route_summary = defaultdict(lambda: {'total_vehicles': 0, 'total_capacity': 0})
    for lot_data in all_lots_list:
        route_name = lot_data['Route_en']
        if route_name in ["Thoothukudi", "Tirunelveli", "Nagercoil"]:
            route_summary[route_name]['total_vehicles'] += lot_data['Current_Vehicle']
            route_summary[route_name]['total_capacity'] += lot_data['TotalCapacity']
            
    for route, summary in route_summary.items():
        summary['occupancy_percent'] = (summary['total_vehicles'] / summary['total_capacity']) * 100 if summary['total_capacity'] > 0 else 0

    return jsonify({
        "last_updated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "lots": all_lots_list,
        "route_summary": dict(route_summary)
    })

@app.route('/api/overall-history')
def overall_history():
    if not history_sheet: return jsonify({"error": "History data source not available"}), 500
    try:
        all_history = history_sheet.get_all_records(numericise_ignore=['all'])
        live_parking_data_dict = get_parking_data()
    except Exception as e: return jsonify({"error": f"Could not fetch history data: {e}"}), 500

    id_to_route_map = { lot_id: data['Route_en'] for lot_id, data in live_parking_data_dict.items() }
    routes = ["Thoothukudi", "Tirunelveli", "Nagercoil"]
    timestamp_snapshots = defaultdict(dict)
    time_24_hours_ago = datetime.datetime.now() - datetime.timedelta(hours=24)

    for record in all_history:
        try:
            lot_id = str(record.get('ParkingLotID', '')).strip().lower()
            if not (lot_id and lot_id in id_to_route_map): continue
            record_datetime = datetime.datetime.strptime(record.get('Timestamp'), '%d/%m/%Y %H:%M:%S')
            if record_datetime >= time_24_hours_ago:
                # Reads 'Current_Vehicle' from History sheet
                timestamp_snapshots[record_datetime.isoformat()][lot_id] = int(record.get('Current_Vehicle', 0))
        except (ValueError, TypeError, KeyError): continue

    datasets = {r: [] for r in routes}
    sorted_timestamps = sorted(timestamp_snapshots.keys())
    latest_lot_counts = {lot_id: 0 for lot_id in id_to_route_map.keys()}

    for ts in sorted_timestamps:
        latest_lot_counts.update(timestamp_snapshots.get(ts, {}))
        route_totals = defaultdict(int)
        for lot_id, count in latest_lot_counts.items():
            route_name = id_to_route_map.get(lot_id)
            if route_name in routes: route_totals[route_name] += count
        for route in routes: datasets[route].append({"x": ts, "y": route_totals[route]})
            
    colors = {"Thoothukudi": "#E91E63", "Tirunelveli": "#00BCD4", "Nagercoil": "#FF9800"}
    final_datasets = [{"label": f'{r} Vehicle Count', "data": datasets[r], "borderColor": colors[r], "fill": False, "tension": 0.2, "pointRadius": 0, "borderWidth": 2.5} for r in routes]
    return jsonify({"datasets": final_datasets})

@app.route('/api/parking-lot-history')
def parking_lot_history():
    if not history_sheet: return jsonify({"error": "History data source not available"}), 500
    lot_id = str(request.args.get('id', '')).strip().lower()
    if not lot_id: return jsonify({"error": "Missing 'id' parameter"}), 400
    try: all_history = history_sheet.get_all_records(numericise_ignore=['all'])
    except Exception as e: return jsonify({"error": f"Could not fetch history data: {e}"}), 500

    lot_name = get_parking_data().get(lot_id, {}).get("Parking_name_en", "Unknown Lot")
    time_24_hours_ago = datetime.datetime.now() - datetime.timedelta(hours=24)
    graph_data = []

    for record in all_history:
        if str(record.get('ParkingLotID', '')).strip().lower() != lot_id: continue
        try:
            record_datetime = datetime.datetime.strptime(record.get('Timestamp'), '%d/%m/%Y %H:%M:%S')
            if record_datetime >= time_24_hours_ago:
                # Reads 'Occupancy_Percent' directly from History sheet
                occupancy = float(record.get('Occupancy_Percent', 0.0))
                graph_data.append({"x": record_datetime.isoformat(), "y": occupancy})
        except (ValueError, TypeError, KeyError): continue
            
    graph_data.sort(key=lambda p: p['x'])
    dataset = {"label": 'Occupancy (%)', "data": graph_data, "borderColor": '#FF5722', "backgroundColor": 'rgba(255, 87, 34, 0.2)',"fill": True, "tension": 0.2, "pointRadius": 1, "pointHoverRadius": 5, "borderWidth": 2}
    return jsonify({"lotName": lot_name, "datasets": [dataset]})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
