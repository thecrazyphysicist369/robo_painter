import asyncio
import websockets
import json
import threading
import os
from workspace_generator import generate_r_workspace
from calibration_engine import PhysicalCalibrator

# Global state
current_task = None
cancel_event = threading.Event()

def send_ws(ws, loop, data):
    """Helper to send a message from a thread to the websocket."""
    if not cancel_event.is_set():
        asyncio.run_coroutine_threadsafe(
            ws.send(json.dumps(data)), loop
        )

def run_math_generation_thread(ws, loop):
    """Thread for pure mathematical workspace generation (no Arduino)."""
    global current_task
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(current_dir, '..', 'dashboard', 'public', 'r_workspace.json')

    def progress_callback(progress):
        send_ws(ws, loop, {"type": "progress", "value": progress})

    try:
        success = generate_r_workspace(
            num_samples=50000,
            output_file=output_path,
            progress_callback=progress_callback,
            cancel_event=cancel_event
        )
        if success and not cancel_event.is_set():
            send_ws(ws, loop, {"type": "status", "value": "idle"})
            send_ws(ws, loop, {"type": "complete", "mode": "r_workspace"})
    except Exception as e:
        send_ws(ws, loop, {"type": "error", "message": str(e)})
    finally:
        current_task = None

def run_physical_calibration_thread(ws, loop, port, num_samples):
    """Thread for real physical calibration via Arduino serial."""
    global current_task
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(current_dir, '..', 'dashboard', 'public', 'r_workspace.json')

    calibrator = PhysicalCalibrator(port=port, num_samples=num_samples)

    def log_callback(entry):
        send_ws(ws, loop, {"type": "cal_log", "data": entry})

    def progress_callback(progress):
        send_ws(ws, loop, {"type": "progress", "value": progress})

    try:
        # Connect to Arduino
        send_ws(ws, loop, {"type": "cal_log", "data": {
            "type": "info", "message": f"Connecting to Arduino on {port}..."
        }})
        calibrator.connect()
        send_ws(ws, loop, {"type": "cal_log", "data": {
            "type": "info", "message": "Connected to Arduino successfully"
        }})

        # Run calibration
        success = calibrator.run_calibration(
            log_callback=log_callback,
            progress_callback=progress_callback,
            cancel_event=cancel_event
        )

        if success and not cancel_event.is_set():
            # Save workspace
            send_ws(ws, loop, {"type": "cal_log", "data": {
                "type": "info",
                "message": f"Computing convex hull from {calibrator.successful} points..."
            }})

            if calibrator.save_workspace(output_path):
                send_ws(ws, loop, {"type": "cal_log", "data": {
                    "type": "info",
                    "message": f"Workspace saved! {calibrator.successful} successful, {calibrator.failed} failed, {calibrator._reachability_pct()}% reachability"
                }})
                send_ws(ws, loop, {"type": "status", "value": "idle"})
                send_ws(ws, loop, {"type": "complete", "mode": "r_workspace"})
            else:
                send_ws(ws, loop, {"type": "cal_log", "data": {
                    "type": "fail",
                    "message": "Not enough successful samples to compute convex hull (need at least 4)"
                }})
                send_ws(ws, loop, {"type": "status", "value": "idle"})

    except Exception as e:
        send_ws(ws, loop, {"type": "cal_log", "data": {
            "type": "fail", "message": f"Error: {str(e)}"
        }})
        send_ws(ws, loop, {"type": "error", "message": str(e)})
        send_ws(ws, loop, {"type": "status", "value": "idle"})
    finally:
        calibrator.disconnect()
        current_task = None

async def handler(websocket):
    global current_task, cancel_event
    print("Client connected")
    try:
        async for message in websocket:
            data = json.loads(message)
            action = data.get("action")

            if action == "generate_r_workspace":
                # Pure math generation (no Arduino)
                if current_task is None or not current_task.is_alive():
                    cancel_event.clear()
                    await websocket.send(json.dumps({"type": "status", "value": "running"}))
                    loop = asyncio.get_running_loop()
                    current_task = threading.Thread(
                        target=run_math_generation_thread, args=(websocket, loop)
                    )
                    current_task.start()
                else:
                    await websocket.send(json.dumps({"type": "error", "message": "Task already running"}))

            elif action == "calibrate_r_workspace":
                # Real physical calibration
                port = data.get("port", "COM3")
                num_samples = data.get("num_samples", 100)
                if current_task is None or not current_task.is_alive():
                    cancel_event.clear()
                    await websocket.send(json.dumps({"type": "status", "value": "running"}))
                    loop = asyncio.get_running_loop()
                    current_task = threading.Thread(
                        target=run_physical_calibration_thread,
                        args=(websocket, loop, port, num_samples)
                    )
                    current_task.start()
                else:
                    await websocket.send(json.dumps({"type": "error", "message": "Task already running"}))

            elif action == "stop":
                if current_task and current_task.is_alive():
                    cancel_event.set()
                    current_task.join(timeout=10)
                    current_task = None
                await websocket.send(json.dumps({"type": "status", "value": "idle"}))

            elif action == "check_exists":
                mode = data.get("mode")
                if mode == "r_workspace":
                    current_dir = os.path.dirname(os.path.abspath(__file__))
                    output_path = os.path.join(current_dir, '..', 'dashboard', 'public', 'r_workspace.json')
                    exists = os.path.exists(output_path)
                    await websocket.send(json.dumps({"type": "exists", "mode": mode, "value": exists}))

    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")
    finally:
        if current_task and current_task.is_alive():
            cancel_event.set()
            current_task.join(timeout=10)

async def main():
    print("Starting WebSocket server on ws://localhost:8765")
    async with websockets.serve(handler, "localhost", 8765):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
