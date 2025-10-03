import React, { useState } from 'react';

/**
 * Collapsible table showing individual session results
 */
const ResultsTable = ({ results }) => {
  const [showTable, setShowTable] = useState(false);

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 mb-6 border border-white/20">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-white">Individual Session Results</h3>
        <button
          onClick={() => setShowTable(!showTable)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded transition-colors"
        >
          {showTable ? '▲ Hide Table' : '▼ Show Table'}
        </button>
      </div>

      {showTable && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-white">
              <thead className="border-b border-white/20">
                <tr>
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-left py-3 px-4">Filename</th>
                  <th className="text-center py-3 px-4">Duration</th>
                  <th className="text-center py-3 px-4">Flow Limitation</th>
                  <th className="text-center py-3 px-4">Regularity</th>
                  <th className="text-center py-3 px-4">Periodicity</th>
                  <th className="text-center py-3 px-4">EAI</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, idx) => (
                  <tr key={idx} className="border-b border-white/10 hover:bg-white/5">
                    <td className="py-3 px-4">{result.date.toLocaleDateString()}</td>
                    <td className="py-3 px-4 text-xs text-blue-200">{result.filename}</td>
                    <td className="py-3 px-4 text-center text-sm">
                      {result.durationMinutes >= 60
                        ? `${(result.durationMinutes / 60).toFixed(1)}h`
                        : `${Math.round(result.durationMinutes)}m`
                      }
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-orange-300">{result.flScore.toFixed(1)}</td>
                    <td className="py-3 px-4 text-center font-semibold text-green-300">{result.regularityScore.toFixed(1)}</td>
                    <td className="py-3 px-4 text-center font-semibold text-blue-300">{result.periodicityIndex.toFixed(1)}</td>
                    <td className="py-3 px-4 text-center font-semibold text-purple-300">{result.eai.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-blue-200 text-xs mt-4">
            Total sessions analyzed: {results.length} | You can continue adding more files to expand your dataset
          </p>
        </>
      )}

      {!showTable && (
        <p className="text-blue-200 text-sm">
          {results.length} sessions analyzed | Click "Show Table" to view individual results
        </p>
      )}
    </div>
  );
};

export default ResultsTable;
