import pyedflib
import numpy as np
import matplotlib.pyplot as plt
from scipy.signal import butter, filtfilt, find_peaks
import tkinter as tk
from tkinter import filedialog

# --- NEW FUNCTION TO PROMPT FOR FILE ---
def prompt_for_file():
    """Opens a file dialog to select an EDF file."""
    root = tk.Tk()
    root.withdraw()  # Hide the main tkinter window
    filepath = filedialog.askopenfilename(
        title="Select an EDF file",
        filetypes=(("EDF files", "*.edf"), ("All files", "*.*"))
    )
    return filepath

# --- ANALYSIS FUNCTIONS (UNCHANGED) ---
def inspect_and_repair_edf_header(filepath):
    """Reads EDF, inspects headers, and creates a 'repaired' in-memory map."""
    try:
        edf_file = pyedflib.EdfReader(filepath)
    except OSError as e:
        print(f"Shit, couldn't open the EDF file. Error: {e}")
        return None
    
    n_signals = edf_file.signals_in_file
    signal_labels = edf_file.getSignalLabels()
    sample_rates = edf_file.getSampleFrequencies()
    
    REPAIR_MAP = {'minute_vent': ['Minute Vent.', 'Min Vent', 'Minute Ventilation', 'MV']}
    clean_signals = {}

    for clean_name, possible_dirty_names in REPAIR_MAP.items():
        for i in range(n_signals):
            if signal_labels[i] in possible_dirty_names:
                clean_signals[clean_name] = {
                    'ch_index': i,
                    'label': signal_labels[i],
                    'sample_rate': int(sample_rates[i])
                }
                break
    edf_file.close()
    if 'minute_vent' not in clean_signals:
        return None
    return clean_signals

def read_target_signal(filepath, signal_info):
    """Reads the actual signal data for our target channel."""
    with pyedflib.EdfReader(filepath) as edf_file:
        ch_index = signal_info['ch_index']
        print(f"\nReading signal data from channel {ch_index} ('{signal_info['label']}') ...")
        signal_data = edf_file.readSignal(ch_index)
        print(f"Successfully read {len(signal_data)} data points.")
    return signal_data

def find_pb_frequency(signal_data, sample_rate):
    """Uses FFT to find the dominant periodic breathing frequency."""
    n_points = len(signal_data)
    if n_points == 0: return None

    print("\nRunning FFT to find dominant cycle frequency...")
    yf = np.fft.rfft(signal_data)
    xf = np.fft.rfftfreq(n_points, 1 / sample_rate)

    min_freq, max_freq = 1 / 90, 1 / 40
    idx_of_interest = np.where((xf >= min_freq) & (xf <= max_freq))
    if len(idx_of_interest[0]) == 0:
        print("No significant frequencies found in the periodic breathing range.")
        return None

    peak_idx_in_slice = np.argmax(np.abs(yf[idx_of_interest]))
    peak_idx_in_full = idx_of_interest[0][peak_idx_in_slice]
    dominant_freq = xf[peak_idx_in_full]
    print(f"--- 🚀 Dominant PB-range frequency found: {dominant_freq:.4f} Hz (~{1/dominant_freq:.1f}s period) ---")
    return dominant_freq

def analyze_pb_events(signal_data, sample_rate, pb_freq):
    """Filters signal around the PB freq and calculates final metrics."""
    if pb_freq is None:
        return

    print("\nFiltering signal and analyzing PB events...")
    lowcut = pb_freq - 0.005
    highcut = pb_freq + 0.005
    b, a = butter(2, [lowcut, highcut], btype='band', fs=sample_rate)
    filtered_signal = filtfilt(b, a, signal_data)

    height_threshold = 1.0
    distance_threshold = 30 * sample_rate 
    peaks, _ = find_peaks(filtered_signal, height=height_threshold, distance=distance_threshold)
    
    if len(peaks) < 3:
        print("\nNot enough consecutive periodic breathing events found to analyze.")
        print("Try lowering the 'height_threshold' in the script if you think this is wrong.")
        return

    periods = np.diff(peaks) / sample_rate
    avg_period = np.mean(periods)

    depths = []
    for i in range(len(peaks) - 1):
        trough_region = filtered_signal[peaks[i]:peaks[i+1]]
        trough_val = np.min(trough_region)
        depths.append(filtered_signal[peaks[i]] - trough_val)
    avg_depth = np.mean(depths)
    
    pb_duration_seconds = (peaks[-1] - peaks[0]) / sample_rate
    total_duration_seconds = len(signal_data) / sample_rate
    pb_percentage = (pb_duration_seconds / total_duration_seconds) * 100

    print("\n--- ✅ FINAL ANALYSIS COMPLETE ---")
    print(f"  Average Period: {avg_period:.2f} s")
    print(f"  Average Depth: {avg_depth:.2f} L/min")
    print(f"  Time in PB: {pb_percentage:.2f}% of the night")
    print(f"  Number of Cycles Detected: {len(peaks)}")
    print("---------------------------------")

    time_axis = np.arange(len(signal_data)) / sample_rate
    plt.figure(figsize=(15, 8))
    plt.plot(time_axis, signal_data, label='Original Minute Vent', color='grey', alpha=0.5)
    plt.plot(time_axis, filtered_signal, label='Filtered Signal (PB Waves)', color='red', linewidth=2)
    plt.plot(time_axis[peaks], filtered_signal[peaks], "x", color='black', markersize=10, label=f'Detected Peaks (>{height_threshold:.1f} L/min)')
    plt.title('Periodic Breathing Event Analysis')
    plt.xlabel('Time (seconds)')
    plt.ylabel('Minute Ventilation (L/min)')
    plt.legend()
    plt.grid(True)
    plt.show()

# --- UPDATED MAIN EXECUTION BLOCK ---
if __name__ == '__main__':
    # Instead of parsing arguments, we now call the prompt function
    edf_filepath = prompt_for_file()

    # Check if the user selected a file or just closed the window
    if not edf_filepath:
        print("No file selected. Exiting.")
    else:
        print(f"File selected: {edf_filepath}")
        
        # Step 1: Get the clean header map
        clean_header_map = inspect_and_repair_edf_header(edf_filepath)
        if not clean_header_map:
            print("Exiting: Could not find required signals in EDF header.")
        else:
            # Step 2: Read signal and find dominant frequency
            mv_info = clean_header_map['minute_vent']
            minute_vent_signal = read_target_signal(edf_filepath, mv_info)
            
            if minute_vent_signal is not None:
                pb_freq = find_pb_frequency(minute_vent_signal, mv_info['sample_rate'])
                
                # Step 3: Find events and calculate final metrics
                analyze_pb_events(minute_vent_signal, mv_info['sample_rate'], pb_freq)