import numpy as np
from scipy.spatial import ConvexHull
import json
import os
import time

# DH parameters: [d, a, alpha, theta_offset]
# Using standard DH convention:
# T = Rot_z(theta) * Trans_z(d) * Trans_x(a) * Rot_x(alpha)
DH_PARAMS = [
    {'d': 0.05, 'a': 0.00, 'alpha': np.pi/2, 'offset': 0},       # Joint 1: Shoulder
    {'d': 0.00, 'a': 0.10, 'alpha': 0.00,    'offset': 0},       # Joint 2: Elbow
    {'d': 0.00, 'a': 0.08, 'alpha': 0.00,    'offset': 0},       # Joint 3: Wrist Pitch
    {'d': 0.00, 'a': 0.00, 'alpha': np.pi/2, 'offset': 0},       # Joint 4: Wrist Roll
    {'d': 0.03, 'a': 0.00, 'alpha': 0.00,    'offset': 0},       # Joint 5: Gripper
]

def dh_matrix(theta, d, a, alpha):
    """Computes the DH transformation matrix."""
    ct = np.cos(theta)
    st = np.sin(theta)
    ca = np.cos(alpha)
    sa = np.sin(alpha)
    
    return np.array([
        [ct, -st*ca,  st*sa, a*ct],
        [st,  ct*ca, -ct*sa, a*st],
        [ 0,     sa,     ca,    d],
        [ 0,      0,      0,    1]
    ])

def forward_kinematics(q):
    """Computes the end-effector position for a given joint configuration q."""
    T = np.eye(4)
    for i in range(5):
        params = DH_PARAMS[i]
        theta = q[i] + params['offset']
        A = dh_matrix(theta, params['d'], params['a'], params['alpha'])
        T = np.dot(T, A)
    return T[:3, 3] # Return x, y, z

def generate_r_workspace(num_samples=50000, output_file='r_workspace.json', progress_callback=None, cancel_event=None):
    print(f"Generating R-Workspace with {num_samples} samples using raw NumPy...")
    start_time = time.time()
    
    # Generate random joint configurations
    limits = [-np.pi/2, np.pi/2]
    q_random = np.random.uniform(low=limits[0], high=limits[1], size=(num_samples, 5))
    
    print("Computing Forward Kinematics (this should be fast)...")
    positions = np.zeros((num_samples, 3))
    
    for i in range(num_samples):
        if cancel_event and cancel_event.is_set():
            print("Workspace generation cancelled.")
            return False

        positions[i] = forward_kinematics(q_random[i])
        
        if (i+1) % 5000 == 0:
            progress = int((i+1) / num_samples * 90) # Up to 90% for generation
            if progress_callback:
                progress_callback(progress)
            else:
                print(f"Progress: {i+1}/{num_samples}")

    print(f"Point cloud shape: {positions.shape}")
    
    print("Computing Convex Hull...")
    if progress_callback:
        progress_callback(95) # 95% while computing hull
    hull = ConvexHull(positions)
    
    # We only want to save the vertices that actually make up the hull to save space
    hull_vertex_indices = hull.vertices
    
    # Map old vertex indices to new sequential indices
    index_map = {old_idx: new_idx for new_idx, old_idx in enumerate(hull_vertex_indices)}
    
    # Extract just the points that are on the hull
    filtered_vertices = positions[hull_vertex_indices].tolist()
    
    # Remap the faces to use the new filtered vertex indices
    filtered_faces = []
    for simplex in hull.simplices:
        filtered_faces.append([index_map[idx] for idx in simplex])
    
    output_data = {
        'vertices': filtered_vertices,
        'faces': filtered_faces,
        'num_samples': num_samples
    }
    
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, 'w') as f:
        json.dump(output_data, f)
        
    elapsed = time.time() - start_time
    print(f"Done in {elapsed:.2f} seconds. Saved to {output_file}")
    print(f"Filtered Vertices: {len(filtered_vertices)}, Faces: {len(filtered_faces)}")
    
    if progress_callback:
        progress_callback(100)
    return True

if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(current_dir, '..', 'dashboard', 'public', 'r_workspace.json')
    
    # Start with 50k samples
    generate_r_workspace(num_samples=50000, output_file=output_path)
