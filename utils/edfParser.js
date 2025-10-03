/**
 * EDF (European Data Format) Parser
 * Parses sleep study data files and extracts flow signals
 */

export const parseEDF = async (buffer) => {
  const view = new DataView(buffer);
  const decoder = new TextDecoder('ascii');

  let offset = 0;
  const header = {
    version: decoder.decode(new Uint8Array(buffer, offset, 8)).trim(),
    patientId: decoder.decode(new Uint8Array(buffer, offset + 8, 80)).trim(),
    recordingId: decoder.decode(new Uint8Array(buffer, offset + 88, 80)).trim(),
    startDate: decoder.decode(new Uint8Array(buffer, offset + 168, 8)).trim(),
    startTime: decoder.decode(new Uint8Array(buffer, offset + 176, 8)).trim(),
    headerBytes: parseInt(decoder.decode(new Uint8Array(buffer, offset + 184, 8)).trim()),
    reserved: decoder.decode(new Uint8Array(buffer, offset + 192, 44)).trim(),
    numDataRecords: parseInt(decoder.decode(new Uint8Array(buffer, offset + 236, 8)).trim()),
    recordDuration: parseFloat(decoder.decode(new Uint8Array(buffer, offset + 244, 8)).trim()),
    numSignals: parseInt(decoder.decode(new Uint8Array(buffer, offset + 252, 4)).trim())
  };

  const totalDurationMinutes = (header.numDataRecords * header.recordDuration) / 60;

  const dateParts = header.startDate.split('.');
  let year = parseInt(dateParts[2]);
  if (year < 100) {
    year += (year < 85) ? 2000 : 1900;
  }
  const recordingDate = new Date(year, parseInt(dateParts[1]) - 1, parseInt(dateParts[0]));

  offset = 256;
  const signals = [];

  for (let i = 0; i < header.numSignals; i++) {
    const label = decoder.decode(new Uint8Array(buffer, offset + i * 16, 16)).trim();
    signals.push({ label });
  }

  offset += header.numSignals * 16;

  for (let i = 0; i < header.numSignals; i++) {
    signals[i].transducer = decoder.decode(new Uint8Array(buffer, offset + i * 80, 80)).trim();
  }
  offset += header.numSignals * 80;

  for (let i = 0; i < header.numSignals; i++) {
    signals[i].physicalDimension = decoder.decode(new Uint8Array(buffer, offset + i * 8, 8)).trim();
  }
  offset += header.numSignals * 8;

  for (let i = 0; i < header.numSignals; i++) {
    signals[i].physicalMin = parseFloat(decoder.decode(new Uint8Array(buffer, offset + i * 8, 8)).trim());
  }
  offset += header.numSignals * 8;

  for (let i = 0; i < header.numSignals; i++) {
    signals[i].physicalMax = parseFloat(decoder.decode(new Uint8Array(buffer, offset + i * 8, 8)).trim());
  }
  offset += header.numSignals * 8;

  for (let i = 0; i < header.numSignals; i++) {
    signals[i].digitalMin = parseInt(decoder.decode(new Uint8Array(buffer, offset + i * 8, 8)).trim());
  }
  offset += header.numSignals * 8;

  for (let i = 0; i < header.numSignals; i++) {
    signals[i].digitalMax = parseInt(decoder.decode(new Uint8Array(buffer, offset + i * 8, 8)).trim());
  }
  offset += header.numSignals * 8;

  for (let i = 0; i < header.numSignals; i++) {
    signals[i].prefiltering = decoder.decode(new Uint8Array(buffer, offset + i * 80, 80)).trim();
  }
  offset += header.numSignals * 80;

  for (let i = 0; i < header.numSignals; i++) {
    signals[i].numSamples = parseInt(decoder.decode(new Uint8Array(buffer, offset + i * 8, 8)).trim());
  }
  offset += header.numSignals * 8;

  for (let i = 0; i < header.numSignals; i++) {
    signals[i].reserved = decoder.decode(new Uint8Array(buffer, offset + i * 32, 32)).trim();
  }

  const flowSignalIdx = signals.findIndex(s =>
    s.label.toLowerCase().includes('flow') ||
    s.label.toLowerCase().includes('flw')
  );

  if (flowSignalIdx === -1) {
    throw new Error('No flow signal found');
  }

  const flowSignal = signals[flowSignalIdx];
  const samplesPerRecord = flowSignal.numSamples;
  const samplingRate = samplesPerRecord / header.recordDuration;

  offset = header.headerBytes;
  const flowData = [];

  for (let record = 0; record < header.numDataRecords; record++) {
    let recordOffset = offset;

    for (let sig = 0; sig < flowSignalIdx; sig++) {
      recordOffset += signals[sig].numSamples * 2;
    }

    for (let sample = 0; sample < samplesPerRecord; sample++) {
      const digitalValue = view.getInt16(recordOffset + sample * 2, true);
      const physicalValue = (digitalValue - flowSignal.digitalMin) *
        (flowSignal.physicalMax - flowSignal.physicalMin) /
        (flowSignal.digitalMax - flowSignal.digitalMin) +
        flowSignal.physicalMin;
      flowData.push(physicalValue);
    }

    offset += signals.reduce((sum, sig) => sum + sig.numSamples * 2, 0);
  }

  return { flowData, samplingRate, recordingDate, durationMinutes: totalDurationMinutes };
};
