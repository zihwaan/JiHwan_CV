'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { StockChart } from '@/components/StockChart';
import { ArrowLeft, RefreshCcw, Sparkles } from 'lucide-react';
import Link from 'next/link';

// Declare Kakao on window
declare global {
  interface Window {
    Kakao: any;
  }
}

interface PriceData {
  stck_prpr: string; // Current Price
  prdy_vrss: string; // Change
  prdy_ctrt: string; // Change Rate
  acml_vol: string;  // Volume
  stck_shrn_iscd: string;
}

export default function StockDetail() {
  const params = useParams();
  const code = params.code as string;
  
  const [price, setPrice] = useState<PriceData | null>(null);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [priceRes, dailyRes] = await Promise.all([
        fetch(`/api/kis/price?code=${code}`),
        fetch(`/api/kis/daily?code=${code}&period=D`)
      ]);

      const priceJson = await priceRes.json();
      const dailyJson = await dailyRes.json();

      setPrice(priceJson);
      setDailyData(dailyJson);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (code) {
      fetchData();
    }
  }, [code]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-mint"></div>
      </div>
    );
  }

  const isUp = parseInt(price?.prdy_vrss || '0') > 0;
  const colorClass = isUp ? 'text-red-500' : 'text-blue-500'; // Korea: Red is Up

  return (
    <div className="min-h-screen bg-black text-white p-6 pb-20 max-w-4xl mx-auto">
      <nav className="flex items-center justify-between mb-8">
        <Link href="/" className="p-2 bg-surface rounded-full hover:bg-gray-800 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="font-bold text-lg">{code}</div>
        <button onClick={fetchData} className="p-2 bg-surface rounded-full hover:bg-gray-800 transition-colors">
          <RefreshCcw size={20} />
        </button>
      </nav>

      <header className="mb-8">
        <h1 className="text-4xl font-black mb-2 tracking-tight">
          {parseInt(price?.stck_prpr || '0').toLocaleString()} <span className="text-lg text-gray-400">KRW</span>
        </h1>
        <div className={`text-xl font-medium flex items-center gap-2 ${colorClass}`}>
          {parseInt(price?.prdy_vrss || '0') > 0 ? '+' : ''}
          {parseInt(price?.prdy_vrss || '0').toLocaleString()} 
          <span>({price?.prdy_ctrt}%)</span>
        </div>
      </header>

      <section className="mb-8 bg-surface border border-gray-800 rounded-2xl overflow-hidden p-4">
        <StockChart data={dailyData} />
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-primary-mint">
          <Sparkles size={20} />
          <h2 className="font-bold text-xl">AI Agent Analysis</h2>
        </div>
        
        <div className="bg-surface-highlight p-6 rounded-xl border border-gray-800 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary-mint"></div>
            <p className="text-gray-300 leading-relaxed">
              Based on the technical indicators from the last 30 days, 
              <span className="font-bold text-white"> {code} </span> 
              shows a <span className="text-primary-mint font-bold">Neutral</span> trend. 
              The moving averages suggest a potential consolidation phase. 
              Please verify fundamental data before making trading decisions.
            </p>
            <div className="mt-4 text-xs text-gray-500 flex justify-between items-center">
              <span>Analysis by Gemini Agent</span>
              <span>Updated just now</span>
            </div>
        </div>
      </section>

      <div className="fixed bottom-0 left-0 w-full p-4 bg-black/80 backdrop-blur-md border-t border-gray-800 flex justify-center gap-4">
        <button className="flex-1 max-w-[200px] bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors">
          Sell
        </button>
        <button className="flex-1 max-w-[200px] bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-colors">
          Buy
        </button>
      </div>
    </div>
  );
}
