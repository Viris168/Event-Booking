import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTheme } from "../context/ThemeContext.jsx";
import { usd } from "../lib/format.js";

echarts.use([
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

const EN_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const EN_MONTHS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const KM_MONTHS = [
  "មករា",
  "កុម្ភៈ",
  "មីនា",
  "មេសា",
  "ឧសភា",
  "មិថុនា",
  "កក្កដា",
  "សីហា",
  "កញ្ញា",
  "តុលា",
  "វិច្ឆិកា",
  "ធ្នូ",
];

const KM_MONTHS_FULL = KM_MONTHS;

/**
 * Modern interactive chart for Organizer Dashboard using modular Apache ECharts.
 *
 * Supports switching between Revenue ($) and Bookings (#) volume, dark/light theme
 * synchronization, responsive resizing via ResizeObserver, and rich hover card tooltips.
 */
export function RevenueChart({ months = [], km = false, metric = "revenue" }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const { isDark } = useTheme();

  // Initialize and update the chart instance
  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, null, {
        renderer: "canvas",
      });
    }

    const chart = chartInstance.current;

    const textPrimary = isDark ? "#f2ece0" : "#1d1a16";
    const textMuted = isDark ? "#a39889" : "#756d61";
    const axisLineColor = isDark ? "#322c24" : "#e3ddd0";
    const gridLineColor = isDark
      ? "rgba(255, 255, 255, 0.08)"
      : "rgba(0, 0, 0, 0.06)";

    const isRevenue = metric === "revenue";

    const xLabels = months.map((m) =>
      km ? KM_MONTHS[m.month - 1] : EN_MONTHS[m.month - 1],
    );

    const seriesData = months.map((m) =>
      isRevenue ? (m.cents || 0) / 100 : m.bookings || 0,
    );

    const option = {
      animation: true,
      animationDuration: 500,
      animationEasing: "cubicOut",
      grid: {
        top: 24,
        right: 12,
        bottom: 28,
        left: isRevenue ? 52 : 36,
        containLabel: false,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark
          ? "rgba(28, 25, 21, 0.95)"
          : "rgba(255, 253, 249, 0.96)",
        borderColor: isDark ? "#322c24" : "#e3ddd0",
        borderWidth: 1,
        padding: [10, 14],
        extraCssText: isDark
          ? "box-shadow: 0 10px 25px -5px rgba(0,0,0,0.6); backdrop-filter: blur(8px); border-radius: 12px;"
          : "box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); backdrop-filter: blur(8px); border-radius: 12px;",
        axisPointer: {
          type: "shadow",
          shadowStyle: {
            color: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)",
          },
        },
        formatter: (params) => {
          const idx = params[0]?.dataIndex;
          const item = months[idx];
          if (!item) return "";
          const monthName = km
            ? KM_MONTHS_FULL[item.month - 1]
            : EN_MONTHS_FULL[item.month - 1];
          const revFormatted = usd(item.cents);
          const bookingsCount = item.bookings || 0;

          return `
            <div style="font-family: inherit; min-width: 140px;">
              <div style="font-size: 11px; font-weight: 700; color: ${textMuted}; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em;">
                ${monthName} ${item.year}
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 4px;">
                <span style="font-size: 12px; color: ${textMuted}; display: inline-flex; align-items: center; gap: 6px;">
                  <span style="width: 7px; height: 7px; border-radius: 50%; background: #45b183; display: inline-block;"></span>
                  ${km ? "ចំណូល" : "Revenue"}
                </span>
                <span style="font-size: 13px; font-weight: 700; color: ${textPrimary};">
                  ${revFormatted}
                </span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px;">
                <span style="font-size: 12px; color: ${textMuted}; display: inline-flex; align-items: center; gap: 6px;">
                  <span style="width: 7px; height: 7px; border-radius: 50%; background: #e07b39; display: inline-block;"></span>
                  ${km ? "ការកក់" : "Bookings"}
                </span>
                <span style="font-size: 13px; font-weight: 700; color: ${textPrimary};">
                  ${bookingsCount.toLocaleString()}
                </span>
              </div>
            </div>
          `;
        },
      },
      xAxis: {
        type: "category",
        data: xLabels,
        axisTick: { show: false },
        axisLine: {
          lineStyle: {
            color: axisLineColor,
          },
        },
        axisLabel: {
          color: textMuted,
          fontSize: 11,
          fontWeight: 500,
          margin: 10,
        },
      },
      yAxis: {
        type: "value",
        splitLine: {
          lineStyle: {
            type: "dashed",
            color: gridLineColor,
          },
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: textMuted,
          fontSize: 11,
          fontWeight: 500,
          formatter: (val) => {
            if (isRevenue) {
              if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
              if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
              return `$${val}`;
            }
            return val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`;
          },
        },
      },
      series: [
        {
          name: isRevenue
            ? km
              ? "ចំណូល"
              : "Revenue"
            : km
              ? "ការកក់"
              : "Bookings",
          type: "bar",
          barMaxWidth: 28,
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            color: isRevenue
              ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "#45b183" },
                  { offset: 1, color: isDark ? "#0d4a2d" : "#12613c" },
                ])
              : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "#f59e0b" },
                  { offset: 1, color: isDark ? "#78350f" : "#b45309" },
                ]),
          },
          emphasis: {
            itemStyle: {
              color: isRevenue
                ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: "#68d391" },
                    { offset: 1, color: isDark ? "#157e4e" : "#166534" },
                  ])
                : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: "#fbbf24" },
                    { offset: 1, color: isDark ? "#92400e" : "#d97706" },
                  ]),
              shadowBlur: 10,
              shadowColor: isRevenue
                ? "rgba(69, 177, 131, 0.4)"
                : "rgba(245, 158, 11, 0.4)",
            },
          },
          data: seriesData,
        },
      ],
    };

    chart.setOption(option, true);
  }, [months, metric, isDark, km]);

  // Responsive resize
  useEffect(() => {
    if (!chartRef.current) return;

    const ro = new ResizeObserver(() => {
      chartInstance.current?.resize();
    });
    ro.observe(chartRef.current);

    return () => {
      ro.disconnect();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  return (
    <div className="w-full flex-1 min-h-[190px]">
      <div className="w-full h-full min-h-[190px]" ref={chartRef} />
    </div>
  );
}
