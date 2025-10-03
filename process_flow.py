import numpy as np
import pandas as pd
from tkinter import Tk, filedialog
import os
import struct
import re
from scipy.signal import find_peaks
import matplotlib.pyplot as plt

def select_single_file():
    root = Tk()
    root.withdraw()
    filepath = filedialog.askopenfilename(title="Select an EDF File")
    root.destroy()
    return filepath

def read_edf(filepath):
    flow_data = None
    sampling_rate = None

    try:
        with open(filepath, 'rb') as f:
            header = f.read(256)
            
            version = header[0:8].decode('ascii').strip()
            patient_id = header[8:88].decode('ascii').strip()
            record_id = header[88:168].decode('ascii').strip()
            start_date = header[168:176].decode('ascii').strip()
            start_time = header[176:184].decode('ascii').strip()
            num_bytes_in_header = int(header[184:192].decode('ascii').strip())
            
            raw_num_data_records_str = header[236:244].decode('ascii').strip()
            raw_duration_data_record_str = header[244:252].decode('ascii').strip()
            raw_num_signals_str = header[252:256].decode('ascii').strip()
            print(f"DEBUG RAW GENERAL HEADER: num_data_records='{raw_num_data_records_str}', duration_data_record='{raw_duration_data_record_str}', num_signals='{raw_num_signals_str}'")

            try:
                num_data_records = int(raw_num_data_records_str)
            except ValueError:
                print(f"Warning: Could not parse num_data_records from general header. Assuming 1 for {os.path.basename(filepath)}")
                num_data_records = 1
            
            try:
                duration_data_record = float(raw_duration_data_record_str)
                if duration_data_record <= 0:
                    print(f"Warning: Invalid duration_data_record ({duration_data_record}) found. Setting to 1.0 for {os.path.basename(filepath)}")
                    duration_data_record = 1.0
            except ValueError:
                print(f"Warning: Could not parse duration_data_record from general header. Assuming 1.0 for {os.path.basename(filepath)}")
                duration_data_record = 1.0
            
            try:
                num_signals = int(raw_num_signals_str)
            except ValueError:
                print(f"Warning: Could not parse num_signals from general header. Assuming 1 for {os.path.basename(filepath)}")
                num_signals = 1

            signal_headers = []
            for i in range(num_signals):
                signal_header_bytes = f.read(256)
                label = signal_header_bytes[0:16].decode('ascii').strip()
                transducer_type = signal_header_bytes[16:80].decode('ascii').strip()
                physical_dimension = signal_header_bytes[80:88].decode('ascii').strip()
                prefiltering = signal_header_bytes[120:168].decode('ascii').strip()
                
                raw_phys_min_str = signal_header_bytes[88:96].decode('ascii').strip()
                raw_phys_max_str = signal_header_bytes[96:104].decode('ascii').strip()
                raw_dig_min_str = signal_header_bytes[104:112].decode('ascii').strip()
                raw_dig_max_str = signal_header_bytes[112:120].decode('ascii').strip()
                raw_num_samples_str = signal_header_bytes[216:224].decode('ascii').strip()
                print(f"DEBUG RAW SIGNAL {i} '{label}': phys_min='{raw_phys_min_str}', phys_max='{raw_phys_max_str}', dig_min='{raw_dig_min_str}', dig_max='{raw_dig_max_str}', num_samples='{raw_num_samples_str}'")

                try:
                    physical_minimum = float(raw_phys_min_str)
                except ValueError:
                    print(f"Warning: Could not parse physical_minimum for signal '{label}'. Setting to 0.0.")
                    physical_minimum = 0.0
                
                try:
                    physical_maximum = float(raw_phys_max_str)
                except ValueError:
                    print(f"Warning: Could not parse physical_maximum for signal '{label}'. Setting to 1.0.")
                    physical_maximum = 1.0

                try:
                    digital_minimum = int(raw_dig_min_str)
                except ValueError:
                    print(f"Warning: Could not parse digital_minimum for signal '{label}'. Setting to 0.")
                    digital_minimum = 0

                try:
                    digital_maximum = int(raw_dig_max_str)
                except ValueError:
                    print(f"Warning: Could not parse digital_maximum for signal '{label}'. Setting to 1000.")
                    digital_maximum = 1000
                
                try:
                    num_samples_in_data_record = int(raw_num_samples_str)
                    if num_samples_in_data_record <= 0:
                         print(f"Warning: num_samples_in_data_record for signal '{label}' is zero or negative ({num_samples_in_data_record}).")
                         if label == 'Flow.40ms':
                             num_samples_in_data_record = 1500
                             print(f"Specific default for 'Flow.40ms' applied: {num_samples_in_data_record}.")
                         else:
                             num_samples_in_data_record = 50
                             print(f"General default applied: {num_samples_in_data_record}.")
                except ValueError:
                    print(f"Warning: Could not parse num_samples_in_data_record for signal '{label}'.")
                    if label == 'Flow.40ms':
                        num_samples_in_data_record = 1500
                        print(f"Specific default for 'Flow.40ms' applied: {num_samples_in_data_record}.")
                    else:
                        num_samples_in_data_record = 50
                        print(f"General default applied: {num_samples_in_data_record}.")


                signal_headers.append({
                    'label': label,
                    'physical_minimum': physical_minimum,
                    'physical_maximum': physical_maximum,
                    'digital_minimum': digital_minimum,
                    'digital_maximum': digital_maximum,
                    'num_samples_in_data_record': num_samples_in_data_record
                })

            if not signal_headers:
                raise ValueError("No signal headers found in EDF file.")
            
            if num_signals == 0:
                raise ValueError("Number of signals parsed as zero. Cannot proceed.")

            flow_signal_info = signal_headers[0]
            num_samples_for_flow = flow_signal_info['num_samples_in_data_record']

            if flow_signal_info['digital_maximum'] == flow_signal_info['digital_minimum']:
                print(f"Error: Digital min and max are equal for signal '{flow_signal_info['label']}'. Cannot calculate gain.")
                return None, None

            gain = (flow_signal_info['physical_maximum'] - flow_signal_info['physical_minimum']) / \
                   (flow_signal_info['digital_maximum'] - flow_signal_info['digital_minimum'])
            offset = flow_signal_info['physical_minimum'] - gain * flow_signal_info['digital_minimum']
            
            data_raw_digital = []
            for record_idx in range(num_data_records):
                current_record_data = []
                for signal_idx in range(num_signals):
                    samples_to_read = signal_headers[signal_idx]['num_samples_in_data_record']
                    
                    if samples_to_read <= 0:
                        f.seek(samples_to_read * 2, 1)
                        continue

                    record_data_bytes = f.read(samples_to_read * 2)
                    if len(record_data_bytes) != samples_to_read * 2:
                        print(f"Warning: Expected {samples_to_read * 2} bytes but read {len(record_data_bytes)} for signal '{signal_headers[signal_idx]['label']}' in record {record_idx}. Data might be truncated. Stopping read for this file.")
                        num_data_records = record_idx + 1
                        break
                    
                    try:
                        unpacked_data = struct.unpack('<' + 'h' * samples_to_read, record_data_bytes)
                        if signal_idx == 0:
                            data_raw_digital.extend(unpacked_data)
                    except struct.error as se:
                        print(f"Error unpacking data for signal '{signal_headers[signal_idx]['label']}' in record {record_idx}: {se}. Data might be corrupt. Stopping read for this file.")
                        num_data_records = record_idx + 1
                        break
                else:
                    continue
                break

            if len(data_raw_digital) == 0:
                print("Error: No flow data accumulated. Check EDF structure or flow signal index/parameters.")
                return None, None

            flow_data = np.array(data_raw_digital) * gain + offset
            
            if num_samples_for_flow > 0 and duration_data_record > 0:
                sampling_rate = num_samples_for_flow / duration_data_record
                print(f"DEBUG: Sampling rate derived from header: {sampling_rate:.2f} Hz (Samples per record: {num_samples_for_flow}, Duration per record: {duration_data_record})")
            elif len(flow_data) > 0 and num_data_records > 0 and duration_data_record > 0:
                estimated_total_duration_seconds = num_data_records * duration_data_record
                if estimated_total_duration_seconds > 0:
                    sampling_rate = len(flow_data) / estimated_total_duration_seconds
                    print(f"DEBUG: Sampling rate estimated from total data/duration: {sampling_rate:.2f} Hz (Total flow points: {len(flow_data)}, Estimated total duration: {estimated_total_duration_seconds:.2f}s)")
                else:
                    print("Warning: Could not estimate sampling rate from total duration. Setting to default 25 Hz.")
                    sampling_rate = 25.0
            else:
                print("Warning: Insufficient header info or data to reliably determine sampling rate. Setting to default 25 Hz.")
                sampling_rate = 25.0

            return flow_data, sampling_rate

    except Exception as e:
        print(f"Critical error reading EDF file {filepath}: {e}")
        return None, None

