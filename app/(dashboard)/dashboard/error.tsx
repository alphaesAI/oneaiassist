'use client';

import React from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-4">
        <span className="material-symbols-outlined text-rose-600 text-2xl">
          error
        </span>
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">
        Unable to load dashboard data
      </h2>
      <p className="text-sm text-gray-500 max-w-md mb-6">
        {error.message || 'A network error occurred while contacting the database.'}
      </p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-[#004ac6] text-white text-sm font-semibold rounded-lg hover:bg-[#003da8] transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}
