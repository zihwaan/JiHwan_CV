'use client';

import { useEffect, useState } from 'react';
import { SearchStock } from '@/components/SearchStock';
import { TrendingUp, Wallet, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface BalanceData {
  output1: any[]; // Account balance details
  output2: any[]; // Total balance
  rt_cd: string;
  msg1: string;
}

export default function Home() {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await fetch('/api/kis/balance');
        const data = await res.json();
        if (data.rt_cd === '0') {
          setBalance(data);
        }
      } catch (error) {
        console.error('Failed to fetch balance', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
  }, []);

  const totalAsset = balance?.output2?.[0]?.tot_evlu_amt || '0';
  const totalPL = balance?.output2?.[0]?.evlu_pfls_smtl_amt || '0';

  return (
    <main className="flex flex-col min-h-screen p-6 max-w-4xl mx-auto">
      <header className="flex justify-between items-center mb-12 mt-4">
        <h1 className="text-2xl font-black tracking-tighter text-white">
          ZIHWAN<span className="text-primary-mint">.MONEY</span>
        </h1>
        <button 
          onClick={() => window.Kakao?.Auth?.login({ success: () => alert('Logged in!') })}
          className="bg-[#FEE500] text-[#000000] px-4 py-2 rounded-md text-sm font-bold"
        >
          Kakao Login
        </button>
      </header>

      <div className="flex-1 flex flex-col gap-12">
        <section className="text-center space-y-6">
          <h2 className="text-4xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
            Invest in Future.
          </h2>
          <SearchStock />
        </section>

        <section className="bg-surface rounded-2xl p-6 border border-gray-800">
          <div className="flex items-center gap-2 mb-4 text-primary-mint">
            <Wallet size={24} />
            <h3 className="font-bold text-lg">My Assets</h3>
          </div>

          {loading ? (
            <div className="animate-pulse h-20 bg-gray-800 rounded-lg"></div>
          ) : (
            <div>
              <div className="text-4xl font-bold mb-2">
                ₩ {parseInt(totalAsset).toLocaleString()}
              </div>
              <div className={`text-lg font-medium ${parseInt(totalPL) >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                {parseInt(totalPL) >= 0 ? '+' : ''}{parseInt(totalPL).toLocaleString()} 
                <span className="text-gray-500 ml-2 text-sm">Total P/L</span>
              </div>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-gray-400" />
            <span>Market Movers</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Placeholder for market movers */}
            <div className="bg-surface p-4 rounded-xl border border-gray-800 flex justify-between items-center hover:border-primary-mint transition-colors cursor-pointer group">
               <div>
                  <div className="font-bold">Samsung Electronics</div>
                  <div className="text-sm text-gray-500">005930</div>
               </div>
               <ArrowRight className="text-gray-600 group-hover:text-primary-mint" />
            </div>
            <div className="bg-surface p-4 rounded-xl border border-gray-800 flex justify-between items-center hover:border-primary-mint transition-colors cursor-pointer group">
               <div>
                  <div className="font-bold">SK Hynix</div>
                  <div className="text-sm text-gray-500">000660</div>
               </div>
               <ArrowRight className="text-gray-600 group-hover:text-primary-mint" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}