'use client';

import { useState, useRef, useEffect } from 'react';
import { Delaunay } from 'd3-delaunay';
import Drawing from 'dxf-writer';

interface Point {
  x: number;
  y: number;
}

export default function VoronoiDesigner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [numPoints, setNumPoints] = useState(30);
  const [showPoints, setShowPoints] = useState(true);
  const [showVoronoi, setShowVoronoi] = useState(true);
  const [showDelaunay, setShowDelaunay] = useState(false);
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [seed, setSeed] = useState(Date.now());

  // Export options
  const [exportVoronoi, setExportVoronoi] = useState(true);
  const [exportDelaunay, setExportDelaunay] = useState(false);
  const [exportPoints, setExportPoints] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);

  // Generate random points with seeded randomization
  const generateRandomPoints = (count: number, seedValue: number) => {
    // Simple seeded random number generator
    let seededRandom = (function (seed: number) {
      return function () {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
    })(seedValue);

    const newPoints: Point[] = [];
    const margin = 20;

    for (let i = 0; i < count; i++) {
      newPoints.push({
        x: margin + seededRandom() * (canvasSize.width - 2 * margin),
        y: margin + seededRandom() * (canvasSize.height - 2 * margin)
      });
    }
    return newPoints;
  };

  // Generate new pattern
  const generatePattern = () => {
    const randomPoints = generateRandomPoints(numPoints, seed);
    setPoints(randomPoints);
  };

  // Update canvas size based on container
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth - 24; // Account for padding
        const aspectRatio = 4 / 3; // 4:3 aspect ratio
        const newHeight = containerWidth / aspectRatio;

        setCanvasSize({
          width: containerWidth,
          height: Math.max(400, Math.min(600, newHeight)) // Min 400px, max 600px height
        });
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Initialize with random points
  useEffect(() => {
    generatePattern();
  }, [numPoints, seed, canvasSize]);

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    // Create Delaunay triangulation
    const delaunay = Delaunay.from(points.map(p => [p.x, p.y]));
    const voronoi = delaunay.voronoi([0, 0, canvasSize.width, canvasSize.height]);

    // Draw Voronoi diagram
    if (showVoronoi) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      voronoi.render(ctx);
      ctx.stroke();
    }

    // Draw Delaunay triangulation
    if (showDelaunay) {
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      delaunay.render(ctx);
      ctx.stroke();
    }

    // Draw points
    if (showPoints) {
      ctx.fillStyle = '#1f2937';
      points.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  }, [points, showPoints, showVoronoi, showDelaunay, strokeWidth]);

  // Add point on canvas click
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setPoints([...points, { x, y }]);
  };

  // Clear all points
  const clearPoints = () => {
    setPoints([]);
  };

  // Export to DXF
  const exportToDXF = () => {
    if (points.length === 0) return;

    const drawing = new Drawing();

    // Create Delaunay triangulation and Voronoi diagram
    const delaunay = Delaunay.from(points.map(p => [p.x, p.y]));
    const voronoi = delaunay.voronoi([0, 0, canvasSize.width, canvasSize.height]);

    // Add Voronoi cells to DXF
    if (exportVoronoi) {
      for (let i = 0; i < points.length; i++) {
        const cell = voronoi.cellPolygon(i);
        if (cell && cell.length > 2) {
          // Create polyline for each cell
          for (let j = 0; j < cell.length; j++) {
            const start = cell[j];
            const end = cell[(j + 1) % cell.length];
            drawing.drawLine(start[0], start[1], end[0], end[1]);
          }
        }
      }
    }

    // Add Delaunay triangles to DXF
    if (exportDelaunay) {
      for (let i = 0; i < delaunay.triangles.length; i += 3) {
        const p1 = points[delaunay.triangles[i]];
        const p2 = points[delaunay.triangles[i + 1]];
        const p3 = points[delaunay.triangles[i + 2]];

        drawing.drawLine(p1.x, p1.y, p2.x, p2.y);
        drawing.drawLine(p2.x, p2.y, p3.x, p3.y);
        drawing.drawLine(p3.x, p3.y, p1.x, p1.y);
      }
    }

    // Add points to DXF
    if (exportPoints) {
      points.forEach(point => {
        drawing.drawPoint(point.x, point.y);
      });
    }

    // Download DXF file
    const dxfString = drawing.toDxfString();
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voronoi-pattern-${Date.now()}.dxf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Generate new seed
  const randomizeSeed = () => {
    setSeed(Date.now());
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-8 text-center">
          Voronoi Pattern Designer
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Controls Panel */}
          <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
            <h2 className="text-xl font-semibold text-gray-800">Controls</h2>

            {/* Number of Points */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Points: {numPoints}
              </label>
              <input
                type="range"
                min="10"
                max="200"
                value={numPoints}
                onChange={(e) => setNumPoints(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Stroke Width */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Line Width: {strokeWidth}px
              </label>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.5"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Display Options */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700">Display Options</h3>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showVoronoi}
                  onChange={(e) => setShowVoronoi(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Show Voronoi</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showDelaunay}
                  onChange={(e) => setShowDelaunay(e.target.checked)}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="ml-2 text-sm text-gray-700">Show Delaunay</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showPoints}
                  onChange={(e) => setShowPoints(e.target.checked)}
                  className="rounded border-gray-300 text-gray-600 focus:ring-gray-500"
                />
                <span className="ml-2 text-sm text-gray-700">Show Points</span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={generatePattern}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Generate New Pattern
              </button>

              <button
                onClick={randomizeSeed}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Randomize Seed
              </button>

              <button
                onClick={clearPoints}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Clear All Points
              </button>

              <div className="space-y-2">
                <button
                  onClick={() => setShowExportOptions(!showExportOptions)}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-between"
                >
                  <span>Export Options</span>
                  <svg
                    className={`w-4 h-4 transition-transform ${showExportOptions ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showExportOptions && (
                  <div className="space-y-3 p-3 bg-gray-50 rounded-lg border">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportVoronoi}
                        onChange={(e) => setExportVoronoi(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Export Voronoi Lines</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportDelaunay}
                        onChange={(e) => setExportDelaunay(e.target.checked)}
                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Export Delaunay Lines</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportPoints}
                        onChange={(e) => setExportPoints(e.target.checked)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Export Points</span>
                    </label>
                  </div>
                )}

                <button
                  onClick={exportToDXF}
                  disabled={points.length === 0 || (!exportVoronoi && !exportDelaunay && !exportPoints)}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Export to DXF
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="text-xs text-gray-500 space-y-1">
              <p>• Click on the canvas to add points manually</p>
              <p>• Use the controls to adjust the pattern</p>
              <p>• Export to DXF for use in CAD software</p>
            </div>
          </div>

          {/* Canvas */}
          <div className="lg:col-span-3 bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Pattern Preview</h2>
              <div className="text-sm text-gray-500">
                {points.length} points • Click to add more
              </div>
            </div>

            <div
              ref={containerRef}
              className="border-2 border-gray-200 rounded-lg overflow-hidden"
            >
              <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                onClick={handleCanvasClick}
                className="cursor-crosshair bg-white w-full block"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
