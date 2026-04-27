import numpy as np
from scipy.spatial import ConvexHull
import serial
import json
import os
import time
from workspace_generator import forward_kinematics, DH_PARAMS

class PhysicalCalibrator:
    """
    Performs real physical workspace calibration by:
    1. Generating random angle sets
    2. Sending each to the Arduino via serial
    3. Reading back achieved positions
    4. Computing FK on achieved angles to get real pen tip XYZ
    5. Building a point cloud from real data
    """

    def __init__(self, port='COM3', baud=115200, num_samples=100):
        self.port = port
        self.baud = baud
        self.num_samples = num_samples
        self.ser = None
        self.results = []
        self.positions = []
        self.successful = 0
        self.failed = 0

    def connect(self):
        """Open serial connection to Arduino."""
        self.ser = serial.Serial(self.port, self.baud, timeout=3)
        time.sleep(2)  # Wait for Arduino reset
        # Flush any startup messages
        while self.ser.in_waiting:
            self.ser.readline()
        return True

    def disconnect(self):
        """Close serial connection."""
        if self.ser and self.ser.is_open:
            self.ser.close()

    def generate_angle_sets(self):
        """Generate random servo angle sets (0-180 degrees)."""
        # Use a reasonable range to avoid extreme positions that might damage the arm
        # Shoulder: 30-150, Elbow: 30-150, WristPitch: 20-160, WristRoll: 0-180, Gripper: 60-120
        angle_sets = []
        for _ in range(self.num_samples):
            angles = [
                np.random.randint(30, 151),   # Shoulder
                np.random.randint(30, 151),   # Elbow
                np.random.randint(20, 161),   # Wrist Pitch
                np.random.randint(0, 181),    # Wrist Roll
                np.random.randint(60, 121),   # Gripper (keep near center)
            ]
            angle_sets.append(angles)
        return angle_sets

    def send_angles(self, angles):
        """Send angle command to Arduino and read response."""
        cmd = "A:" + ",".join(str(int(a)) for a in angles) + "\n"
        
        # Flush input buffer before sending
        while self.ser.in_waiting:
            self.ser.readline()
        
        self.ser.write(cmd.encode())
        
        # Read response with timeout - skip non-OK lines (like status prints)
        start_time = time.time()
        while time.time() - start_time < 5:  # 5 second total timeout
            line = self.ser.readline().decode(errors='ignore').strip()
            if line.startswith("OK:"):
                try:
                    achieved = [int(x) for x in line[3:].split(",")]
                    if len(achieved) == 5:
                        return achieved
                except ValueError:
                    pass
        
        return None  # Timeout or invalid response

    def query_position(self):
        """Query current servo positions."""
        while self.ser.in_waiting:
            self.ser.readline()
        
        self.ser.write(b"Q\n")
        start_time = time.time()
        while time.time() - start_time < 3:
            line = self.ser.readline().decode(errors='ignore').strip()
            if line.startswith("POS:"):
                try:
                    return [int(x) for x in line[4:].split(",")]
                except ValueError:
                    pass
        return None

    def home(self):
        """Send arm to home position."""
        while self.ser.in_waiting:
            self.ser.readline()
        
        self.ser.write(b"HOME\n")
        start_time = time.time()
        while time.time() - start_time < 3:
            line = self.ser.readline().decode(errors='ignore').strip()
            if line == "HOMED":
                return True
        return False

    def servo_to_radians(self, servo_angles):
        """Convert servo angles (0-180) to radians centered at 0 (-pi/2 to pi/2)."""
        return [(a - 90) * np.pi / 180.0 for a in servo_angles]

    def compute_error(self, commanded, achieved):
        """Compute angular error between commanded and achieved angles."""
        errors = [abs(c - a) for c, a in zip(commanded, achieved)]
        return errors, sum(errors) / len(errors)

    def run_calibration(self, log_callback=None, progress_callback=None, cancel_event=None):
        """
        Run the full calibration process.
        
        log_callback(log_entry_dict) - called for each sample with details
        progress_callback(percent) - called with overall progress
        cancel_event - threading.Event to check for cancellation
        """
        angle_sets = self.generate_angle_sets()
        
        if log_callback:
            log_callback({
                'type': 'info',
                'message': f'Starting calibration with {self.num_samples} samples on {self.port}'
            })

        # Home the arm first
        if log_callback:
            log_callback({'type': 'info', 'message': 'Homing arm to 90,90,90,90,90...'})
        
        self.home()
        time.sleep(1)

        for i, commanded in enumerate(angle_sets):
            if cancel_event and cancel_event.is_set():
                if log_callback:
                    log_callback({'type': 'warn', 'message': 'Calibration cancelled by user'})
                return False

            sample_num = i + 1
            
            if log_callback:
                log_callback({
                    'type': 'attempt',
                    'sample': sample_num,
                    'total': self.num_samples,
                    'commanded': commanded,
                    'message': f'[{sample_num}/{self.num_samples}] Sending angles: {commanded}'
                })

            # Send to Arduino
            achieved = self.send_angles(commanded)

            if achieved is None:
                self.failed += 1
                result = {
                    'sample': sample_num,
                    'commanded': commanded,
                    'achieved': None,
                    'position': None,
                    'success': False,
                    'error_avg': None,
                }
                self.results.append(result)

                if log_callback:
                    log_callback({
                        'type': 'fail',
                        'sample': sample_num,
                        'total': self.num_samples,
                        'message': f'[{sample_num}/{self.num_samples}] TIMEOUT - No response from Arduino',
                        'reachability': self._reachability_pct()
                    })
            else:
                errors, avg_error = self.compute_error(commanded, achieved)
                
                # Compute FK on achieved angles to get real position
                q_rad = self.servo_to_radians(achieved)
                position = forward_kinematics(np.array(q_rad)).tolist()
                
                self.successful += 1
                self.positions.append(position)

                result = {
                    'sample': sample_num,
                    'commanded': commanded,
                    'achieved': achieved,
                    'position': position,
                    'success': True,
                    'error_avg': round(avg_error, 2),
                    'errors': [round(e, 2) for e in errors],
                }
                self.results.append(result)

                if log_callback:
                    log_callback({
                        'type': 'success',
                        'sample': sample_num,
                        'total': self.num_samples,
                        'commanded': commanded,
                        'achieved': achieved,
                        'position': [round(p, 4) for p in position],
                        'error_avg': round(avg_error, 2),
                        'message': f'[{sample_num}/{self.num_samples}] OK → achieved {achieved} | pos ({position[0]:.4f}, {position[1]:.4f}, {position[2]:.4f}) | err {avg_error:.1f}°',
                        'reachability': self._reachability_pct()
                    })

            if progress_callback:
                progress_callback(int(sample_num / self.num_samples * 100))

        # Home the arm after calibration
        if log_callback:
            log_callback({'type': 'info', 'message': 'Calibration complete. Homing arm...'})
        self.home()

        return True

    def _reachability_pct(self):
        total = self.successful + self.failed
        if total == 0:
            return 0
        return round(self.successful / total * 100, 1)

    def save_workspace(self, output_file):
        """Compute convex hull on real positions and save to JSON."""
        if len(self.positions) < 4:
            return False

        points = np.array(self.positions)
        hull = ConvexHull(points)

        hull_vertex_indices = hull.vertices
        index_map = {old_idx: new_idx for new_idx, old_idx in enumerate(hull_vertex_indices)}

        filtered_vertices = points[hull_vertex_indices].tolist()
        filtered_faces = []
        for simplex in hull.simplices:
            filtered_faces.append([index_map[idx] for idx in simplex])

        output_data = {
            'vertices': filtered_vertices,
            'faces': filtered_faces,
            'num_samples': self.num_samples,
            'successful_samples': self.successful,
            'failed_samples': self.failed,
            'reachability_pct': self._reachability_pct(),
            'calibration_type': 'physical',
            'raw_results': self.results,
        }

        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        with open(output_file, 'w') as f:
            json.dump(output_data, f, indent=2)

        return True
