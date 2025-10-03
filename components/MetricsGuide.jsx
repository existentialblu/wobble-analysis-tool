import React from 'react';

/**
 * Educational component explaining the metrics
 */
const MetricsGuide = () => {
  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20 mt-6">
      <h3 className="text-2xl font-bold text-white mb-4 text-center">Understanding Your Metrics</h3>

      <div className="space-y-4 text-white">
        <div className="border-l-4 border-orange-400 pl-4">
          <h4 className="text-lg font-bold text-orange-400 mb-2">Flow Limitation Score (0-100)</h4>
          <p className="text-sm leading-relaxed">
            Measures mechanical upper airway obstruction by analyzing inspiratory flow shape.
            Higher scores indicate more flattened flow patterns, suggesting increased resistance
            in the upper airway during breathing.
          </p>
        </div>

        <div className="border-l-4 border-green-400 pl-4">
          <h4 className="text-lg font-bold text-green-400 mb-2">Regularity Score (0-100)</h4>
          <p className="text-sm leading-relaxed">
            Measures ventilatory control stability using Sample Entropy. Higher scores indicate
            more predictable and repetitive breathing patterns, which paradoxically suggests
            unstable ventilatory control (high loop gain/wobble). Lower scores suggest more
            variable, naturally irregular breathing.
          </p>
        </div>

        <div className="border-l-4 border-blue-400 pl-4">
          <h4 className="text-lg font-bold text-blue-400 mb-2">Periodicity Index (0-100)</h4>
          <p className="text-sm leading-relaxed">
            Measures oscillatory content in the periodic breathing frequency range (0.01-0.03 Hz,
            or roughly 30-100 second cycles). Higher values indicate more periodic breathing
            patterns, which can be associated with central sleep apnea or unstable ventilatory control.
          </p>
        </div>

        <div className="border-l-4 border-purple-400 pl-4">
          <h4 className="text-lg font-bold text-purple-400 mb-2">Estimated Arousal Index (EAI)</h4>
          <p className="text-sm leading-relaxed">
            Estimates respiratory-related arousals per hour based on sudden increases in breathing
            rate or tidal volume. This is experimental and not validated against polysomnography.
            Unlike true arousal scoring which requires EEG, this metric only detects respiratory
            pattern changes. Use for tracking trends over time, not for diagnostic purposes.
          </p>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mt-6">
          <p className="text-sm text-blue-100 leading-relaxed">
            <strong>⚠️ Important Note:</strong> These are <strong>arbitrary scales</strong> developed
            through community research and will be refined over time with input from a broader range
            of users and clinical data. The thresholds and interpretations are subject to change as
            we learn more about what these patterns mean for different individuals. Use these metrics
            as relative indicators of change over time rather than absolute diagnostic values.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MetricsGuide;