def derive_minute_ventilation(flow_data, sampling_rate):
    if flow_data is None or sampling_rate is None or sampling_rate <= 0:
        print("Invalid flow data or sampling rate provided for minute ventilation derivation.")
        return None

    integrated_flow = np.trapezoid(np.abs(flow_data), dx=1/sampling_rate)
    
    total_duration_seconds = len(flow_data) / sampling_rate
    total_duration_minutes = total_duration_seconds / 60

    if total_duration_minutes <= 0:
        print("Recording duration is zero or negative, cannot calculate minute ventilation.")
        return None
        
    minute_ventilation = integrated_flow / total_duration_minutes
    return minute_ventilation

def run_fft_and_find_dominant_frequency(data, sampling_rate, min_period_sec=30, max_period_sec=90):
    if len(data) == 0 or sampling_rate <= 0:
        print("Invalid data or sampling rate for FFT.")
        return None, None
    
    if len(data) < 2:
        print("Data length too short for FFT.")
        return None, None

    N = len(data)
    yf = np.fft.fft(data)
    xf = np.fft.fftfreq(N, 1 / sampling_rate)

    positive_freq_idx = np.where(xf > 0)
    xf_positive = xf[positive_freq_idx]
    yf_positive = np.abs(yf[positive_freq_idx])

    min_freq_hz = 1 / max_period_sec
    max_freq_hz = 1 / min_period_sec

    relevant_freq_indices = np.where((xf_positive >= min_freq_hz) & (xf_positive <= max_freq_hz))
    
    if len(relevant_freq_indices[0]) == 0:
        print(f"No frequencies found in the range {min_freq_hz:.4f}-{max_freq_hz:.4f} Hz (periods {min_period_sec}-{max_period_sec}s).")
        return None, None

    filtered_freqs = xf_positive[relevant_freq_indices]
    filtered_magnitudes = yf_positive[relevant_freq_indices]

    if len(filtered_magnitudes) == 0:
        print("No magnitudes found after frequency filtering.")
        return None, None

    dominant_freq_idx = np.argmax(filtered_magnitudes)
    dominant_frequency_hz = filtered_freqs[dominant_freq_idx]
    
    if dominant_frequency_hz == 0:
        dominant_period_sec = np.inf 
    else:
        dominant_period_sec = 1 / dominant_frequency_hz

    return dominant_frequency_hz, dominant_period_sec

