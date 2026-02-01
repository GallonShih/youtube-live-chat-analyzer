import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { CloudIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';

/**
 * Dynamic Word Cloud Component with Physics Engine
 *
 * Features:
 * - Physics-based layout using d3-force
 * - Custom rectangular collision detection
 * - Real-time parameter tuning UI
 * - Smooth variable speed animations
 * - Auto-resize support via ResizeObserver
 */
function DynamicWordCloud({ words, wordLimit = 30 }) {
    const containerRef = useRef(null);
    const svgRef = useRef(null);
    const simulationRef = useRef(null);
    const nodesRef = useRef([]);

    // Dynamic container dimensions
    const [dimensions, setDimensions] = useState({ width: 900, height: 500 });

    // ResizeObserver for dynamic sizing
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    setDimensions({ width: Math.floor(width), height: Math.floor(height) });
                }
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const { width, height } = dimensions;

    // Physics Parameters State
    const [configs, setConfigs] = useState({
        damping: 0.80,
        growth: 0.02,
        tightness: 1.2,
        shapeFactor: 0.5,
        padding: 15,
        repulsion: 60,
        verticalProb: 0.3,
        playSpeed: 1200
    });

    const [showControls, setShowControls] = useState(false);

    // Font scale state (moved from parent for easy tuning)
    const [fontScale, setFontScale] = useState(1);

    // Color palette - expanded with richer, more vibrant colors
    const colorPalette = useMemo(() => [
        '#5470C6', '#91CC75', '#FAC858', '#EE6666', '#73C0DE',
        '#3BA272', '#FC8452', '#9A60B4', '#EA7CCC', '#48B8D0',
        '#6E7074', '#546570', '#C23531', '#2F4554', '#61A0A8',
        '#D48265', '#749F83', '#CA8622', '#BDA29A', '#6E7074',
        '#C4CCD3', '#F9C74F', '#90BE6D', '#43AA8B', '#577590',
        '#F94144', '#F3722C', '#F8961E', '#F9844A', '#277DA1'
    ], []);

    // Color hashing function
    const getWordColor = useCallback((word) => {
        let hash = 0;
        for (let i = 0; i < word.length; i++) {
            hash = word.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colorPalette[Math.abs(hash) % colorPalette.length];
    }, [colorPalette]);

    // Canvas for text measuring
    const measureCtx = useMemo(() => {
        const canvas = document.createElement("canvas");
        return canvas.getContext("2d");
    }, []);

    const getTextMetrics = useCallback((text, size) => {
        if (!measureCtx) return { width: 0, height: 0 };
        measureCtx.font = `900 ${size}px 'Noto Sans TC', sans-serif`;
        const metrics = measureCtx.measureText(text);
        // Use full size for height to ensure ascenders/descenders are covered
        return { width: metrics.width, height: size };
    }, [measureCtx]);

    // Custom rectangular collision force
    const rectCollide = useCallback(() => {
        const nodes = nodesRef.current;
        const padding = configs.padding;

        return (alpha) => {
            const quadtree = d3.quadtree()
                .x(d => d.x)
                .y(d => d.y)
                .addAll(nodes);

            for (const d of nodes) {
                if (d.size < 1) continue;
                const m = getTextMetrics(d.text, d.size);

                let w = (d.rotate === 90 ? m.height : m.width) / 2 + padding;
                let h = (d.rotate === 90 ? m.width : m.height) / 2 + padding;

                const x1 = d.x - w, x2 = d.x + w, y1 = d.y - h, y2 = d.y + h;

                quadtree.visit((node, x1b, y1b, x2b, y2b) => {
                    if (!node.length) {
                        do {
                            if (node.data !== d && node.data.size > 1) {
                                const d2 = node.data;
                                const m2 = getTextMetrics(d2.text, d2.size);
                                let w2 = (d2.rotate === 90 ? m2.height : m2.width) / 2 + padding;
                                let h2 = (d2.rotate === 90 ? m2.width : m2.height) / 2 + padding;

                                const dx = d.x - d2.x, dy = d.y - d2.y;
                                const adx = Math.abs(dx), ady = Math.abs(dy);
                                const minW = w + w2, minH = h + h2;

                                if (adx < minW && ady < minH) {
                                    const overlapX = minW - adx, overlapY = minH - ady;
                                    const strength = alpha * 0.5; // Collision strength

                                    if (overlapX < overlapY) {
                                        const sx = (dx > 0 ? 1 : -1) * overlapX * strength;
                                        d.x += sx;
                                        d2.x -= sx;
                                    } else {
                                        const sy = (dy > 0 ? 1 : -1) * overlapY * strength;
                                        d.y += sy;
                                        d2.y -= sy;
                                    }
                                }
                            }
                        } while (node = node.next);
                    }
                    return x1b > x2 || x2b < x1 || y1b > y2 || y2b < y1;
                });
            }
        };
    }, [configs.padding, getTextMetrics]);

    // Simulation Setup
    useEffect(() => {
        if (!containerRef.current) return;

        // Setup SVG
        const svg = d3.select(containerRef.current)
            .selectAll('svg')
            .data([null])
            .join('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${width} ${height}`)
            .style('font-family', 'Noto Sans TC, sans-serif');

        const g = svg.selectAll('g').data([null]).join('g');
        svgRef.current = g;

        // Setup Simulation
        const simulation = d3.forceSimulation(nodesRef.current)
            .velocityDecay(configs.damping)
            // Reduce centering force strongly to allow filling corners (Gas-like behavior with walls)
            .force("x", d3.forceX(width / 2).strength(d => configs.tightness * 0.005 * configs.shapeFactor))
            .force("y", d3.forceY(height / 2).strength(d => configs.tightness * 0.005))
            // Stronger repulsion to push words into corners
            .force("charge", d3.forceManyBody().strength(-configs.repulsion))
            .force("rectCollide", rectCollide())
            .on("tick", ticked);

        simulationRef.current = simulation;

        function ticked() {
            // Growth and boundary logic
            nodesRef.current.forEach(d => {
                if (typeof d.size === 'undefined') d.size = 0;
                d.size += (d.targetSize - d.size) * configs.growth;

                const m = getTextMetrics(d.text, d.size);
                // Extra safety margin for boundary
                const safety = 5;
                const w = (d.rotate === 90 ? m.height : m.width) / 2 + safety;
                const h = (d.rotate === 90 ? m.width : m.height) / 2 + safety;

                // Strict boundary clamping
                // Ensure words never go outside the visible area
                if (d.x < w) d.x = w;
                if (d.x > width - w) d.x = width - w;
                if (d.y < h) d.y = h;
                if (d.y > height - h) d.y = height - h;
            });

            // Only update positions in tick
            svgRef.current.selectAll("text")
                .attr("transform", d => `translate(${d.x},${d.y}) rotate(${d.rotate || 0})`)
                .style("font-size", d => `${d.size}px`)
                .style("opacity", d => d.size > 5 ? 1 : 0);
        }

        return () => {
            simulation.stop();
        };
    }, [width, height, rectCollide, configs.damping, configs.growth, configs.shapeFactor, configs.tightness, getTextMetrics]);

    // Update Data
    useEffect(() => {
        if (!words || !svgRef.current) return;

        const activeWordNames = new Set(words.map(w => w.word));

        // Filter out removed nodes
        const currentNodes = nodesRef.current.filter(n => activeWordNames.has(n.id));

        // Add new nodes or update existing target sizes
        words.forEach(w => {
            let node = currentNodes.find(n => n.id === w.word);

            // Calculate target size
            const maxSize = Math.max(...words.map(item => item.size), 1);
            const minSize = Math.min(...words.map(item => item.size), 0);
            const sizeRange = maxSize - minSize || 1;
            const normalized = (w.size - minSize) / sizeRange;
            const targetFontSize = Math.floor((12 + normalized * 48) * fontScale); // 12-60px base, scaled

            if (!node) {
                // Spawn new node with SAFE bounds (within 80% of width)
                const rx = (Math.random() - 0.5) * (width * 0.8);
                const ry = (Math.random() - 0.5) * (height * 0.8);

                node = {
                    id: w.word,
                    text: w.word,
                    x: width / 2 + rx,
                    y: height / 2 + ry,
                    size: 0,
                    targetSize: targetFontSize,
                    rotate: Math.random() < configs.verticalProb ? 90 : 0,
                    vx: 0,
                    vy: 0
                };
                currentNodes.push(node);
            } else {
                node.targetSize = targetFontSize;
            }
        });

        nodesRef.current = currentNodes;

        // Perform D3 Data Join ONLY here
        const selection = svgRef.current.selectAll("text")
            .data(nodesRef.current, d => d.id);

        selection.join(
            enter => enter.append("text")
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .style("opacity", 0)
                .style("font-weight", "900")
                .style("cursor", "default")
                .text(d => d.text)
                .attr("transform", d => `translate(${width / 2},${height / 2}) scale(0)`)
                .style("fill", d => getWordColor(d.text)),
            update => update,
            exit => exit.remove()
        )
            .style("fill", d => getWordColor(d.text))
            .style("transition", "fill 0.6s ease");

        if (simulationRef.current) {
            simulationRef.current.nodes(nodesRef.current);
            simulationRef.current.alpha(0.3).restart();
        }
    }, [words, width, height, configs.verticalProb, fontScale, getWordColor]);


    // Helper for UI sliders
    const ControlData = [
        { id: 'damping', label: '物理阻尼 (Damping)', min: 0.1, max: 0.9, step: 0.05 },
        { id: 'growth', label: '演進速度 (Growth)', min: 0.02, max: 0.3, step: 0.01 },
        { id: 'tightness', label: '向心強度 (Tightness)', min: 0.2, max: 3.0, step: 0.1 },
        { id: 'shapeFactor', label: '扁平率 (X/Y Ratio)', min: 0.1, max: 2.0, step: 0.1 },
        { id: 'padding', label: '碰撞間距 (Padding)', min: 0, max: 30, step: 1 },
        { id: 'repulsion', label: '排斥力 (Repulsion)', min: 10, max: 150, step: 5 },
    ];

    // Empty State
    if (!words || words.length === 0) {
        return (
            <div className="relative bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex items-center justify-center h-full w-full">
                <div className="text-gray-400 text-center">
                    <CloudIcon className="w-16 h-16 mx-auto mb-2" />
                    <div>載入資料後顯示動態文字雲</div>
                </div>
            </div>
        )
    }

    return (
        <div className="relative group h-full w-full overflow-visible">
            {/* Canvas Container */}
            <div
                ref={containerRef}
                className="bg-slate-50 rounded-2xl overflow-hidden shadow-inner border border-slate-200 h-full w-full"
            />

            {/* Toggle Controls Button */}
            <button
                onClick={() => setShowControls(!showControls)}
                className="absolute top-4 right-4 bg-white/80 hover:bg-white p-2 rounded-lg shadow-sm backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 z-10 cursor-pointer"
                title="調整參數"
            >
                <Cog6ToothIcon className="w-5 h-5 text-gray-600" />
            </button>

            {/* Controls Panel */}
            {showControls && (
                <div
                    className="absolute top-16 right-4 w-64 bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-2xl border border-slate-100 z-[100] text-sm"
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold text-slate-700">🔧 物理參數</h4>
                        <button onClick={() => setConfigs({
                            damping: 0.80, growth: 0.02, tightness: 1.2, shapeFactor: 0.5, padding: 15, repulsion: 60, verticalProb: 0.3, playSpeed: 1200
                        })} className="text-xs text-blue-500 hover:text-blue-700">重置</button>
                    </div>

                    <div className="space-y-3">
                        {ControlData.map(ctrl => (
                            <div key={ctrl.id}>
                                <div className="flex justify-between text-xs text-slate-500 mb-1">
                                    <span>{ctrl.label}</span>
                                    <span className="font-mono">{configs[ctrl.id]}</span>
                                </div>
                                <input
                                    type="range"
                                    min={ctrl.min}
                                    max={ctrl.max}
                                    step={ctrl.step}
                                    value={configs[ctrl.id]}
                                    onChange={(e) => {
                                        setConfigs(prev => ({ ...prev, [ctrl.id]: Number(e.target.value) }));
                                        if (simulationRef.current) simulationRef.current.alpha(0.3).restart();
                                    }}
                                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                            </div>
                        ))}
                        <div>
                            <div className="flex justify-between text-xs text-slate-500 mb-1">
                                <span>垂直比例 (Vertical %)</span>
                                <span className="font-mono">{Math.round(configs.verticalProb * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                value={configs.verticalProb * 100}
                                onChange={(e) => setConfigs(prev => ({ ...prev, verticalProb: Number(e.target.value) / 100 }))}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>
                        <div>
                            <div className="flex justify-between text-xs text-slate-500 mb-1">
                                <span>文字大小 (Font Scale)</span>
                                <span className="font-mono">{fontScale.toFixed(1)}x</span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="2"
                                step="0.1"
                                value={fontScale}
                                onChange={(e) => setFontScale(Number(e.target.value))}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DynamicWordCloud;
