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
  const [showDoubleBorder, setShowDoubleBorder] = useState(false);
  const [borderOffset, setBorderOffset] = useState(5);
  const [roundedCorners, setRoundedCorners] = useState(false);
  const [cornerRadius, setCornerRadius] = useState(3);
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [seed, setSeed] = useState(Date.now());

  // Custom shape options
  const [useCustomShape, setUseCustomShape] = useState(false);
  const [shapeType, setShapeType] = useState<'polygon' | 'circle'>('polygon');
  const [isDrawingShape, setIsDrawingShape] = useState(false);
  const [customShape, setCustomShape] = useState<Point[]>([]);
  const [customCircle, setCustomCircle] = useState<{ center: Point, radius: number } | null>(null);
  const [tempShapePoint, setTempShapePoint] = useState<Point | null>(null);
  const [isDrawingCircle, setIsDrawingCircle] = useState(false);
  const [circleCenter, setCircleCenter] = useState<Point | null>(null);

  // Export options
  const [exportVoronoi, setExportVoronoi] = useState(true);
  const [exportDelaunay, setExportDelaunay] = useState(false);
  const [exportPoints, setExportPoints] = useState(false);
  const [exportDoubleBorder, setExportDoubleBorder] = useState(false);
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
    const maxAttempts = count * 10; // Prevent infinite loops
    let attempts = 0;

    for (let i = 0; i < count && attempts < maxAttempts; attempts++) {
      const point = {
        x: margin + seededRandom() * (canvasSize.width - 2 * margin),
        y: margin + seededRandom() * (canvasSize.height - 2 * margin)
      };

      // If using custom shape, only add points inside the shape
      if (useCustomShape && ((shapeType === 'polygon' && customShape.length >= 3) || (shapeType === 'circle' && customCircle))) {
        if (isPointInCustomShape(point)) {
          newPoints.push(point);
          i++;
        }
      } else {
        newPoints.push(point);
        i++;
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

  // Helper function to create rounded polygon points
  const createRoundedPolygonPoints = (polygon: number[][], radius: number): number[][] => {
    if (!polygon || polygon.length < 3) return polygon;

    const roundedPoints: number[][] = [];
    const numSegments = 8; // Number of segments per rounded corner

    for (let i = 0; i < polygon.length; i++) {
      const current = polygon[i];
      const next = polygon[(i + 1) % polygon.length];
      const prev = polygon[(i - 1 + polygon.length) % polygon.length];

      // Calculate vectors to adjacent points
      const toPrev = [prev[0] - current[0], prev[1] - current[1]];
      const toNext = [next[0] - current[0], next[1] - current[1]];

      // Normalize vectors
      const prevLength = Math.sqrt(toPrev[0] * toPrev[0] + toPrev[1] * toPrev[1]);
      const nextLength = Math.sqrt(toNext[0] * toNext[0] + toNext[1] * toNext[1]);

      if (prevLength === 0 || nextLength === 0) {
        roundedPoints.push(current);
        continue;
      }

      const prevNorm = [toPrev[0] / prevLength, toPrev[1] / prevLength];
      const nextNorm = [toNext[0] / nextLength, toNext[1] / nextLength];

      // Calculate the effective radius (don't exceed half the edge length)
      const effectiveRadius = Math.min(radius, prevLength / 2, nextLength / 2);

      // Calculate corner points
      const cornerStart = [
        current[0] + prevNorm[0] * effectiveRadius,
        current[1] + prevNorm[1] * effectiveRadius
      ];
      const cornerEnd = [
        current[0] + nextNorm[0] * effectiveRadius,
        current[1] + nextNorm[1] * effectiveRadius
      ];

      // Create arc between corner points
      for (let j = 0; j <= numSegments; j++) {
        const t = j / numSegments;
        // Simple linear interpolation for arc approximation
        const arcPoint = [
          cornerStart[0] + (cornerEnd[0] - cornerStart[0]) * t,
          cornerStart[1] + (cornerEnd[1] - cornerStart[1]) * t
        ];

        // Apply circular arc offset toward the corner center
        const centerX = (cornerStart[0] + cornerEnd[0]) / 2;
        const centerY = (cornerStart[1] + cornerEnd[1]) / 2;
        const toCenter = [current[0] - centerX, current[1] - centerY];
        const toCenterLength = Math.sqrt(toCenter[0] * toCenter[0] + toCenter[1] * toCenter[1]);

        if (toCenterLength > 0) {
          const arcFactor = Math.sin(t * Math.PI) * 0.3; // Curve factor
          arcPoint[0] += (toCenter[0] / toCenterLength) * effectiveRadius * arcFactor;
          arcPoint[1] += (toCenter[1] / toCenterLength) * effectiveRadius * arcFactor;
        }

        roundedPoints.push(arcPoint);
      }
    }

    return roundedPoints;
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

  // Helper function to check if point is inside circle
  const isPointInCircle = (point: Point, circle: { center: Point, radius: number }): boolean => {
    const dx = point.x - circle.center.x;
    const dy = point.y - circle.center.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= circle.radius;
  };

  // Helper function to check if point is inside custom shape
  const isPointInCustomShape = (point: Point): boolean => {
    if (shapeType === 'polygon' && customShape.length >= 3) {
      return isPointInPolygon(point, customShape);
    } else if (shapeType === 'circle' && customCircle) {
      return isPointInCircle(point, customCircle);
    }
    return true;
  };

  // Helper function to clip line to polygon boundary
  const clipLineToPolygon = (start: number[], end: number[], polygon: Point[]): number[][] => {
    if (polygon.length < 3) return [start, end];

    // Simple implementation - just return the line if both endpoints are inside
    const startPoint = { x: start[0], y: start[1] };
    const endPoint = { x: end[0], y: end[1] };

    const startInside = isPointInPolygon(startPoint, polygon);
    const endInside = isPointInPolygon(endPoint, polygon);

    if (startInside && endInside) {
      return [start, end];
    } else if (!startInside && !endInside) {
      return []; // Both outside, skip line
    }

    // For now, return the line - more sophisticated clipping can be added later
    return [start, end];
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
  }, [numPoints, seed, canvasSize, useCustomShape, customShape, customCircle, shapeType]);

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    // Create Delaunay triangulation
    const delaunay = Delaunay.from(points.map(p => [p.x, p.y]));
    const voronoi = delaunay.voronoi([0, 0, canvasSize.width, canvasSize.height]);

    // Draw custom shape boundary
    if (useCustomShape) {
      ctx.strokeStyle = '#059669'; // Green color for custom boundary
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]); // Dashed line

      if (shapeType === 'polygon' && customShape.length > 0) {
        ctx.beginPath();
        ctx.moveTo(customShape[0].x, customShape[0].y);
        for (let i = 1; i < customShape.length; i++) {
          ctx.lineTo(customShape[i].x, customShape[i].y);
        }
        if (customShape.length > 2) {
          ctx.closePath();
        }
        ctx.stroke();
      } else if (shapeType === 'circle' && customCircle) {
        ctx.beginPath();
        ctx.arc(customCircle.center.x, customCircle.center.y, customCircle.radius, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.setLineDash([]); // Reset line dash
    }

    // Draw temporary shape line while drawing polygon
    if (isDrawingShape && customShape.length > 0 && tempShapePoint && shapeType === 'polygon') {
      ctx.strokeStyle = '#10b981'; // Lighter green for temp line
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.moveTo(customShape[customShape.length - 1].x, customShape[customShape.length - 1].y);
      ctx.lineTo(tempShapePoint.x, tempShapePoint.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw temporary circle while drawing
    if (isDrawingCircle && circleCenter && tempShapePoint) {
      const radius = Math.sqrt(
        Math.pow(tempShapePoint.x - circleCenter.x, 2) +
        Math.pow(tempShapePoint.y - circleCenter.y, 2)
      );

      ctx.strokeStyle = '#10b981'; // Lighter green for temp circle
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.arc(circleCenter.x, circleCenter.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
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
          let insetCell = createInsetPolygon(cell, borderOffset);

          // Apply rounding if enabled
          if (roundedCorners) {
            insetCell = createRoundedPolygonPoints(insetCell, cornerRadius);
          }

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
  }, [points, showPoints, showVoronoi, showDelaunay, showDoubleBorder, borderOffset, roundedCorners, cornerRadius, strokeWidth, useCustomShape, customShape, customCircle, shapeType, isDrawingShape, isDrawingCircle, circleCenter, tempShapePoint]);

  // Handle canvas mouse move for shape drawing
  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrawingShape || isDrawingCircle) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      setTempShapePoint({ x, y });
    }
  };

  // Add point on canvas click or handle shape drawing
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (isDrawingShape && shapeType === 'polygon') {
      const newPoint = { x, y };

      // Check if clicking near the first point to close the shape
      if (customShape.length > 2) {
        const firstPoint = customShape[0];
        const distance = Math.sqrt(Math.pow(x - firstPoint.x, 2) + Math.pow(y - firstPoint.y, 2));

        if (distance < 20) { // Close shape if within 20 pixels of start
          setIsDrawingShape(false);
          setTempShapePoint(null);
          return;
        }
      }

      setCustomShape([...customShape, newPoint]);
    } else if (isDrawingCircle && shapeType === 'circle') {
      if (!circleCenter) {
        // First click sets the center
        setCircleCenter({ x, y });
      } else {
        // Second click sets the radius and completes the circle
        const radius = Math.sqrt(Math.pow(x - circleCenter.x, 2) + Math.pow(y - circleCenter.y, 2));
        setCustomCircle({ center: circleCenter, radius });
        setIsDrawingCircle(false);
        setCircleCenter(null);
        setTempShapePoint(null);
      }
    } else if (!useCustomShape || (useCustomShape && isPointInCustomShape({ x, y }))) {
      // Only add points if not using custom shape, or if point is inside custom shape
      setPoints([...points, { x, y }]);
    }
  };

  // Clear all points
  const clearPoints = () => {
    setPoints([]);
  };

  // Start drawing custom shape
  const startDrawingShape = () => {
    if (shapeType === 'polygon') {
      setIsDrawingShape(true);
      setCustomShape([]);
    } else if (shapeType === 'circle') {
      setIsDrawingCircle(true);
      setCustomCircle(null);
      setCircleCenter(null);
    }
    setTempShapePoint(null);
  };

  // Clear custom shape
  const clearCustomShape = () => {
    setCustomShape([]);
    setCustomCircle(null);
    setIsDrawingShape(false);
    setIsDrawingCircle(false);
    setCircleCenter(null);
    setTempShapePoint(null);
  };

  // Finish drawing shape
  const finishDrawingShape = () => {
    setIsDrawingShape(false);
    setIsDrawingCircle(false);
    setCircleCenter(null);
    setTempShapePoint(null);
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

    // Add double border (inset Voronoi cells) to DXF
    if (exportDoubleBorder) {
      for (let i = 0; i < points.length; i++) {
        const cell = voronoi.cellPolygon(i);
        if (cell && cell.length > 2) {
          let insetCell = createInsetPolygon(cell, borderOffset);

          // Apply rounding if enabled
          if (roundedCorners) {
            insetCell = createRoundedPolygonPoints(insetCell, cornerRadius);
          }

          // Create polyline for each inset cell
          for (let j = 0; j < insetCell.length; j++) {
            const start = insetCell[j];
            const end = insetCell[(j + 1) % insetCell.length];
            drawing.drawLine(start[0], start[1], end[0], end[1]);
          }
        }
      }
    }

    // Add points to DXF
    if (exportPoints) {
      points.forEach(point => {
        drawing.drawPoint(point.x, point.y);
      });
    }

    // Add custom shape boundary to DXF
    if (useCustomShape && customShape.length > 2) {
      for (let i = 0; i < customShape.length; i++) {
        const start = customShape[i];
        const end = customShape[(i + 1) % customShape.length];
        drawing.drawLine(start.x, start.y, end.x, end.y);
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

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showDoubleBorder}
                  onChange={(e) => setShowDoubleBorder(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-700">Double Border</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={useCustomShape}
                  onChange={(e) => setUseCustomShape(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="ml-2 text-sm text-gray-700">Custom Boundary</span>
              </label>
            </div>

            {/* Border Offset Control */}
            {showDoubleBorder && (
              <div className="space-y-4">
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

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={roundedCorners}
                    onChange={(e) => setRoundedCorners(e.target.checked)}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Rounded Corners</span>
                </label>

                {roundedCorners && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Corner Radius: {cornerRadius}px
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={cornerRadius}
                      onChange={(e) => setCornerRadius(parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Custom Shape Controls */}
            {useCustomShape && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700">Custom Shape</h3>

                {/* Shape Type Selection */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Shape Type</label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setShapeType('polygon')}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${shapeType === 'polygon'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                      Polygon
                    </button>
                    <button
                      onClick={() => setShapeType('circle')}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${shapeType === 'circle'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                      Circle
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {!isDrawingShape && !isDrawingCircle ? (
                    <button
                      onClick={startDrawingShape}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      {shapeType === 'polygon' ? 'Draw New Polygon' : 'Draw New Circle'}
                    </button>
                  ) : (
                    <button
                      onClick={finishDrawingShape}
                      className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      Finish Drawing
                    </button>
                  )}

                  {((shapeType === 'polygon' && customShape.length > 0) || (shapeType === 'circle' && customCircle)) && (
                    <button
                      onClick={clearCustomShape}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      Clear Shape
                    </button>
                  )}
                </div>

                <div className="text-xs text-gray-500 space-y-1">
                  {isDrawingShape && shapeType === 'polygon' ? (
                    <>
                      <p>• Click to add points to your polygon</p>
                      <p>• Click near the first point to close</p>
                      <p>• Or click "Finish Drawing" when done</p>
                    </>
                  ) : isDrawingCircle && shapeType === 'circle' ? (
                    circleCenter ? (
                      <p>• Click to set the circle radius</p>
                    ) : (
                      <p>• Click to set the circle center</p>
                    )
                  ) : (shapeType === 'polygon' && customShape.length >= 3) ? (
                    <p>• Custom polygon active ({customShape.length} points)</p>
                  ) : (shapeType === 'circle' && customCircle) ? (
                    <p>• Custom circle active (radius: {Math.round(customCircle.radius)}px)</p>
                  ) : (
                    <p>• Draw a {shapeType} to constrain Voronoi generation</p>
                  )}
                </div>
              </div>
            )}

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

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportDoubleBorder}
                        onChange={(e) => setExportDoubleBorder(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Export Double Border</span>
                    </label>
                  </div>
                )}

                <button
                  onClick={exportToDXF}
                  disabled={points.length === 0 || (!exportVoronoi && !exportDelaunay && !exportPoints && !exportDoubleBorder)}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Export to DXF
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="text-xs text-gray-500 space-y-1">
              <p>• Click on the canvas to add points manually</p>
              <p>• Enable "Custom Boundary" to draw constraint shapes</p>
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
                onMouseMove={handleCanvasMouseMove}
                className={`bg-white w-full block ${isDrawingShape ? 'cursor-crosshair' : 'cursor-crosshair'
                  }`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