def calculate_wave_metrics(flow_data, sampling_rate, dominant_period_sec):
    if dominant_period_sec is None or dominant_period_sec <= 0 or sampling_rate <= 0:
        print("Cannot calculate wave metrics without valid period or sampling rate.")
        return None, None, None, None, None
    
    smoothing_window_sec = 30 
    window_size_samples = int(smoothing_window_sec * sampling_rate)
    
    if window_size_samples < 1:
        window_size_samples = 1
    if window_size_samples > len(flow_data):
        window_size_samples = len(flow_data)

    print(f"DEBUG: Smoothing window for ventilation envelope: {smoothing_window_sec:.2f} seconds ({window_size_samples} samples)")

    smoothed_abs_flow = pd.Series(np.abs(flow_data)).rolling(window=window_size_samples, center=True, min_periods=1).mean().values

    # ADJUSTED: Min distance for find_peaks reduced to 5 seconds.
    min_dist_peak_samples = int(5 * sampling_rate) # Minimum 5 seconds between peaks
    if min_dist_peak_samples < 1:
        min_dist_peak_samples = 1

    # ADJUSTED: Prominence for peak finding reduced to 0.01 (was 0.05)
    peak_prominence_val = 0.01

    peaks, _ = find_peaks(smoothed_abs_flow, distance=min_dist_peak_samples, prominence=peak_prominence_val)
    troughs, _ = find_peaks(-smoothed_abs_flow, distance=min_dist_peak_samples, prominence=peak_prominence_val)

    print(f"DEBUG: Peak finding distance threshold: {min_dist_peak_samples} samples ({min_dist_peak_samples/sampling_rate:.2f}s)")
    print(f"DEBUG: Peak finding prominence threshold: {peak_prominence_val:.2f}")
    print(f"DEBUG: Found {len(peaks)} peaks and {len(troughs)} troughs on smoothed flow.")

    if len(peaks) < 1 or len(troughs) < 1:
        print("Not enough peaks or troughs detected for robust depth/period calculation. Returning defaults.")
        return 0, dominant_period_sec, smoothed_abs_flow, peaks, troughs

    matched_depths = []
    for p_idx in peaks:
        t_after_indices = troughs[troughs > p_idx]
        if len(t_after_indices) > 0:
            potential_trough_idx = t_after_indices[0] 
            if (potential_trough_idx - p_idx) / sampling_rate < (dominant_period_sec * 1.5):
                depth = smoothed_abs_flow[p_idx] - smoothed_abs_flow[potential_trough_idx]
                if depth > 0:
                    matched_depths.append(depth)
        
        t_before_indices = troughs[troughs < p_idx]
        if len(t_before_indices) > 0:
            potential_trough_idx = t_before_indices[-1]
            if (p_idx - potential_trough_idx) / sampling_rate < (dominant_period_sec * 1.5):
                depth = smoothed_abs_flow[p_idx] - smoothed_abs_flow[potential_trough_idx]
                if depth > 0:
                    matched_depths.append(depth)

    if not matched_depths:
        print("No valid peak-trough depths could be matched based on proximity. Calculating depth as (max_smoothed - min_smoothed).")
        if len(smoothed_abs_flow) > 0:
            average_depth = np.max(smoothed_abs_flow) - np.min(smoothed_abs_flow)
        else:
            average_depth = 0
    else:
        average_depth = np.mean(matched_depths)

    periods = []
    if len(peaks) >= 2:
        peak_intervals = np.diff(peaks) / sampling_rate
        expected_period_range = (dominant_period_sec * 0.5, dominant_period_sec * 1.5)
        valid_periods = [p for p in peak_intervals if expected_period_range[0] <= p <= expected_period_range[1]]
        if valid_periods:
            average_wave_period_sec = np.mean(valid_periods)
        else:
            print("No valid peak-to-peak periods found within expected range. Defaulting to dominant period.")
            average_wave_period_sec = dominant_period_sec
    else:
        print("Not enough peaks to calculate average wave period from peak-to-peak. Defaulting to dominant period.")
        average_wave_period_sec = dominant_period_sec
    
    if average_wave_period_sec is None or average_wave_period_sec <= 0:
        average_wave_period_sec = dominant_period_sec

    return average_depth, average_wave_period_sec, smoothed_abs_flow, peaks, troughs

