/**
 * Chart.js plugin to draw semi-transparent colored bands for event markers.
 *
 * Options via chart.options.plugins.eventMarker:
 *   markers: [{ id, startTime, endTime, label, color }]
 *   showLabels: boolean — true = always show, false = show on hover only
 */

const LABEL_H = 16;
const LABEL_PAD = 4;
const LABEL_GAP = 2;

function getMarkerBounds(marker, xAxis, chartArea) {
    const startTs = new Date(marker.startTime).getTime();
    const endTs = new Date(marker.endTime).getTime();
    if (endTs < xAxis.min || startTs > xAxis.max) return null;
    const x1 = Math.max(xAxis.getPixelForValue(startTs), chartArea.left);
    const x2 = Math.min(xAxis.getPixelForValue(endTs), chartArea.right);
    if (x2 <= x1) return null;
    return { x1, x2 };
}

/**
 * Assign vertical rows to labels so overlapping bands don't stack on top of each other.
 * Returns an array of row indices (0-based) corresponding to each entry in `items`.
 */
function assignRows(items) {
    const rows = []; // rows[r] = rightmost x2 pixel placed in that row
    const result = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
        const { labelLeft, labelRight } = items[i];
        let placed = false;
        for (let r = 0; r < rows.length; r++) {
            if (labelLeft > rows[r] + LABEL_GAP) {
                rows[r] = labelRight;
                result[i] = r;
                placed = true;
                break;
            }
        }
        if (!placed) {
            result[i] = rows.length;
            rows.push(labelRight);
        }
    }
    return result;
}

function drawLabel(ctx, text, centerX, labelY, color, maxWidth) {
    if (!text) return;
    ctx.font = 'bold 11px sans-serif';

    // Truncate text if it exceeds maxWidth
    let displayText = text;
    if (maxWidth && ctx.measureText(text).width > maxWidth) {
        while (displayText.length > 1 && ctx.measureText(displayText + '...').width > maxWidth) {
            displayText = displayText.slice(0, -1);
        }
        displayText += '...';
    }

    const textWidth = ctx.measureText(displayText).width;
    const bgX = centerX - textWidth / 2 - LABEL_PAD;
    const bgY = labelY - LABEL_H / 2;
    const bgW = textWidth + LABEL_PAD * 2;

    ctx.fillStyle = color + 'CC';
    ctx.beginPath();
    ctx.roundRect(bgX, bgY, bgW, LABEL_H, 3);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayText, centerX, labelY);
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

        // Pre-compute bounds for all visible markers
        const visible = [];
        markers.forEach((marker) => {
            const bounds = getMarkerBounds(marker, xAxis, chartArea);
            if (bounds) visible.push({ marker, ...bounds });
        });

        if (visible.length === 0) return;

        // Compute label positions and assign rows to avoid overlap
        ctx.font = 'bold 11px sans-serif';
        const labelItems = visible.map(({ marker, x1, x2 }) => {
            const bandWidth = x2 - x1;
            const text = marker.label || '';
            const textWidth = Math.min(ctx.measureText(text).width, bandWidth);
            const centerX = (x1 + x2) / 2;
            const halfW = textWidth / 2 + LABEL_PAD;
            return {
                centerX,
                labelLeft: centerX - halfW,
                labelRight: centerX + halfW,
                bandWidth,
            };
        });

        const rows = assignRows(labelItems);

        ctx.save();

        visible.forEach(({ marker, x1, x2 }, i) => {
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
            const row = rows[i];
            const labelY = chartArea.top + 10 + row * (LABEL_H + LABEL_GAP);
            const centerX = labelItems[i].centerX;
            const maxWidth = labelItems[i].bandWidth - LABEL_PAD * 2;

            if (showLabels) {
                drawLabel(ctx, marker.label, centerX, labelY, marker.color, maxWidth);
            } else if (hoverX != null && hoverX >= x1 && hoverX <= x2) {
                // On hover, allow label to exceed band width for readability
                drawLabel(ctx, marker.label, centerX, labelY, marker.color, null);
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
