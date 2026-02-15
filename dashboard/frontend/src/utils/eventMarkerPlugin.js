/**
 * Chart.js plugin to draw semi-transparent colored bands for event markers.
 *
 * Options via chart.options.plugins.eventMarker:
 *   markers: [{ id, startTime, endTime, label, color }]
 *   showLabels: boolean — true = always show, false = show on hover only
 */

function getMarkerBounds(marker, xAxis, chartArea) {
    const startTs = new Date(marker.startTime).getTime();
    const endTs = new Date(marker.endTime).getTime();
    if (endTs < xAxis.min || startTs > xAxis.max) return null;
    const x1 = Math.max(xAxis.getPixelForValue(startTs), chartArea.left);
    const x2 = Math.min(xAxis.getPixelForValue(endTs), chartArea.right);
    if (x2 <= x1) return null;
    return { x1, x2 };
}

function drawLabel(ctx, text, centerX, labelY, color) {
    if (!text) return;
    ctx.font = 'bold 11px sans-serif';
    const textWidth = ctx.measureText(text).width;
    const padding = 4;
    const bgX = centerX - textWidth / 2 - padding;
    const bgY = labelY - 10;
    const bgW = textWidth + padding * 2;
    const bgH = 16;

    ctx.fillStyle = color + 'CC';
    ctx.beginPath();
    ctx.roundRect(bgX, bgY, bgW, bgH, 3);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, centerX, labelY - 2);
}

const eventMarkerPlugin = {
    id: 'eventMarker',

    afterDraw(chart) {
        const opts = chart.options?.plugins?.eventMarker;
        const markers = opts?.markers;
        if (!markers || markers.length === 0) return;

        const showLabels = opts?.showLabels ?? true;
        const ctx = chart.ctx;
        const xAxis = chart.scales.x;
        if (!xAxis) return;

        const chartArea = chart.chartArea;
        const hoverX = chart._eventMarkerHoverX;

        ctx.save();

        markers.forEach((marker, i) => {
            const bounds = getMarkerBounds(marker, xAxis, chartArea);
            if (!bounds) return;
            const { x1, x2 } = bounds;

            // Draw semi-transparent band
            ctx.fillStyle = marker.color + '33';
            ctx.fillRect(x1, chartArea.top, x2 - x1, chartArea.bottom - chartArea.top);

            // Draw left and right border lines
            ctx.strokeStyle = marker.color + '99';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(x1, chartArea.top);
            ctx.lineTo(x1, chartArea.bottom);
            ctx.moveTo(x2, chartArea.top);
            ctx.lineTo(x2, chartArea.bottom);
            ctx.stroke();
            ctx.setLineDash([]);

            // Label
            const centerX = (x1 + x2) / 2;
            const labelY = chartArea.top + 16 + i * 20;
            if (showLabels) {
                drawLabel(ctx, marker.label, centerX, labelY, marker.color);
            } else if (hoverX != null && hoverX >= x1 && hoverX <= x2) {
                drawLabel(ctx, marker.label, centerX, labelY, marker.color);
            }
        });

        ctx.restore();
    },

    afterEvent(chart, args) {
        const opts = chart.options?.plugins?.eventMarker;
        if (!opts?.markers?.length || opts?.showLabels) return;

        const event = args.event;
        if (event.type === 'mousemove') {
            const x = event.x;
            const chartArea = chart.chartArea;
            if (x >= chartArea.left && x <= chartArea.right &&
                event.y >= chartArea.top && event.y <= chartArea.bottom) {
                chart._eventMarkerHoverX = x;
            } else {
                chart._eventMarkerHoverX = null;
            }
            chart.draw();
        } else if (event.type === 'mouseout') {
            chart._eventMarkerHoverX = null;
            chart.draw();
        }
    },
};

export default eventMarkerPlugin;