def find_periodic_segments(flow_data, sampling_rate, dominant_period_sec, smoothed_abs_flow, peaks, troughs, min_cycles=2, amplitude_threshold_percent=20, period_tolerance_percent=30):
    if dominant_period_sec is None or dominant_period_sec <= 0 or dominant_period_sec == np.inf or \
       smoothed_abs_flow is None or len(smoothed_abs_flow) == 0:
        print("Cannot find periodic segments without valid data, period, or smoothed flow.")
        return 0, 0, []

    total_duration_sec = len(flow_data) / sampling_rate
    
    mean_smoothed_flow = np.mean(smoothed_abs_flow)
    min_amplitude_for_periodicity = mean_smoothed_flow * (amplitude_threshold_percent / 100.0)

    period_lower_bound = dominant_period_sec * (1 - period_tolerance_percent / 100.0)
    period_upper_bound = dominant_period_sec * (1 + period_tolerance_percent / 100.0)

    periodic_segments_indices = []
    
    current_segment_start_idx = None
    consecutive_valid_cycles_count = 0
    
    peaks = np.sort(peaks)
    troughs = np.sort(troughs)

    print(f"Periodic amplitude threshold (absolute): {min_amplitude_for_periodicity:.2f} (from {amplitude_threshold_percent}% of mean smoothed flow: {mean_smoothed_flow:.2f})")
    print(f"Expected cycle period range: {period_lower_bound:.2f}s to {period_upper_bound:.2f}s (Dominant: {dominant_period_sec:.2f}s, Tolerance: {period_tolerance_percent}%)")
    print(f"Minimum consecutive cycles for tagging: {min_cycles}")

    passed_period_check_count = 0
    passed_amplitude_check_count = 0
    passed_both_count = 0
    
    debug_cycle_periods = []

    for i in range(len(peaks) - 1):
        peak_start_idx = peaks[i]
        peak_end_idx = peaks[i+1]

        current_cycle_period_sec = (peak_end_idx - peak_start_idx) / sampling_rate
        debug_cycle_periods.append(current_cycle_period_sec) 

        is_period_valid = (period_lower_bound <= current_cycle_period_sec <= period_upper_bound)
        if is_period_valid:
            passed_period_check_count += 1

        troughs_in_cycle_indices = troughs[(troughs > peak_start_idx) & (troughs < peak_end_idx)]
        
        is_amplitude_valid = False
        current_cycle_amplitude = 0 
        if len(troughs_in_cycle_indices) > 0:
            peak_val = smoothed_abs_flow[peak_start_idx]
            trough_val = np.min(smoothed_abs_flow[troughs_in_cycle_indices])
            current_cycle_amplitude = peak_val - trough_val
            is_amplitude_valid = (current_cycle_amplitude >= min_amplitude_for_periodicity)
        if is_amplitude_valid:
            passed_amplitude_check_count += 1
        
        if is_period_valid and is_amplitude_valid:
            passed_both_count += 1
            consecutive_valid_cycles_count += 1
            if current_segment_start_idx is None:
                current_segment_start_idx = peak_start_idx
        else:
            if consecutive_valid_cycles_count >= min_cycles:
                periodic_segments_indices.append((current_segment_start_idx, peaks[i]))
            consecutive_valid_cycles_count = 0
            current_segment_start_idx = None
    
    if current_segment_start_idx is not None and consecutive_valid_cycles_count >= min_cycles:
        periodic_segments_indices.append((current_segment_start_idx, peaks[-1]))

    total_periodic_time_sec = 0
    for start_idx, end_idx in periodic_segments_indices:
        total_periodic_time_sec += (end_idx - start_idx) / sampling_rate

    if total_duration_sec > 0:
        periodic_percentage = (total_periodic_time_sec / total_duration_sec) * 100
    else:
        periodic_percentage = 0

    print(f"DEBUG Summary:")
    print(f"  Cycles analyzed: {len(peaks) - 1 if len(peaks) > 0 else 0}") # Handle empty peaks list
    print(f"  Cycles passing period check: {passed_period_check_count}")
    print(f"  Cycles passing amplitude check: {passed_amplitude_check_count}")
    print(f"  Cycles passing BOTH checks: {passed_both_count}")
    print(f"  First 10 calculated cycle periods (sec): {[f'{p:.2f}' for p in debug_cycle_periods[:10]]}") # Format for readability


    return total_periodic_time_sec, periodic_percentage, periodic_segments_indices

