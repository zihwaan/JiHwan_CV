'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export const SearchStock = () => {
  const [code, setCode] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (code) {
      router.push(`/stock/${code}`);
    }
  };

  return (
    <form onSubmit={handleSearch} className="relative w-full max-w-md mx-auto">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter Stock Code (e.g. 005930)"
        className="w-full bg-surface border border-gray-700 rounded-full py-3 px-5 pl-12 text-white focus:outline-none focus:border-primary-mint transition-colors"
      />
      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
      <button type="submit" className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-primary-mint text-black font-bold py-1 px-4 rounded-full text-sm hover:bg-white transition-colors">
        GO
      </button>
    </form>
  );
};
