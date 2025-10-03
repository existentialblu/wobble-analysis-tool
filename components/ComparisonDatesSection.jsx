import React from 'react';

/**
 * Comparison dates management for tracking therapy changes
 */
const ComparisonDatesSection = ({
  comparisonDates,
  onAdd,
  onRemove,
  onUpdate
}) => {
  const handleKeyPress = (e, idx) => {
    // Only submit on Enter if the label field has text
    if (e.key === 'Enter' && comparisonDates[idx].label.trim()) {
      e.preventDefault();
      onAdd();
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 mb-6 border border-white/20">
      <h3 className="text-xl font-bold text-white mb-4">Comparison Dates</h3>
      <p className="text-white text-sm mb-4">Mark therapy changes, equipment adjustments, or other significant events</p>

      {comparisonDates.map((cd, idx) => (
        <div key={idx} className="mb-4 p-4 bg-white/5 rounded border border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
            <div>
              <label className="block text-white text-sm font-semibold mb-2">Date</label>
              <input
                type="date"
                value={cd.date}
                onChange={(e) => onUpdate(idx, 'date', e.target.value)}
                className="bg-slate-800 text-white border border-blue-400 rounded px-4 py-2 w-full"
              />
            </div>
            <div>
              <label className="block text-white text-sm font-semibold mb-2">
                Label (optional, max 50 chars)
              </label>
              <input
                type="text"
                value={cd.label}
                onChange={(e) => onUpdate(idx, 'label', e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, idx)}
                placeholder="e.g., Switched to ASV"
                maxLength={50}
                className="bg-slate-800 text-white border border-blue-400 rounded px-4 py-2 w-full"
              />
            </div>
          </div>
          {comparisonDates.length > 1 && (
            <button
              onClick={() => onRemove(idx)}
              className="bg-red-500 hover:bg-red-600 text-white text-sm py-1 px-3 rounded"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      <button
        onClick={onAdd}
        className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded transition-colors"
      >
        + Add Another Comparison Date
      </button>
    </div>
  );
};

export default ComparisonDatesSection;
