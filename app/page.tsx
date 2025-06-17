'use client';

import { useState, useRef, useEffect } from 'react';
import { Delaunay } from 'd3-delaunay';
import Drawing from 'dxf-writer';

interface Point {
  x: number;
  y: number;
}

interface JaggedCircle {
  center: Point;
  baseRadius: number;
  jaggedPoints: Point[];
}

export default function VoronoiDesigner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [numPoints, setNumPoints] = useState(25);
  const [showPoints, setShowPoints] = useState(false);
  const [showVoronoi, setShowVoronoi] = useState(false);
  const [showDelaunay, setShowDelaunay] = useState(false);
  const [showDoubleBorder, setShowDoubleBorder] = useState(true);
  const [borderOffset, setBorderOffset] = useState(18);
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [seed, setSeed] = useState(Date.now());
  const [randomness, setRandomness] = useState(65); // 0 = grid-like, 100 = fully random

  // Custom shape options (jagged circle)
  const [useCustomShape, setUseCustomShape] = useState(true);
  const [customCircle, setCustomCircle] = useState<JaggedCircle | null>(null);
  const [jaggedness, setJaggedness] = useState(2.5); // 0 = smooth circle, 80 = very jagged (now in whole numbers)
  const [jaggedPoints, setJaggedPoints] = useState(64); // Number of points around the circle
  const [boundarySeed, setBoundarySeed] = useState(Date.now());

  // Export options
  const [exportVoronoi, setExportVoronoi] = useState(false);
  const [exportDelaunay, setExportDelaunay] = useState(false);
  const [exportPoints, setExportPoints] = useState(false);
  const [exportDoubleBorder, setExportDoubleBorder] = useState(true);
  const [exportBoundary, setExportBoundary] = useState(true);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [circleDiameterMM, setCircleDiameterMM] = useState(100); // Diameter in millimeters

  // UI state
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [showBoundarySettings, setShowBoundarySettings] = useState(false);

  const seedFunction = (seed: number) => {
    return function () {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  // Generate random points with seeded randomization and controllable randomness
  const generateRandomPoints = (count: number, seedValue: number) => {
    // Simple seeded random number generator
    const seededRandom = seedFunction(seedValue);

    const newPoints: Point[] = [];
    const margin = 20;
    const effectiveWidth = canvasSize.width - 2 * margin;
    const effectiveHeight = canvasSize.height - 2 * margin;
    const maxAttempts = count * 10; // Prevent infinite loops
    let attempts = 0;

    // Always start with a center point
    const centerPoint: Point = {
      x: useCustomShape && customCircle ? customCircle.center.x : canvasSize.width / 2,
      y: useCustomShape && customCircle ? customCircle.center.y : canvasSize.height / 2
    };
    newPoints.push(centerPoint);

    // Convert randomness (0-100) to factor (0-1)
    const randomnessFactor = randomness / 100;

    if (randomnessFactor < 0.1) {
      // Very low randomness: Create a grid pattern with slight variations
      const remainingCount = count - 1; // Subtract 1 for the center point we already added
      const cols = Math.ceil(Math.sqrt(remainingCount * (effectiveWidth / effectiveHeight)));
      const rows = Math.ceil(remainingCount / cols);
      const cellWidth = effectiveWidth / cols;
      const cellHeight = effectiveHeight / rows;

      for (let i = 0; i < remainingCount && attempts < maxAttempts; attempts++) {
        const col = i % cols;
        const row = Math.floor(i / cols);

        const baseX = margin + col * cellWidth + cellWidth / 2;
        const baseY = margin + row * cellHeight + cellHeight / 2;

        // Add small random variation
        const variation = Math.min(cellWidth, cellHeight) * 0.2;
        const point = {
          x: baseX + (seededRandom() - 0.5) * variation,
          y: baseY + (seededRandom() - 0.5) * variation
        };

        // Check if point is within bounds and custom shape
        if (point.x >= margin && point.x <= canvasSize.width - margin &&
          point.y >= margin && point.y <= canvasSize.height - margin &&
          (!useCustomShape || isPointInCustomShape(point))) {
          newPoints.push(point);
          i++;
        }
      }
    } else {
      // Higher randomness: Blend grid and random positioning
      const remainingCount = count - 1; // Subtract 1 for the center point we already added
      const cols = Math.ceil(Math.sqrt(remainingCount * (effectiveWidth / effectiveHeight)));
      const rows = Math.ceil(remainingCount / cols);
      const cellWidth = effectiveWidth / cols;
      const cellHeight = effectiveHeight / rows;

      for (let i = 0; i < remainingCount && attempts < maxAttempts; attempts++) {
        let point: Point;

        if (seededRandom() < randomnessFactor) {
          // Fully random placement
          point = {
            x: margin + seededRandom() * effectiveWidth,
            y: margin + seededRandom() * effectiveHeight
          };
        } else {
          // Grid-based with variation
          const col = i % cols;
          const row = Math.floor(i / cols);

          const baseX = margin + col * cellWidth + cellWidth / 2;
          const baseY = margin + row * cellHeight + cellHeight / 2;

          // Variable amount of deviation based on randomness
          const maxDeviation = Math.min(cellWidth, cellHeight) * randomnessFactor;
          point = {
            x: baseX + (seededRandom() - 0.5) * maxDeviation,
            y: baseY + (seededRandom() - 0.5) * maxDeviation
          };
        }

        // Check if point is within bounds and custom shape
        if (point.x >= margin && point.x <= canvasSize.width - margin &&
          point.y >= margin && point.y <= canvasSize.height - margin &&
          (!useCustomShape || isPointInCustomShape(point))) {
          newPoints.push(point);
          i++;
        }
      }
    }

    return newPoints;
  };

  // Helper function to create inset polygon
  const createInsetPolygon = (polygon: number[][], offset: number): number[][] => {
    if (!polygon || polygon.length < 3) return polygon;

    // Calculate centroid
    const centroid = polygon.reduce(
      (acc, point) => [acc[0] + point[0], acc[1] + point[1]],
      [0, 0]
    ).map(coord => coord / polygon.length);

    // Create inset polygon by moving each vertex toward centroid
    return polygon.map(point => {
      const dx = centroid[0] - point[0];
      const dy = centroid[1] - point[1];
      const length = Math.sqrt(dx * dx + dy * dy);

      if (length === 0) return point;

      const normalizedDx = dx / length;
      const normalizedDy = dy / length;

      return [
        point[0] + normalizedDx * offset,
        point[1] + normalizedDy * offset
      ];
    });
  };



  // Helper function to check if point is inside polygon
  const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
    if (polygon.length < 3) return true;

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
        (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
        inside = !inside;
      }
    }
    return inside;
  };

  // Helper function to generate jagged circle points
  const generateJaggedCircle = (center: Point, baseRadius: number, jaggedPointCount: number, jaggedness: number, seedValue: number): Point[] => {
    // Simple seeded random number generator for consistent jagged patterns
    const seededRandom = seedFunction(seedValue);

    const jaggedPoints: Point[] = [];
    const angleStep = (2 * Math.PI) / jaggedPointCount;
    // Convert jaggedness from 0-80 scale to 0-0.8 scale for calculations
    const jaggednessFactor = jaggedness / 100;

    for (let i = 0; i < jaggedPointCount; i++) {
      const angle = i * angleStep;
      // Add random variation to the radius
      const radiusVariation = (seededRandom() - 0.5) * 2 * jaggednessFactor * baseRadius;
      const radius = baseRadius + radiusVariation;

      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);

      jaggedPoints.push({ x, y });
    }

    return jaggedPoints;
  };

  // Helper function to check if point is inside jagged circle
  const isPointInJaggedCircle = (point: Point, jaggedCircle: JaggedCircle): boolean => {
    if (jaggedCircle.jaggedPoints.length === 0) {
      // Fallback to regular circle check if no jagged points
      const dx = point.x - jaggedCircle.center.x;
      const dy = point.y - jaggedCircle.center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance <= jaggedCircle.baseRadius;
    }

    // Use polygon containment check for jagged boundary
    return isPointInPolygon(point, jaggedCircle.jaggedPoints);
  };

  // Helper function to check if point is inside custom circle
  const isPointInCustomShape = (point: Point): boolean => {
    if (customCircle) {
      return isPointInJaggedCircle(point, customCircle);
    }
    return true;
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

  // Create default circle when boundary is enabled or canvas size changes
  useEffect(() => {
    if (useCustomShape && canvasSize.width > 0 && canvasSize.height > 0) {
      // Always calculate exact center
      const centerX = canvasSize.width / 2;
      const centerY = canvasSize.height / 2;
      // Use a slightly smaller radius to ensure it fits well within canvas bounds
      const radius = Math.min(canvasSize.width, canvasSize.height) * 0.45; // 80% of smaller dimension

      const jaggedPointsArray = generateJaggedCircle(
        { x: centerX, y: centerY },
        radius,
        jaggedPoints,
        jaggedness,
        boundarySeed
      );

      setCustomCircle({
        center: { x: centerX, y: centerY },
        baseRadius: radius,
        jaggedPoints: jaggedPointsArray
      });
    }
  }, [useCustomShape, canvasSize.width, canvasSize.height, jaggedness, jaggedPoints, boundarySeed]);

  // Update jagged points when parameters change (but keep center position fixed)
  useEffect(() => {
    if (useCustomShape && customCircle) {
      // Ensure center is always perfectly centered on canvas
      const centerX = canvasSize.width / 2;
      const centerY = canvasSize.height / 2;

      const jaggedPointsArray = generateJaggedCircle(
        { x: centerX, y: centerY },
        customCircle.baseRadius,
        jaggedPoints,
        jaggedness,
        boundarySeed
      );
      setCustomCircle(prevCircle => prevCircle ? {
        ...prevCircle,
        center: { x: centerX, y: centerY }, // Always use exact center
        jaggedPoints: jaggedPointsArray
      } : null);
    }
  }, [jaggedness, jaggedPoints, boundarySeed, useCustomShape, canvasSize.width, canvasSize.height]);

  // Initialize with random points
  useEffect(() => {
    generatePattern();
  }, [numPoints, seed, canvasSize.width, canvasSize.height, useCustomShape, randomness]);

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    // Create Delaunay triangulation
    const delaunay = Delaunay.from(points.map(p => [p.x, p.y]));
    const voronoi = delaunay.voronoi([0, 0, canvasSize.width, canvasSize.height]);

    // Draw custom circle boundary
    if (useCustomShape && customCircle) {
      ctx.strokeStyle = '#059669'; // Green color for custom boundary
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]); // Dashed line

      ctx.beginPath();
      if (customCircle.jaggedPoints.length > 0) {
        // Draw jagged boundary
        ctx.moveTo(customCircle.jaggedPoints[0].x, customCircle.jaggedPoints[0].y);
        for (let i = 1; i < customCircle.jaggedPoints.length; i++) {
          ctx.lineTo(customCircle.jaggedPoints[i].x, customCircle.jaggedPoints[i].y);
        }
        ctx.closePath();
      } else {
        // Fallback to circle if no jagged points
        console.log(customCircle.baseRadius)
        ctx.arc(customCircle.center.x, customCircle.center.y, customCircle.baseRadius, 0, 2 * Math.PI);
      }
      ctx.stroke();

      ctx.setLineDash([]); // Reset line dash
    }

    // Draw Voronoi diagram
    if (showVoronoi) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      voronoi.render(ctx);
      ctx.stroke();
    }

    // Draw double border (inset Voronoi cells)
    if (showDoubleBorder) {
      ctx.strokeStyle = '#1d4ed8'; // Slightly darker blue for inner border
      ctx.lineWidth = strokeWidth;

      for (let i = 0; i < points.length; i++) {
        const cell = voronoi.cellPolygon(i);
        if (cell && cell.length > 2) {
          const insetCell = createInsetPolygon(cell, borderOffset);

          ctx.beginPath();
          ctx.moveTo(insetCell[0][0], insetCell[0][1]);
          for (let j = 1; j < insetCell.length; j++) {
            ctx.lineTo(insetCell[j][0], insetCell[j][1]);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
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
    // eslint-disable-next-line
  }, [points, showPoints, showVoronoi, showDelaunay, showDoubleBorder, borderOffset, strokeWidth, useCustomShape, customCircle]);

  // Add point on canvas click
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (!useCustomShape || (useCustomShape && isPointInCustomShape({ x, y }))) {
      // Only add points if not using custom shape, or if point is inside custom shape
      setPoints([...points, { x, y }]);
    }
  };

  // Clear custom circle
  const clearCustomShape = () => {
    setCustomCircle(null);
  };

  // Export to DXF
  const exportToDXF = () => {
    if (points.length === 0) return;

    const drawing = new Drawing();

    // Calculate scale factor to convert pixels to millimeters
    // Scale based on the custom circle diameter if it exists
    let scaleFactor = 1;
    if (useCustomShape && customCircle) {
      const currentDiameterPixels = customCircle.baseRadius * 2;
      scaleFactor = circleDiameterMM / currentDiameterPixels;
    }

    // Helper function to scale coordinates
    const scaleCoord = (coord: number) => coord * scaleFactor;

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
            drawing.drawLine(scaleCoord(start[0]), scaleCoord(start[1]), scaleCoord(end[0]), scaleCoord(end[1]));
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

        drawing.drawLine(scaleCoord(p1.x), scaleCoord(p1.y), scaleCoord(p2.x), scaleCoord(p2.y));
        drawing.drawLine(scaleCoord(p2.x), scaleCoord(p2.y), scaleCoord(p3.x), scaleCoord(p3.y));
        drawing.drawLine(scaleCoord(p3.x), scaleCoord(p3.y), scaleCoord(p1.x), scaleCoord(p1.y));
      }
    }

    // Add double border (inset Voronoi cells) to DXF
    if (exportDoubleBorder) {
      for (let i = 0; i < points.length; i++) {
        const cell = voronoi.cellPolygon(i);
        if (cell && cell.length > 2) {
          const insetCell = createInsetPolygon(cell, borderOffset);

          // Create polyline for each inset cell
          for (let j = 0; j < insetCell.length; j++) {
            const start = insetCell[j];
            const end = insetCell[(j + 1) % insetCell.length];
            drawing.drawLine(scaleCoord(start[0]), scaleCoord(start[1]), scaleCoord(end[0]), scaleCoord(end[1]));
          }
        }
      }
    }

    // Add points to DXF
    if (exportPoints) {
      points.forEach(point => {
        drawing.drawPoint(scaleCoord(point.x), scaleCoord(point.y));
      });
    }

    // Add custom circle boundary to DXF
    if (useCustomShape && customCircle && exportBoundary) {
      if (customCircle.jaggedPoints.length > 0) {
        // Draw jagged boundary as connected line segments
        for (let i = 0; i < customCircle.jaggedPoints.length; i++) {
          const current = customCircle.jaggedPoints[i];
          const next = customCircle.jaggedPoints[(i + 1) % customCircle.jaggedPoints.length];
          drawing.drawLine(scaleCoord(current.x), scaleCoord(current.y), scaleCoord(next.x), scaleCoord(next.y));
        }
      } else {
        // Fallback: Draw circle as multiple line segments for DXF compatibility
        const segments = 64; // Number of segments to approximate circle
        const angleStep = (2 * Math.PI) / segments;

        for (let i = 0; i < segments; i++) {
          const angle1 = i * angleStep;
          const angle2 = ((i + 1) % segments) * angleStep;

          const x1 = customCircle.center.x + customCircle.baseRadius * Math.cos(angle1);
          const y1 = customCircle.center.y + customCircle.baseRadius * Math.sin(angle1);
          const x2 = customCircle.center.x + customCircle.baseRadius * Math.cos(angle2);
          const y2 = customCircle.center.y + customCircle.baseRadius * Math.sin(angle2);

          drawing.drawLine(scaleCoord(x1), scaleCoord(y1), scaleCoord(x2), scaleCoord(y2));
        }
      }
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
            <h2 className="text-xl font-semibold text-gray-800">Quick Controls</h2>

            {/* Essential Controls */}
            <div className="space-y-4">
              {/* Number of Points */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Points: {numPoints}
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

              {/* Randomness */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pattern Style: {randomness}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={randomness}
                  onChange={(e) => setRandomness(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Ordered</span>
                  <span>Random</span>
                </div>
              </div>

              {/* Custom Boundary Toggle */}
              <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Custom Boundary</span>
                <input
                  type="checkbox"
                  checked={useCustomShape}
                  onChange={(e) => setUseCustomShape(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
              </label>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={randomizeSeed}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Randomize
              </button>
            </div>

            {/* Collapsible Sections */}
            <div className="space-y-3 border-t pt-4">
              {/* Display Settings */}
              <button
                onClick={() => setShowDisplaySettings(!showDisplaySettings)}
                className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <span className="text-sm font-medium text-gray-700">Display Options</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showDisplaySettings ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showDisplaySettings && (
                <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showVoronoi}
                      onChange={(e) => setShowVoronoi(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Voronoi Lines</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showDelaunay}
                      onChange={(e) => setShowDelaunay(e.target.checked)}
                      className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Delaunay Lines</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showPoints}
                      onChange={(e) => setShowPoints(e.target.checked)}
                      className="rounded border-gray-300 text-gray-600 focus:ring-gray-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Points</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showDoubleBorder}
                      onChange={(e) => setShowDoubleBorder(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Double Border</span>
                  </label>
                </div>
              )}

              {/* Boundary Settings */}
              {useCustomShape && (
                <>
                  <button
                    onClick={() => setShowBoundarySettings(!showBoundarySettings)}
                    className="w-full flex items-center justify-between p-3 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                  >
                    <span className="text-sm font-medium text-emerald-700">Boundary Settings</span>
                    <svg
                      className={`w-4 h-4 transition-transform ${showBoundarySettings ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showBoundarySettings && (
                    <div className="space-y-3 p-3 bg-emerald-50 rounded-lg">
                      <div>
                        <label className="block text-sm font-medium text-emerald-700 mb-2">
                          Jaggedness: {jaggedness}%
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="80"
                          step="1"
                          value={jaggedness}
                          onChange={(e) => setJaggedness(parseInt(e.target.value))}
                          className="w-full h-2 bg-emerald-200 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-emerald-700 mb-2">
                          Edge Detail: {jaggedPoints}
                        </label>
                        <input
                          type="range"
                          min="8"
                          max="64"
                          step="4"
                          value={jaggedPoints}
                          onChange={(e) => setJaggedPoints(parseInt(e.target.value))}
                          className="w-full h-2 bg-emerald-200 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>

                      <button
                        onClick={() => setBoundarySeed(Date.now())}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                      >
                        Randomize Boundary
                      </button>

                      {customCircle && (
                        <button
                          onClick={clearCustomShape}
                          className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                        >
                          Clear Boundary
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Advanced Settings */}
              <button
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <span className="text-sm font-medium text-gray-700">Advanced Settings</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showAdvancedSettings && (
                <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
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

                  {showDoubleBorder && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Border Offset: {borderOffset}px
                      </label>
                      <input
                        type="range"
                        min="2"
                        max="20"
                        step="1"
                        value={borderOffset}
                        onChange={(e) => setBorderOffset(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Export Options */}
              <button
                onClick={() => setShowExportOptions(!showExportOptions)}
                className="w-full flex items-center justify-between p-3 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
              >
                <span className="text-sm font-medium text-purple-700">Export to DXF</span>
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
                <div className="space-y-3 p-3 bg-purple-50 rounded-lg">
                  {useCustomShape && customCircle && (
                    <div>
                      <label className="block text-sm font-medium text-purple-700 mb-2">
                        Circle Diameter (mm)
                      </label>
                      <input
                        type="number"
                        min="10"
                        max="500"
                        step="5"
                        value={circleDiameterMM}
                        onChange={(e) => setCircleDiameterMM(parseInt(e.target.value) || 100)}
                        className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        placeholder="Enter diameter in mm"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportVoronoi}
                        onChange={(e) => setExportVoronoi(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Voronoi Lines</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportDelaunay}
                        onChange={(e) => setExportDelaunay(e.target.checked)}
                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Delaunay Lines</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportPoints}
                        onChange={(e) => setExportPoints(e.target.checked)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Points</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportDoubleBorder}
                        onChange={(e) => setExportDoubleBorder(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Double Border</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportBoundary}
                        onChange={(e) => setExportBoundary(e.target.checked)}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Boundary</span>
                    </label>
                  </div>

                  <button
                    onClick={exportToDXF}
                    disabled={points.length === 0 || (!exportVoronoi && !exportDelaunay && !exportPoints && !exportDoubleBorder && !exportBoundary)}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    Download DXF
                  </button>
                </div>
              )}
            </div>

            {/* Status Info */}
            <div className="text-xs text-gray-500 space-y-1 border-t pt-4">
              <p>• Click canvas to add points manually</p>
              <p>• {points.length} points currently placed</p>
              {customCircle && (
                <p>• Boundary: {Math.round(customCircle.baseRadius * 2)}px diameter</p>
              )}
            </div>
          </div>

          {/* Canvas */}
          <div className="lg:col-span-3 bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Pattern Preview</h2>
              <div className="text-sm text-gray-500">
                Click to add points
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
                className="bg-white w-full block cursor-crosshair"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