def plot_periodic_segments(flow_data, sampling_rate, smoothed_abs_flow, peaks, troughs, periodic_segments_indices, filename):
    """
    Plots the smoothed flow, detected peaks/troughs, and shades identified periodic segments.
    """
    if flow_data is None or sampling_rate is None or sampling_rate <= 0:
        print("Cannot plot: Invalid flow data or sampling rate.")
        return

    time_axis = np.arange(len(smoothed_abs_flow)) / sampling_rate 

    plt.figure(figsize=(15, 6))
    plt.plot(time_axis, smoothed_abs_flow, label='Smoothed Absolute Flow (Ventilation Envelope)', color='blue', alpha=0.7)
    
    if len(peaks) > 0:
        plt.plot(time_axis[peaks], smoothed_abs_flow[peaks], 'o', label='Peaks', color='green', markersize=4)
    if len(troughs) > 0:
        plt.plot(time_axis[troughs], smoothed_abs_flow[troughs], 'o', label='Troughs', color='red', markersize=4)

    for start_idx, end_idx in periodic_segments_indices:
        plt.axvspan(time_axis[start_idx], time_axis[end_idx], color='yellow', alpha=0.3, lw=0)

    plt.title(f'Smoothed Flow with Detected Periodic Segments for {os.path.basename(filename)}')
    plt.xlabel('Time (seconds)')
    plt.ylabel('Smoothed Absolute Flow (L/s)')
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    filepath = select_single_file()

    if not filepath:
        print("No file selected. Exiting script.")
    else:
        filename = os.path.basename(filepath)
        print(f"\nSelected file: {filename}")

        if not filename.lower().endswith(".edf"):
            print(f"Warning: The selected file '{filename}' does not have an .edf extension. This script is designed for EDF files.")
            print("Please ensure you select an appropriate file type.")
        
        file_pattern = re.compile(r'^\d{8}_\d{6}_BRP\.edf$', re.IGNORECASE)
        if not file_pattern.match(filename):
            print(f"Warning: The selected file '{filename}' does not match the expected naming convention (YYYYMMDD_HHMMSS_BRP.edf).")
            print("While processing may proceed, results might be unexpected if it's not a BRP flow file.")

        flow_data, sampling_rate = read_edf(filepath)

        if flow_data is not None and sampling_rate is not None and sampling_rate > 0:
            print(f"\n--- Post-read Data Summary ---")
            print(f"Final Determined Sampling Rate: {sampling_rate:.2f} Hz")
            print(f"Total flow data points collected: {len(flow_data)}")
            
            actual_total_duration_seconds = len(flow_data) / sampling_rate
            print(f"Actual total recording duration (based on collected data and final SR): {actual_total_duration_seconds:.2f} seconds")

            mv = derive_minute_ventilation(flow_data, sampling_rate)
            if mv is not None:
                print(f"Derived Minute Ventilation: {mv:.2f} L/min")
            else:
                print("Could not derive Minute Ventilation.")

            print("\n--- Starting FFT and Periodicity Analysis ---")
            dominant_freq_hz, dominant_period_sec = run_fft_and_find_dominant_frequency(
                flow_data, sampling_rate, min_period_sec=30, max_period_sec=90
            )

            if dominant_period_sec is not None and dominant_period_sec != np.inf:
                print(f"Dominant Frequency: {dominant_freq_hz:.4f} Hz (Period: {dominant_period_sec:.2f} seconds)")
                
                average_depth, average_wave_period, smoothed_abs_flow, peaks, troughs = calculate_wave_metrics(flow_data, sampling_rate, dominant_period_sec)
                
                if average_depth is not None and average_wave_period is not None:
                    print(f"\n--- Wave Metrics (Depth & Average Period) ---")
                    print(f"Average Peak-Trough Distance (Depth): {average_depth:.2f}")
                    print(f"Average Wave Period: {average_wave_period:.2f} seconds")

                    print("\n--- Refined Periodicity Tagging ---")
                    total_periodic_time, periodic_percentage, periodic_segments_indices = find_periodic_segments(
                        flow_data, sampling_rate, dominant_period_sec, smoothed_abs_flow, peaks, troughs,
                        min_cycles=2,              
                        amplitude_threshold_percent=0.1, 
                        period_tolerance_percent=80 
                    )
                    print(f"Total time tagged as periodic: {total_periodic_time:.2f} seconds")
                    print(f"Percentage of recording periodic: {periodic_percentage:.2f}%")
                    print(f"Found {len(periodic_segments_indices)} periodic segments.")

                    plot_periodic_segments(flow_data, sampling_rate, smoothed_abs_flow, peaks, troughs, periodic_segments_indices, filename)

                else:
                    print("Could not reliably calculate average wave metrics, skipping refined periodicity tagging.")

            else:
                print("Could not find a dominant frequency in the specified range or dominant period is infinite. Skipping further periodicity and wave analysis.")

        else:
            print(f"Failed to process {filename}. Skipping further analysis for this file due to critical read errors or invalid sampling rate.")