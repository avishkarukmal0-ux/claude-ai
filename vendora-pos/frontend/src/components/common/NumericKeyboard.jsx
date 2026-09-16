import React, { useState } from 'react';
import { Delete, Check } from 'lucide-react';

export default function NumericKeyboard({ value = '', onValueChange, onDone, maxLength = 6, decimal = true, label = '' }) {
  const [display, setDisplay] = useState(String(value));

  const handleNumber = (num) => {
    if (display.length >= maxLength) return;
    const newVal = display === '0' ? String(num) : display + String(num);
    setDisplay(newVal);
  };

  const handleDecimal = () => {
    if (!decimal || display.includes('.')) return;
    setDisplay(display === '' ? '0.' : display + '.');
  };

  const handleBackspace = () => {
    setDisplay(display.length > 1 ? display.slice(0, -1) : '0');
  };

  const handleClear = () => {
    setDisplay('0');
  };

  const handleDone = () => {
    const numVal = parseFloat(display) || 0;
    onValueChange(numVal);
    onDone();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 p-4 z-50 md:relative md:mt-4 md:border-0 md:bg-gray-50 md:rounded-lg">
      {label && <p className="text-xs text-gray-500 mb-2">{label}</p>}

      <input
        type="text"
        readOnly
        value={display}
        className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 mb-3 text-right text-lg font-semibold bg-white"
      />

      <div className="grid grid-cols-4 gap-2">
        {[7, 8, 9].map(n => (
          <button key={n} onClick={() => handleNumber(n)} className="bg-blue-100 text-blue-700 font-bold py-3 rounded-lg hover:bg-blue-200 active:bg-blue-300">
            {n}
          </button>
        ))}
        <button onClick={handleBackspace} className="bg-red-100 text-red-700 font-bold py-3 rounded-lg hover:bg-red-200 active:bg-red-300">
          ←
        </button>

        {[4, 5, 6].map(n => (
          <button key={n} onClick={() => handleNumber(n)} className="bg-blue-100 text-blue-700 font-bold py-3 rounded-lg hover:bg-blue-200 active:bg-blue-300">
            {n}
          </button>
        ))}
        <button onClick={handleClear} className="bg-orange-100 text-orange-700 font-bold py-3 rounded-lg hover:bg-orange-200 active:bg-orange-300">
          C
        </button>

        {[1, 2, 3].map(n => (
          <button key={n} onClick={() => handleNumber(n)} className="bg-blue-100 text-blue-700 font-bold py-3 rounded-lg hover:bg-blue-200 active:bg-blue-300">
            {n}
          </button>
        ))}
        <button onClick={() => {}} className="bg-gray-100 text-gray-400 py-3 rounded-lg" disabled>

        </button>

        {decimal && (
          <button onClick={handleDecimal} className="bg-blue-100 text-blue-700 font-bold py-3 rounded-lg hover:bg-blue-200 active:bg-blue-300">
            .
          </button>
        )}
        <button onClick={() => handleNumber(0)} className="bg-blue-100 text-blue-700 font-bold py-3 rounded-lg hover:bg-blue-200 active:bg-blue-300">
          0
        </button>
        <button onClick={handleDone} className="col-span-2 bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 active:bg-green-800 flex items-center justify-center gap-2">
          <Check size={16} /> Done
        </button>
      </div>
    </div>
  );
}
