/* ═══════════════════════════════════════════════════════════════════════
   FrequencyChart.jsx — Real-time line chart comparing local vs. global
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import './FrequencyChart.css';

const NODE_COLORS = ['#06d6a0', '#3b82f6', '#f59e0b', '#8b5cf6'];
const GLOBAL_COLOR = '#ef4444';
const MAX_DATA_POINTS = 40;

export default function FrequencyChart({ contract }) {
  const [chartData, setChartData] = useState([]);
  const [isLive, setIsLive] = useState(true);
  const dataRef = useRef([]);

  // Generate simulated local frequency data for display
  const generateLocalFreq = useCallback((nodeId, time) => {
    const baseAmplitude = [0.08, 0.12, 0.05, 0.15][nodeId - 1];
    const phaseShift = [0, 0.7, 1.4, 2.1][nodeId - 1];
    const noise = (Math.random() - 0.5) * 0.04;
    return 50 + baseAmplitude * Math.sin(time * 0.3 + phaseShift) + noise;
  }, []);

  // Poll contract for global frequency from latest completed round
  const fetchGlobalFreq = useCallback(async () => {
    if (!contract) return null;
    try {
      const currentRound = Number(await contract.getCurrentRound());
      if (currentRound <= 1) return null;
      const result = await contract.getResult(currentRound - 1);
      return Number(result.globalFrequency) / 1000;
    } catch (e) {
      return null;
    }
  }, [contract]);

  useEffect(() => {
    if (!isLive) return;

    let tick = dataRef.current.length;

    const interval = setInterval(async () => {
      tick++;
      const globalFreq = await fetchGlobalFreq();

      const point = {
        time: tick,
        label: `T${tick}`,
        node1: generateLocalFreq(1, tick),
        node2: generateLocalFreq(2, tick),
        node3: generateLocalFreq(3, tick),
        node4: generateLocalFreq(4, tick),
        global: globalFreq || 50.0,
      };

      dataRef.current = [...dataRef.current.slice(-MAX_DATA_POINTS + 1), point];
      setChartData([...dataRef.current]);
    }, 2000);

    return () => clearInterval(interval);
  }, [isLive, fetchGlobalFreq, generateLocalFreq]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null;
    return (
      <div className="chart-tooltip">
        <p className="tooltip-label">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="tooltip-item" style={{ color: p.color }}>
            <span className="tooltip-dot" style={{ background: p.color }} />
            {p.name}: <strong>{Number(p.value).toFixed(4)} Hz</strong>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="chart-container">
      <div className="chart-header">
        <div className="chart-title-group">
          <h2 className="chart-title">
            <span className="chart-icon">📈</span>
            Frequency Monitor
          </h2>
          <p className="chart-subtitle">
            Mutable local frequencies vs. immutable on-chain global frequency
          </p>
        </div>
        <div className="chart-controls">
          <button
            className={`live-toggle ${isLive ? 'active' : ''}`}
            onClick={() => setIsLive(!isLive)}
          >
            <span className={`live-dot ${isLive ? 'live' : ''}`} />
            {isLive ? 'LIVE' : 'PAUSED'}
          </button>
          <div className="nominal-badge">
            Nominal: <strong>50.000 Hz</strong>
          </div>
        </div>
      </div>

      <div className="chart-body">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.08)" />
            <XAxis
              dataKey="label"
              stroke="var(--text-muted)"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={{ stroke: 'var(--border-subtle)' }}
            />
            <YAxis
              domain={[49.7, 50.3]}
              stroke="var(--text-muted)"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={{ stroke: 'var(--border-subtle)' }}
              tickFormatter={(v) => v.toFixed(2)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }}
              iconType="circle"
              iconSize={8}
            />
            <ReferenceLine
              y={50}
              stroke="rgba(148, 163, 184, 0.3)"
              strokeDasharray="8 4"
              label={{ value: '50 Hz', fill: 'var(--text-muted)', fontSize: 10, position: 'left' }}
            />
            <Line
              type="monotone" dataKey="node1" name="Node 1 (Solar)"
              stroke={NODE_COLORS[0]} strokeWidth={1.5}
              dot={false} activeDot={{ r: 4, strokeWidth: 2 }}
              connectNulls
            />
            <Line
              type="monotone" dataKey="node2" name="Node 2 (Wind)"
              stroke={NODE_COLORS[1]} strokeWidth={1.5}
              dot={false} activeDot={{ r: 4, strokeWidth: 2 }}
              connectNulls
            />
            <Line
              type="monotone" dataKey="node3" name="Node 3 (Battery)"
              stroke={NODE_COLORS[2]} strokeWidth={1.5}
              dot={false} activeDot={{ r: 4, strokeWidth: 2 }}
              connectNulls
            />
            <Line
              type="monotone" dataKey="node4" name="Node 4 (Diesel)"
              stroke={NODE_COLORS[3]} strokeWidth={1.5}
              dot={false} activeDot={{ r: 4, strokeWidth: 2 }}
              connectNulls
            />
            <Line
              type="stepAfter" dataKey="global" name="Global (On-Chain)"
              stroke={GLOBAL_COLOR} strokeWidth={3}
              dot={false} activeDot={{ r: 6, strokeWidth: 3 }}
              strokeDasharray="0"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-legend-extra">
        <div className="legend-item">
          <span className="legend-line fluctuating" />
          <span>Local (mutable, fluctuating)</span>
        </div>
        <div className="legend-item">
          <span className="legend-line immutable" />
          <span>Global (immutable, on-chain)</span>
        </div>
      </div>
    </div>
  );
}
