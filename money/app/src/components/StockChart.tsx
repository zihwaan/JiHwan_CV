'use client';

import { createChart, ColorType, IChartApi, CandlestickSeries } from 'lightweight-charts';
import React, { useEffect, useRef } from 'react';

interface ChartData {
  stck_bsop_date: string;
  stck_oprc: string;
  stck_hgpr: string;
  stck_lwpr: string;
  stck_clpr: string;
  acml_vol: string;
}

interface Props {
  data: ChartData[];
  colors?: {
    backgroundColor?: string;
    lineColor?: string;
    textColor?: string;
    areaTopColor?: string;
    areaBottomColor?: string;
  };
}

export const StockChart: React.FC<Props> = ({ data, colors = {} }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      chartRef.current?.applyOptions({ width: chartContainerRef.current!.clientWidth });
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: colors.backgroundColor || 'transparent' },
        textColor: colors.textColor || 'white',
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
      grid: {
        vertLines: { color: '#333' },
        horzLines: { color: '#333' },
      },
    });
    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ff4d4d', // Red for up in Korea? Actually usually Red is UP in Korea.
      downColor: '#4d79ff', // Blue for down in Korea.
      borderVisible: false,
      wickUpColor: '#ff4d4d',
      wickDownColor: '#4d79ff',
    });

    // Process data: Sort by date ascending
    const sortedData = [...data].reverse().map(item => ({
      time: `${item.stck_bsop_date.substring(0, 4)}-${item.stck_bsop_date.substring(4, 6)}-${item.stck_bsop_date.substring(6, 8)}`,
      open: parseFloat(item.stck_oprc),
      high: parseFloat(item.stck_hgpr),
      low: parseFloat(item.stck_lwpr),
      close: parseFloat(item.stck_clpr),
    }));

    candlestickSeries.setData(sortedData);

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, colors]);

  return (
    <div ref={chartContainerRef} className="w-full h-[300px]" />
  );
};
