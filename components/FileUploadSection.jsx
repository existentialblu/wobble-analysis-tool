import React from 'react';
import { Upload } from 'lucide-react';

/**
 * File upload interface with batch and individual processing modes
 */
const FileUploadSection = ({
  onFileUpload,
  files,
  processing,
  progress,
  error,
  info,
  onReset,
  hasResults,
  minDurationMinutes,
  setMinDurationMinutes
}) => {
  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 mb-6 border border-white/20">
      <h3 className="text-xl font-bold text-white mb-4 text-center">Processing Settings</h3>

      <div className="mb-6 max-w-md mx-auto">
        <label className="block text-white text-sm font-semibold mb-2">
          Minimum Session Duration (minutes)
        </label>
        <input
          type="number"
          value={minDurationMinutes}
          onChange={(e) => setMinDurationMinutes(Math.max(1, parseInt(e.target.value) || 1))}
          className="bg-slate-800 text-white border border-blue-400 rounded px-4 py-2 w-full"
          min="1"
        />
        <p className="text-blue-200 text-xs mt-2">
          Sessions shorter than this will be skipped during processing
        </p>
      </div>

      <h3 className="text-xl font-bold text-white mb-4 text-center">Upload Files</h3>

      <div className="flex justify-center">
        <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:bg-white/5 max-w-md w-full">
          <div className="flex flex-col items-center justify-center text-center">
            <Upload className="w-12 h-12 text-blue-200 mb-3" />
            <p className="text-lg text-white font-semibold mb-2">
              Select Files or Folder
            </p>
            <p className="text-sm text-blue-200">
              Choose individual files, multiple files, or an entire folder
            </p>
          </div>
          <input
            type="file"
            className="hidden"
            accept=".edf"
            multiple
            webkitdirectory=""
            directory=""
            onChange={onFileUpload}
          />
        </label>
      </div>

      {hasResults && (
        <div className="mt-6 text-center">
          <button
            onClick={onReset}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
          >
            🗑️ Clear All Data & Reset
          </button>
          <p className="text-red-200 text-xs mt-2">This will remove all processed sessions and start fresh</p>
        </div>
      )}

      {files.length > 0 && <p className="text-white text-sm mt-4">Found {files.length} valid files</p>}

      {processing && (
        <div className="mt-4">
          <div className="flex justify-between text-white text-sm mb-2">
            <span>Processing...</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="w-full bg-blue-950 rounded-full h-2">
            <div className="bg-blue-400 h-2 rounded-full" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded p-4 mt-4">
          <p className="text-red-200">Error: {error}</p>
        </div>
      )}

      {info && (
        <div className="bg-blue-500/20 border border-blue-400 rounded p-4 mt-4">
          <p className="text-blue-200">{info}</p>
        </div>
      )}
    </div>
  );
};

export default FileUploadSection;
