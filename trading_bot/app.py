"""
Flask API for the DRL Trading Bot.
"""
import os
from flask import Flask, jsonify, render_template, send_from_directory
from flask_cors import CORS

# Assuming train.py is in the same directory or Python path
try:
    from train import get_training_progress, get_backtest_results, get_bot_status, start_training_process
except ImportError:
    # This fallback is for environments where 'train' might not be directly importable
    # in the way Flask discovers it, though typically it should work if app.py and train.py are in the same package.
    # For the worker's environment, this direct import should be fine.
    print("Attempting to import from .train for relative import context")
    from .train import get_training_progress, get_backtest_results, get_bot_status, start_training_process


app = Flask(__name__, template_folder='templates', static_folder='static') # Explicitly define template and static folders
CORS(app) # Enable CORS for all routes

# --- Routes for serving static files from project root ---
@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory(os.path.join(app.root_path, '..', 'css'), filename)

@app.route('/assets/<path:path>')
def serve_assets(path):
    # For paths like 'img/logo.png', path will be 'img/logo.png'
    return send_from_directory(os.path.join(app.root_path, '..', 'assets'), path)

@app.route('/js/<path:filename>')
def serve_root_js(filename):
    return send_from_directory(os.path.join(app.root_path, '..', 'js'), filename)

# --- API Endpoints ---
@app.route('/status', methods=['GET'])
def get_status():
    """Returns the current status of the trading bot."""
    status = get_bot_status()
    return jsonify({'status': status})

@app.route('/training-progress', methods=['GET'])
def training_progress():
    """Returns the training progress data."""
    progress_data = get_training_progress()
    return jsonify({'progress': progress_data})

@app.route('/backtest-results', methods=['GET'])
def backtest_results():
    """Returns the backtesting results."""
    results_data = get_backtest_results()
    return jsonify({'results': results_data})

@app.route('/start-training', methods=['POST'])
def start_training():
    """
    Starts the training and backtesting process.
    Returns a message indicating the outcome.
    """
    # The start_training_process function from train.py already returns a dict
    # e.g. {"status": "success", "message": "Training and backtesting completed."}
    # or {"status": "error", "message": "Training already in progress."}
    result = start_training_process()
    # Determine HTTP status code based on success/error
    http_status_code = 200 if result.get("status") == "success" else 409 if "in progress" in result.get("message", "").lower() else 500
    return jsonify(result), http_status_code

# --- Frontend Routes ---
@app.route('/')
def index():
    """Serves the main index page, which can link to the dashboard."""
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    """Serves the trading bot dashboard page."""
    return render_template('dashboard.html')

if __name__ == '__main__':
    # Note: Using host='0.0.0.0' to make it accessible on the network if needed,
    # and threaded=True for handling multiple requests, though training is still blocking.
    app.run(debug=True, port=5000, host='0.0.0.0', threaded=True)
